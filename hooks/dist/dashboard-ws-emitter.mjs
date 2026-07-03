// src/dashboard-ws-emitter.ts
import { readFileSync } from "fs";
import http from "http";
import { createHash } from "crypto";
function detectRealError(toolResponse) {
  if (toolResponse === null || toolResponse === void 0) return false;
  if (typeof toolResponse === "object") {
    const obj = toolResponse;
    if (obj.is_error === true) return true;
    if (obj.error && typeof obj.error === "string" && obj.error.length > 0) return true;
    if (typeof obj.exit_code === "number" && obj.exit_code !== 0) return true;
  }
  const responseStr = typeof toolResponse === "string" ? toolResponse : JSON.stringify(toolResponse);
  if (!responseStr || responseStr === '""' || responseStr === "{}") return false;
  const realErrorPatterns = [
    /^Error:/m,
    // Satir basinda "Error:"
    /^Uncaught\s+\w+Error/m,
    // Uncaught TypeError, ReferenceError, ...
    /\bTraceback\s+\(most recent call/,
    // Python traceback
    /^\s*at\s+\S+\s+\([^)]+:\d+:\d+\)/m,
    // JS stack trace
    /"is_error"\s*:\s*true/,
    // JSON is_error
    /\bexit\s+code\s+[^0]\b/i,
    // Non-zero exit code
    /\b(EACCES|ENOENT|EADDRINUSE|ETIMEDOUT)\b/,
    // Node errno
    /Permission denied/,
    /Command failed/,
    /Process exited with code [^0]/
  ];
  return realErrorPatterns.some((re) => re.test(responseStr));
}
function extractAgentInfo(input) {
  const ti = input.tool_input;
  if (input.tool_name === "Agent" || input.tool_name === "Task") {
    const agentType = ti.subagent_type || ti.type || "unknown";
    const prompt = ti.description || ti.prompt || "";
    const promptSummary = typeof prompt === "string" ? prompt.slice(0, 120) : "";
    const responseStr = typeof input.tool_response === "string" ? input.tool_response : JSON.stringify(input.tool_response || "");
    const hasError = detectRealError(input.tool_response);
    const completeType = hasError ? "agent_error" : "agent_complete";
    const completeStatus = hasError ? "error" : "done";
    let errorContext;
    if (hasError) {
      errorContext = responseStr.slice(0, 500);
    }
    let correlationId;
    try {
      const sessionPrefix = (input.session_id || "").slice(0, 8);
      correlationId = createHash("sha256").update(`${agentType}:${sessionPrefix}:${promptSummary.slice(0, 100)}`).digest("hex").slice(0, 16);
    } catch {
      correlationId = void 0;
    }
    return {
      type: completeType,
      agentType,
      status: completeStatus,
      metadata: {
        promptSummary,
        responseLength: responseStr.length,
        emitSpawn: true,
        // main() complete'den once spawn event'i de yayinlasin
        ...correlationId ? { correlationId } : {},
        // H9: opsiyonel field, eski consumer'lar yok sayar
        ...errorContext ? { errorContext } : {}
        // H2: sadece varsa ekle (opsiyonel field)
      }
    };
  }
  if (input.tool_name === "Bash") {
    const cmd = (ti.command || "").slice(0, 200);
    const hasError = detectRealError(input.tool_response);
    return {
      type: "tool_call",
      status: hasError ? "error" : "done",
      metadata: { tool: "Bash", command: cmd }
    };
  }
  return {
    type: "tool_call",
    status: "done",
    metadata: {
      tool: input.tool_name,
      detail: JSON.stringify(input.tool_input).slice(0, 150)
    }
  };
}
function sendToWebSocket(event) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(event);
    const postData = Buffer.from(payload);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3847,
        path: "/event",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": postData.length
        },
        timeout: 500
      },
      () => resolve()
    );
    req.on("error", () => resolve());
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.write(postData);
    req.end();
  });
}
async function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    return;
  }
  if (!raw) {
    console.log("{}");
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    console.log("{}");
    return;
  }
  const interestingTools = ["Agent", "Task", "Bash", "Edit", "Write", "Read", "Grep", "Glob"];
  if (!interestingTools.includes(input.tool_name)) {
    console.log("{}");
    return;
  }
  const partial = extractAgentInfo(input);
  const now = /* @__PURE__ */ new Date();
  const sessionId = (input.session_id || "unknown").slice(0, 8);
  if (process.env.DASHBOARD_C4_SPIKE === "1" && partial.agentType) {
    try {
      console.error(JSON.stringify({
        c4_spike: {
          tool: input.tool_name,
          self_agent_id: process.env.CLAUDE_AGENT_ID || null,
          parent_agent_id: process.env.CLAUDE_PARENT_AGENT_ID || null,
          claude_env_keys: Object.keys(process.env).filter((k) => k.startsWith("CLAUDE_")),
          spawned_agent_type: partial.agentType
        }
      }));
    } catch {
    }
  }
  const parentAgentId = process.env.CLAUDE_PARENT_AGENT_ID || void 0;
  const meta = partial.metadata;
  if (meta?.emitSpawn && partial.agentType) {
    const correlationId = meta.correlationId || void 0;
    const spawnEvent = {
      type: "agent_spawn",
      timestamp: new Date(now.getTime() - 1).toISOString(),
      // complete'den 1ms once
      sessionId,
      agentType: partial.agentType,
      agentId: process.env.CLAUDE_AGENT_ID || void 0,
      parentAgentId,
      status: "running",
      metadata: {
        promptSummary: meta.promptSummary || "",
        ...correlationId ? { correlationId } : {}
      }
    };
    await sendToWebSocket(spawnEvent);
    delete meta.emitSpawn;
  }
  const event = {
    type: partial.type || "tool_call",
    timestamp: now.toISOString(),
    sessionId,
    agentType: partial.agentType || void 0,
    agentId: process.env.CLAUDE_AGENT_ID || void 0,
    parentAgentId,
    status: partial.status || "done",
    metadata: partial.metadata || {}
  };
  await sendToWebSocket(event);
  console.log("{}");
}
main();

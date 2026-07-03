// src/token-logger.ts
import { appendFileSync } from "fs";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var TOKEN_LOG = join(homedir(), ".claude", "token-usage.jsonl");
var MAX_RESPONSE_SCAN = 1e5;
function safeStringifyLength(value) {
  if (value === null || value === void 0) return 0;
  if (typeof value === "string") {
    return value.length > MAX_RESPONSE_SCAN ? MAX_RESPONSE_SCAN : value.length;
  }
  try {
    const s = JSON.stringify(value);
    if (!s) return 0;
    return s.length > MAX_RESPONSE_SCAN ? MAX_RESPONSE_SCAN : s.length;
  } catch {
    return 0;
  }
}
function estimateTokens(charLength) {
  return Math.ceil(charLength / 4);
}
function extractAgentType(toolName, toolInput) {
  if (toolName !== "Agent" && toolName !== "Task") return null;
  if (!toolInput || typeof toolInput !== "object") return null;
  const ti = toolInput;
  const candidate = ti.subagent_type || ti.type;
  return typeof candidate === "string" ? candidate : null;
}
function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    console.log("{}");
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
  const toolName = typeof input.tool_name === "string" ? input.tool_name : "";
  if (!toolName) {
    console.log("{}");
    return;
  }
  const inputChars = safeStringifyLength(input.tool_input);
  const outputChars = safeStringifyLength(input.tool_response);
  const input_est = estimateTokens(inputChars);
  const output_est = estimateTokens(outputChars);
  const total_est = input_est + output_est;
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    session: typeof input.session_id === "string" ? input.session_id.slice(0, 8) : "unknown",
    tool: toolName,
    agent: extractAgentType(toolName, input.tool_input),
    input_est,
    output_est,
    total_est
  };
  try {
    appendFileSync(TOKEN_LOG, JSON.stringify(entry) + "\n");
  } catch {
  }
  console.log("{}");
}
main();

// src/canavar-main-scan.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, existsSync as existsSync3, mkdirSync as mkdirSync3 } from "fs";
import { join as join3 } from "path";
import { homedir as homedir3 } from "os";

// src/shared/agent-error-scan.ts
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import http from "http";
function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && typeof c.text === "string") {
        return c.text;
      }
      return "";
    }).join("\n");
  }
  return "";
}
function summarizeToolInput(name, input) {
  const str = (v) => typeof v === "string" ? v : "";
  switch (name) {
    case "Bash":
      return str(input.command).slice(0, 300);
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return str(input.file_path).slice(0, 200);
    case "Grep":
      return `pattern: ${str(input.pattern).slice(0, 100)}`;
    case "Glob":
      return `glob: ${str(input.pattern).slice(0, 100)}`;
    case "WebFetch":
      return str(input.url).slice(0, 200);
    case "Agent":
    case "Task":
      return `subagent: ${str(input.subagent_type) || "unknown"}`;
    default:
      try {
        return JSON.stringify(input).slice(0, 150);
      } catch {
        return "";
      }
  }
}
var SUBCOMMAND_TOOLS = /* @__PURE__ */ new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "npx",
  "bun",
  "go",
  "cargo",
  "docker",
  "kubectl",
  "dotnet",
  "pip",
  "pip3",
  "python",
  "python3",
  "node",
  "deno",
  "gh",
  "terraform",
  "helm",
  "make",
  "gradle",
  "mvn",
  "composer",
  "bundle"
]);
function normalizeCommandHead(command) {
  if (!command) return "unknown";
  let cmd = command.trim();
  const segments = cmd.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
  const NEVER_FAIL = /^(?:echo|printf|true|:|exit)\b/;
  let seg = "";
  let firstNonCd = "";
  for (const s of segments) {
    if (/^(?:cd|pushd)\s/.test(s)) continue;
    if (!firstNonCd) firstNonCd = s;
    if (!NEVER_FAIL.test(s)) {
      seg = s;
      break;
    }
  }
  seg = seg || firstNonCd || segments[0] || cmd;
  const tokens = seg.split(/\s+/).filter((t) => !/^[A-Z_][A-Z0-9_]*=/.test(t) && t !== "sudo");
  if (tokens.length === 0) return "unknown";
  const head = (tokens[0].split("/").pop() || tokens[0]).toLowerCase();
  if (SUBCOMMAND_TOOLS.has(head) && tokens[1] && !tokens[1].startsWith("-")) {
    const sub = (tokens[1].split("/").pop() || tokens[1]).slice(0, 40);
    return `${head} ${sub}`;
  }
  return head.slice(0, 50);
}
var EXIT_CODE_RE = /(?:^Error:\s*)?Exit code:?\s+(\d+)/im;
function extractExitCode(text) {
  const m = EXIT_CODE_RE.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
var USER_ABORT_RE = /request interrupted by user|tool use was rejected/i;
function classifyError(text, exitCode) {
  const t = text.toLowerCase();
  if (exitCode === 127 || /command not found|not recognized as an internal/.test(t)) {
    return "command_not_found";
  }
  if (/sandbox|seatbelt|operation not permitted/.test(t)) return "sandbox_block";
  if (/permission denied|not allowed|requires approval|denied by|user doesn'?t want|blocked by hook|haven'?t granted/.test(t)) {
    return "permission_denied";
  }
  if (/eaddrinuse|address already in use|resource busy|database is locked|could not acquire lock|lock(?:file)?\s+(?:exists|held|timeout)|file is locked|port\s+\d+\s+is\s+(?:already\s+)?in use/.test(t)) {
    return "resource_conflict";
  }
  if (/timed? out|etimedout|command timed/.test(t)) return "timeout";
  if (exitCode !== null && exitCode !== 0) return "command_fail";
  return "tool_error";
}
function processTranscriptText(text, toolUses, errors, successCommands = null) {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry.message;
    const content = message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block;
      if (b.type === "tool_use" && typeof b.id === "string") {
        toolUses.set(b.id, {
          name: typeof b.name === "string" ? b.name : "unknown",
          input: b.input && typeof b.input === "object" ? b.input : {}
        });
      }
      if (b.type === "tool_result" && b.is_error !== true) {
        const okUseId = typeof b.tool_use_id === "string" ? b.tool_use_id : "";
        const okUse = toolUses.get(okUseId);
        if (successCommands !== null && okUse?.name === "Bash" && typeof okUse.input.command === "string") {
          successCommands.push(okUse.input.command.slice(0, 300));
        }
        if (errors !== null && okUse?.name.startsWith("mcp__")) {
          const bodyText = extractText(b.content).trim();
          if (bodyText.startsWith("{")) {
            try {
              const body = JSON.parse(bodyText.slice(0, 2e4));
              const bodyError = typeof body.error === "string" && body.error || (body.isError === true ? "isError: true" : "");
              if (bodyError) {
                errors.push({
                  tool: okUse.name,
                  command: summarizeToolInput(okUse.name, okUse.input),
                  command_head: okUse.name.toLowerCase().slice(0, 50),
                  error_text: String(bodyError).slice(0, 600),
                  classification: "tool_error",
                  exit_code: null,
                  tool_use_id: okUseId
                });
              }
            } catch {
            }
          }
        }
        continue;
      }
      if (b.type === "tool_result" && b.is_error === true) {
        if (errors === null) continue;
        const fullText = extractText(b.content).slice(0, 2e4);
        if (USER_ABORT_RE.test(fullText)) continue;
        const errorText = fullText.slice(0, 600);
        const toolUseId = typeof b.tool_use_id === "string" ? b.tool_use_id : "";
        const use = toolUses.get(toolUseId);
        const toolName = use?.name || "unknown";
        const command = use ? summarizeToolInput(toolName, use.input) : "";
        const exitCode = extractExitCode(fullText);
        errors.push({
          tool: toolName,
          command,
          // Orphan tool_result (tool_use eşleşmedi) ayrı bucket'a: cmdfail kirlenmesin
          command_head: toolName === "Bash" ? normalizeCommandHead(command) : toolName === "unknown" ? "unknown-tool" : toolName.toLowerCase(),
          error_text: errorText,
          classification: classifyError(fullText, exitCode),
          exit_code: exitCode,
          tool_use_id: toolUseId
        });
      }
    }
  }
}
var LOOKBACK_BYTES = 256 * 1024;
function scanTranscriptIncremental(transcriptPath, fromOffset) {
  let size;
  try {
    size = statSync(transcriptPath).size;
  } catch {
    return { errors: [], offset: Math.max(0, fromOffset) };
  }
  const safeFrom = Math.max(0, Math.min(fromOffset, size));
  if (size <= safeFrom) return { errors: [], offset: safeFrom };
  const start = Math.max(0, safeFrom - LOOKBACK_BYTES);
  let buf;
  try {
    const fd = openSync(transcriptPath, "r");
    try {
      buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
    } finally {
      closeSync(fd);
    }
  } catch {
    return { errors: [], offset: safeFrom };
  }
  const newRegionStart = safeFrom - start;
  const lastNl = buf.lastIndexOf(10);
  if (lastNl < newRegionStart) {
    return { errors: [], offset: safeFrom };
  }
  const toolUses = /* @__PURE__ */ new Map();
  if (newRegionStart > 0) {
    processTranscriptText(buf.subarray(0, newRegionStart).toString("utf-8"), toolUses, null);
  }
  const errors = [];
  processTranscriptText(buf.subarray(newRegionStart, lastNl + 1).toString("utf-8"), toolUses, errors);
  return { errors, offset: start + lastNl + 1 };
}
var CANAVAR_DIR = join(homedir(), ".claude", "canavar");
var LEDGER_PATH = join(CANAVAR_DIR, "error-ledger.jsonl");
var MATRIX_PATH = join(CANAVAR_DIR, "skill-matrix.json");
function toLedgerEntries(errors, ctx, source = "subagent-scan") {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return errors.map((e) => ({
    ts: now,
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: e.classification,
    // Dashboard kartında görünen satır — komut başı buraya
    error_pattern: `${e.tool.toLowerCase()}-fail: ${e.command_head}`,
    detail: `[${e.tool}] ${e.command.slice(0, 160)} \u2192 ${e.error_text.slice(0, 200)}`,
    file: extractFilePath(e.error_text, e.command),
    lesson: lessonFor(e),
    tool: e.tool,
    command: e.command.slice(0, 200),
    command_head: e.command_head,
    source
  }));
}
function extractFilePath(output, command) {
  const m = (output + " " + command).match(/(?:\/|[A-Z]:\\)[\w\/.\\-]+\.\w+/);
  return m ? m[0].replace(/\\/g, "/") : "unknown";
}
function lessonFor(e) {
  switch (e.classification) {
    case "command_not_found":
      return `'${e.command_head}' agent ortam\u0131nda yok \u2014 spawn \xF6ncesi varl\u0131\u011F\u0131n\u0131 do\u011Frula ya da alternatif kullan`;
    case "permission_denied":
    case "sandbox_block":
      return `'${e.command_head}' subagent sandbox'\u0131nda engelli \u2014 bu komutu parent'ta \xE7al\u0131\u015Ft\u0131r`;
    case "resource_conflict":
      return `'${e.command_head}' kaynak \xE7ak\u0131\u015Fmas\u0131 (port/lock) \u2014 paralel agent'lar ayn\u0131 kayna\u011F\u0131 kullan\u0131yor olabilir`;
    case "timeout":
      return `'${e.command_head}' timeout \u2014 uzun i\u015Fler i\xE7in run_in_background veya timeout art\u0131r`;
    case "command_fail":
      return `'${e.command_head}' exit ${e.exit_code} ile fail \u2014 ${e.error_text.slice(0, 80)}`;
    default:
      return `${e.tool} hatas\u0131: ${e.error_text.slice(0, 80)}`;
  }
}
function appendLedgerEntries(entries, ledgerPath = LEDGER_PATH) {
  if (entries.length === 0) return;
  try {
    const dir = dirname(ledgerPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const lines = entries.map((e) => JSON.stringify(e) + "\n").join("");
    appendFileSync(ledgerPath, lines);
  } catch {
  }
}
function emitDashboardEvent(event) {
  return new Promise((resolve) => {
    try {
      const postData = Buffer.from(JSON.stringify(event));
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: 3847,
          path: "/event",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": postData.length },
          timeout: 400
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
    } catch {
      resolve();
    }
  });
}

// src/shared/canavar-store.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, statSync as statSync2, readdirSync, unlinkSync } from "fs";
import { join as join2, dirname as dirname2 } from "path";
import { homedir as homedir2 } from "os";
var CANAVAR_DIR2 = join2(homedir2(), ".claude", "canavar");
var LEDGER_PATH2 = join2(CANAVAR_DIR2, "error-ledger.jsonl");
var RUNNING_PATH = join2(CANAVAR_DIR2, "running-agents.json");
var LEDGER_MAX_BYTES = 1024 * 1024;
var LEDGER_KEEP_LINES = 500;
function rotateLedgerIfNeeded(ledgerPath = LEDGER_PATH2, maxBytes = LEDGER_MAX_BYTES, keepLines = LEDGER_KEEP_LINES) {
  try {
    if (!existsSync2(ledgerPath)) return false;
    if (statSync2(ledgerPath).size <= maxBytes) return false;
    const lines = readFileSync2(ledgerPath, "utf-8").split("\n").filter((l) => l.trim());
    if (lines.length <= keepLines) return false;
    const archiveDir = join2(dirname2(ledgerPath), "archive");
    if (!existsSync2(archiveDir)) mkdirSync2(archiveDir, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const archivePath = join2(archiveDir, `error-ledger-${stamp}.jsonl`);
    writeFileSync2(archivePath, lines.slice(0, -keepLines).join("\n") + "\n");
    writeFileSync2(ledgerPath, lines.slice(-keepLines).join("\n") + "\n");
    return true;
  } catch {
    return false;
  }
}
var HANG_THRESHOLD_MS = 30 * 60 * 1e3;
var STALE_THRESHOLD_MS = 24 * 60 * 60 * 1e3;
function loadRunning(path) {
  try {
    if (existsSync2(path)) return JSON.parse(readFileSync2(path, "utf-8"));
  } catch {
  }
  return {};
}
function saveRunning(map, path) {
  try {
    if (!existsSync2(dirname2(path))) mkdirSync2(dirname2(path), { recursive: true });
    writeFileSync2(path, JSON.stringify(map, null, 1));
  } catch {
  }
}
function findHungAgents(thresholdMs = HANG_THRESHOLD_MS, now = Date.now(), path = RUNNING_PATH) {
  try {
    const map = loadRunning(path);
    const hung = [];
    let changed = false;
    for (const [agentId, rec] of Object.entries(map)) {
      const started = Date.parse(rec.started_at);
      if (!Number.isFinite(started)) {
        delete map[agentId];
        changed = true;
        continue;
      }
      const age = now - started;
      if (age > STALE_THRESHOLD_MS) {
        delete map[agentId];
        changed = true;
        continue;
      }
      if (age > thresholdMs && !rec.flagged) {
        hung.push({
          agent_id: agentId,
          agent_type: rec.agent_type,
          session: rec.session,
          running_minutes: Math.round(age / 6e4)
        });
        rec.flagged = true;
        changed = true;
      }
    }
    if (changed) saveRunning(map, path);
    return hung;
  } catch {
    return [];
  }
}
function hungAgentsToLedgerEntries(hung) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return hung.map((h) => ({
    ts: now,
    session: h.session,
    agent_id: h.agent_id,
    agent_type: h.agent_type,
    error_type: "hung_agent",
    error_pattern: `hung-agent: ${h.agent_type}`,
    detail: `'${h.agent_type}' (${h.agent_id}) ${h.running_minutes} dk'd\u0131r Stop vermedi \u2014 ask\u0131da olabilir`,
    file: "unknown",
    lesson: `'${h.agent_type}' ask\u0131da kald\u0131 \u2014 interactive komut/stdin bekliyor olabilir; uzun i\u015Fler run_in_background + timeout ile verilmeli`,
    tool: "watchdog",
    command: "",
    command_head: `hung:${h.agent_type}`,
    source: "watchdog"
  }));
}
function cleanupOldCursors(cursorDir = join2(CANAVAR_DIR2, "scan-cursors"), maxAgeMs = 7 * 24 * 60 * 60 * 1e3, now = Date.now()) {
  let removed = 0;
  try {
    if (!existsSync2(cursorDir)) return 0;
    for (const name of readdirSync(cursorDir)) {
      if (!name.endsWith(".json")) continue;
      const p = join2(cursorDir, name);
      try {
        if (now - statSync2(p).mtimeMs > maxAgeMs) {
          unlinkSync(p);
          removed++;
        }
      } catch {
      }
    }
  } catch {
  }
  return removed;
}

// src/canavar-main-scan.ts
var CURSOR_DIR = join3(homedir3(), ".claude", "canavar", "scan-cursors");
function loadCursor(sessionId, transcriptPath) {
  try {
    const p = join3(CURSOR_DIR, `${sessionId}.json`);
    if (existsSync3(p)) {
      const state = JSON.parse(readFileSync3(p, "utf-8"));
      if (state.transcript_path === transcriptPath && typeof state.offset === "number") {
        return state;
      }
    }
  } catch {
  }
  return { offset: 0, transcript_path: transcriptPath, updated_at: "" };
}
function saveCursor(sessionId, state) {
  try {
    if (!existsSync3(CURSOR_DIR)) mkdirSync3(CURSOR_DIR, { recursive: true });
    writeFileSync3(join3(CURSOR_DIR, `${sessionId}.json`), JSON.stringify(state));
  } catch {
  }
}
function targetAgentType(command) {
  const m = /subagent:\s*(\S+)/.exec(command);
  return m ? m[1] : "unknown";
}
function reclassifyAgentFailures(entries) {
  return entries.map((e) => {
    if (e.tool !== "Agent" && e.tool !== "Task") return e;
    const target = targetAgentType(e.command || "");
    const errMsg = (e.detail || "").split("\u2192")[1]?.trim().slice(0, 120) || (e.detail || "").slice(0, 120);
    return {
      ...e,
      error_type: "spawn_fail",
      error_pattern: `agent-fail: ${target}`,
      command_head: `agent:${target}`,
      lesson: `'${target}' agent \xE7a\u011Fr\u0131s\u0131 d\xFC\u015Ft\xFC \u2014 ${errMsg}`
    };
  });
}
async function main() {
  let raw = "";
  try {
    raw = readFileSync3(0, "utf-8");
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
  if (input.hook_event_name !== "Stop" || !input.transcript_path) {
    console.log("{}");
    return;
  }
  const sessionId = input.session_id || "unknown";
  const cursor = loadCursor(sessionId, input.transcript_path);
  const { errors, offset } = scanTranscriptIncremental(input.transcript_path, cursor.offset);
  if (errors.length > 0) {
    const entries = reclassifyAgentFailures(
      toLedgerEntries(errors, { sessionId, agentId: "main", agentType: "main" }, "main-scan")
    );
    appendLedgerEntries(entries);
    const spawnFails = entries.filter((e) => e.error_type === "spawn_fail");
    if (spawnFails.length > 0) {
      await emitDashboardEvent({
        type: "agent_error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId: sessionId.slice(0, 8),
        agentType: "main",
        agentId: "main",
        status: "error",
        metadata: {
          spawnFail: true,
          targets: [...new Set(spawnFails.map((e) => e.command_head))],
          source: "main-scan"
        }
      });
    }
  }
  saveCursor(sessionId, {
    offset,
    transcript_path: input.transcript_path,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  const hung = findHungAgents();
  if (hung.length > 0) {
    appendLedgerEntries(hungAgentsToLedgerEntries(hung));
    await emitDashboardEvent({
      type: "agent_error",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: sessionId.slice(0, 8),
      agentType: "main",
      agentId: "main",
      status: "error",
      metadata: { hungAgents: hung.map((h) => `${h.agent_type}(${h.running_minutes}dk)`), source: "watchdog" }
    });
  }
  rotateLedgerIfNeeded();
  cleanupOldCursors();
  console.log("{}");
}
main();

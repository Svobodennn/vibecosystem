// src/subagent-stop-learner.ts
import { readFileSync as readFileSync3, appendFileSync as appendFileSync2, existsSync as existsSync3, mkdirSync as mkdirSync3 } from "fs";
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
function resolveAgentType(inputAgentType, agentTranscriptPath) {
  if (inputAgentType && inputAgentType !== "unknown-agent") return inputAgentType;
  if (agentTranscriptPath && agentTranscriptPath.endsWith(".jsonl")) {
    try {
      const metaPath = agentTranscriptPath.replace(/\.jsonl$/, ".meta.json");
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (typeof meta.agentType === "string" && meta.agentType) return meta.agentType;
    } catch {
    }
  }
  return inputAgentType || null;
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
function scanTranscriptFull(transcriptPath) {
  let raw = "";
  try {
    raw = readFileSync(transcriptPath, "utf-8");
  } catch {
    return { errors: [], successfulCommands: [], compactionCount: 0 };
  }
  const toolUses = /* @__PURE__ */ new Map();
  const errors = [];
  const successfulCommands = [];
  processTranscriptText(raw, toolUses, errors, successfulCommands);
  const compactionCount = (raw.match(/"subtype":"compact_boundary"/g) || []).length;
  return { errors, successfulCommands, compactionCount };
}
var LOOKBACK_BYTES = 256 * 1024;
var ERROR_REPORT_RE = /#{1,4}\s*(hata raporu|error report)/i;
function hasErrorReport(message) {
  return ERROR_REPORT_RE.test(message || "");
}
function buildErrorReportInstruction(errors) {
  const list = errors.slice(0, 10).map((e, i) => `${i + 1}. [${e.tool}] ${e.command.slice(0, 120) || "(no input)"} \u2192 ${e.classification}${e.exit_code !== null ? ` (exit ${e.exit_code})` : ""}`).join("\n");
  const more = errors.length > 10 ? `
...and ${errors.length - 10} more.` : "";
  return `You encountered ${errors.length} tool error(s) during this task but your final message does not report them:
${list}${more}

Append a section titled "## HATA RAPORU" to your final message. For EACH error state:
- the command/tool that failed and the error
- what you did about it (fixed / workaround / skipped)
- whether this leaves the task INCOMPLETE or affects correctness
End with one line: "TASK STATUS: COMPLETE" or "TASK STATUS: PARTIAL \u2014 <what remains>". Be honest; a silent failure means the task is considered half-done and buggy.`;
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
function loadMatrix(matrixPath) {
  try {
    if (existsSync(matrixPath)) return JSON.parse(readFileSync(matrixPath, "utf-8"));
  } catch {
  }
  return { agents: {}, updated_at: "" };
}
function ensureProfile(matrix, agentType) {
  if (!matrix.agents[agentType]) {
    matrix.agents[agentType] = {
      total_tasks: 0,
      successes: 0,
      failures: 0,
      success_rate: 0,
      skills: {},
      common_errors: [],
      last_active: ""
    };
  }
  return matrix.agents[agentType];
}
function recordAgentStop(agentType, errors, matrixPath = MATRIX_PATH) {
  try {
    if (!existsSync(CANAVAR_DIR)) mkdirSync(CANAVAR_DIR, { recursive: true });
    const matrix = loadMatrix(matrixPath);
    const profile = ensureProfile(matrix, agentType);
    profile.total_tasks++;
    if (errors.length > 0) profile.failures++;
    else profile.successes++;
    profile.success_rate = Number((profile.successes / profile.total_tasks).toFixed(2));
    profile.last_active = (/* @__PURE__ */ new Date()).toISOString();
    profile.tool_errors = (profile.tool_errors || 0) + errors.length;
    if (errors.length > 0) {
      profile.failing_commands = profile.failing_commands || {};
      for (const e of errors) {
        profile.failing_commands[e.command_head] = (profile.failing_commands[e.command_head] || 0) + 1;
      }
      for (const e of errors.slice(0, 3)) {
        const summary = `${e.command_head}: ${e.classification}`;
        if (!profile.common_errors.includes(summary)) {
          profile.common_errors.unshift(summary);
        }
      }
      profile.common_errors = profile.common_errors.slice(0, 10);
    }
    matrix.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  } catch {
  }
}
function bumpAgentMetric(agentType, metric, n = 1, matrixPath = MATRIX_PATH) {
  try {
    if (!existsSync(dirname(matrixPath))) mkdirSync(dirname(matrixPath), { recursive: true });
    const matrix = loadMatrix(matrixPath);
    const profile = ensureProfile(matrix, agentType);
    profile[metric] = (profile[metric] || 0) + n;
    matrix.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
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

// src/shared/stop-policy.ts
var CLAIM_PATTERNS = [
  // Test iddiaları (EN)
  { regex: /\b(?:all\s+)?tests?\s+(?:are\s+now\s+|are\s+|now\s+)?(?:pass(?:ing|ed)?|green)\b/gi, type: "test" },
  { regex: /\b\d+\s*\/\s*\d+\s+tests?\s+pass(?:ing|ed)?\b/gi, type: "test" },
  { regex: /\b\d+\s+tests?\s+passed\b/gi, type: "test" },
  { regex: /\btest\s+suite\s+(?:is\s+)?(?:passing|green|clean)\b/gi, type: "test" },
  // Test iddiaları (TR)
  { regex: /\b(?:tüm\s+)?testler\s+(?:geç(?:ti|iyor)|yeşil)\b/gi, type: "test" },
  // Build iddiaları (EN)
  { regex: /\bbuild\s+(?:is\s+|was\s+)?(?:successful|succeeded|passing|passes|green|clean)\b/gi, type: "build" },
  { regex: /\bcompil(?:es|ed)\s+(?:successfully|cleanly|without\s+errors)\b/gi, type: "build" },
  { regex: /\btsc\s+(?:is\s+)?(?:clean|passes|passed)\b/gi, type: "build" },
  { regex: /\btype\s*-?\s*check\s+(?:passed|passes|clean)\b/gi, type: "build" },
  // Build iddiaları (TR)
  { regex: /\bbuild\s+(?:temiz|geçti|başarılı)\b/gi, type: "build" },
  { regex: /\bderleme\s+(?:temiz|başarılı|geçti)\b/gi, type: "build" }
];
var HEDGE_RE = /should|likely|probably|expect|assum|hopefully|appears?|seems?|might|muhtemelen|olmalı|geçmeli|beklenir|unverified|not\s+verified|didn'?t\s+run|haven'?t\s+run|could\s+not\s+run|doğrulanmadı|çalıştır(?:ı|a)?l?(?:a)?madı|koşulmadı|if\s+/i;
function detectClaims(message) {
  if (!message) return [];
  const findings = [];
  const seen = /* @__PURE__ */ new Set();
  for (const { regex, type } of CLAIM_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(message)) !== null) {
      const start = Math.max(0, m.index - 60);
      const end = Math.min(message.length, m.index + m[0].length + 60);
      const window = message.slice(start, end);
      if (HEDGE_RE.test(window)) continue;
      const key = `${type}:${m[0].toLowerCase().slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ type, claim: m[0].slice(0, 80) });
    }
  }
  return findings;
}
var TEST_EVIDENCE_RE = /(?:^|[\s&;|(])(?:npx\s+|pnpm\s+(?:exec\s+)?|yarn\s+)?(?:vitest|jest|mocha|playwright\s+test|pytest|phpunit|rspec)\b|\bnpm\s+(?:run\s+)?test\b|\bpnpm\s+(?:run\s+)?test\b|\byarn\s+test\b|\bbun\s+test\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b|\bmvn\s+test\b|\bgradle\s+test\b|\bpython3?\s+-m\s+pytest\b/i;
var BUILD_EVIDENCE_RE = /\btsc\b|\bnpm\s+run\s+build\b|\bpnpm\s+(?:run\s+)?build\b|\byarn\s+build\b|\bgo\s+build\b|\bcargo\s+build\b|\bdotnet\s+build\b|\bmake\b|\bgradle\s+(?:build|assemble)\b|\bmvn\s+(?:package|compile|install)\b|\besbuild\b|\bvite\s+build\b|\bnext\s+build\b|\bgodot[^\n]*--export/i;
function hasEvidence(type, successfulCommands) {
  const re = type === "test" ? TEST_EVIDENCE_RE : BUILD_EVIDENCE_RE;
  return successfulCommands.some((cmd) => re.test(cmd));
}
function detectUnverifiedClaims(message, successfulCommands) {
  return detectClaims(message).filter((c) => !hasEvidence(c.type, successfulCommands));
}
function detectRetryStorms(errors, threshold = 3) {
  const counts = /* @__PURE__ */ new Map();
  for (const e of errors) {
    const cur = counts.get(e.command_head);
    if (cur) {
      cur.count++;
      cur.classification = e.classification;
    } else {
      counts.set(e.command_head, { count: 1, classification: e.classification });
    }
  }
  return [...counts.entries()].filter(([, v]) => v.count >= threshold).map(([command_head, v]) => ({ command_head, count: v.count, classification: v.classification }));
}
function buildClaimInstruction(claims) {
  const list = claims.map((c, i) => `${i + 1}. "${c.claim}" (${c.type})`).join("\n");
  return `Your final message makes ${claims.length} verification claim(s) with NO supporting evidence in your transcript (no successful test/build command was run):
${list}

Do ONE of the following, then finish:
- Actually RUN the verification command now and report the real result, OR
- Amend your final message: mark the claim explicitly as UNVERIFIED and state that you did not run it.
Honest uncertainty beats false confidence \u2014 an unverified "green" claim means the parent ships a bug.`;
}
function evaluateStopPolicy(input) {
  const { errors, lastMessage, stopHookActive, successfulCommands } = input;
  const unverifiedClaims = detectUnverifiedClaims(lastMessage, successfulCommands);
  const retryStorms = detectRetryStorms(errors);
  const errorsUnreported = errors.length > 0 && !hasErrorReport(lastMessage);
  if (stopHookActive) {
    return {
      shouldBlock: false,
      blockReason: "",
      unverifiedClaims,
      retryStorms,
      evaded: errorsUnreported
    };
  }
  const parts = [];
  if (errorsUnreported) parts.push(buildErrorReportInstruction(errors));
  if (unverifiedClaims.length > 0) parts.push(buildClaimInstruction(unverifiedClaims));
  return {
    shouldBlock: parts.length > 0,
    blockReason: parts.join("\n\n---\n\n"),
    unverifiedClaims,
    retryStorms,
    evaded: false
  };
}
function claimsToLedgerEntries(claims, ctx) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return claims.map((c) => ({
    ts: now,
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: "unverified_claim",
    error_pattern: `claim-fail: ${c.type}`,
    detail: `Kan\u0131ts\u0131z iddia: "${c.claim}" \u2014 transcript'te ba\u015Far\u0131l\u0131 ${c.type} komutu yok`,
    file: "unknown",
    lesson: `'${ctx.agentType}' kan\u0131ts\u0131z ${c.type} iddias\u0131 att\u0131 \u2014 GREEN beyan\u0131n\u0131 ana a\u011Fa\xE7ta do\u011Frula`,
    tool: "claim",
    command: c.claim,
    command_head: `claim:${c.type}`,
    source: "stop-policy"
  }));
}
function stormsToLedgerEntries(storms, ctx) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return storms.map((s) => ({
    ts: now,
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: "retry_storm",
    error_pattern: `retry-storm: ${s.command_head}`,
    detail: `'${s.command_head}' ayn\u0131 task i\xE7inde ${s.count} kez fail etti (${s.classification})`,
    file: "unknown",
    lesson: `'${s.command_head}' ${s.count}x fail \u2014 k\xF6rlemesine retry yerine yakla\u015F\u0131m de\u011Fi\u015Ftir/parent'a bildir`,
    tool: "retry",
    command: s.command_head,
    command_head: s.command_head,
    source: "stop-policy"
  }));
}
function detectParallelConflicts(newErrors, ctx, recentLedger, windowMs = 12e4, now = Date.now()) {
  const mine = newErrors.filter((e) => e.classification === "resource_conflict");
  if (mine.length === 0) return [];
  const others = recentLedger.filter((r) => {
    if (r.error_type !== "resource_conflict") return false;
    if (r.agent_id === ctx.agentId) return false;
    const ts = Date.parse(r.ts);
    return Number.isFinite(ts) && now - ts < windowMs;
  });
  if (others.length === 0) return [];
  const nowIso = new Date(now).toISOString();
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of mine) {
    if (seen.has(e.command_head)) continue;
    seen.add(e.command_head);
    const otherAgents = [...new Set(others.map((o) => o.agent_type))].slice(0, 5);
    out.push({
      ts: nowIso,
      session: ctx.sessionId.slice(0, 8),
      agent_id: ctx.agentId,
      agent_type: ctx.agentType,
      error_type: "parallel_conflict",
      error_pattern: `parallel-conflict: ${e.command_head}`,
      detail: `'${ctx.agentType}' ve [${otherAgents.join(", ")}] ${Math.round(windowMs / 6e4)} dk i\xE7inde ayn\u0131 kaynak s\u0131n\u0131f\u0131nda \xE7ak\u0131\u015Ft\u0131: ${e.error_text.slice(0, 100)}`,
      file: "unknown",
      lesson: `Paralel agent'lar ayn\u0131 kayna\u011F\u0131 (port/lock/db) payla\u015F\u0131yor \u2014 i\u015Fleri serialize et ya da kaynaklar\u0131 izole et (farkl\u0131 port, worktree)`,
      tool: "correlation",
      command: e.command.slice(0, 200),
      command_head: e.command_head,
      source: "stop-policy"
    });
  }
  return out;
}
function evadedLedgerEntry(errorCount, ctx) {
  return {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: "enforcement_evaded",
    error_pattern: "hata-raporu-yazilmadi",
    detail: `Agent ${errorCount} hataya ra\u011Fmen block sonras\u0131 da HATA RAPORU yazmad\u0131`,
    file: "unknown",
    lesson: `'${ctx.agentType}' enforcement'\u0131 atlatt\u0131 \u2014 bu agent'\u0131n \xE7\u0131kt\u0131lar\u0131na ekstra \u015F\xFCpheyle yakla\u015F`,
    tool: "enforcement",
    command: "",
    command_head: "enforcement:evaded",
    source: "stop-policy"
  };
}

// src/shared/canavar-store.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, statSync as statSync2, readdirSync, unlinkSync } from "fs";
import { join as join2, dirname as dirname2 } from "path";
import { homedir as homedir2 } from "os";
var CANAVAR_DIR2 = join2(homedir2(), ".claude", "canavar");
var LEDGER_PATH2 = join2(CANAVAR_DIR2, "error-ledger.jsonl");
var RUNNING_PATH = join2(CANAVAR_DIR2, "running-agents.json");
var LEDGER_MAX_BYTES = 1024 * 1024;
function readLedgerTail(n = 100, ledgerPath = LEDGER_PATH2) {
  try {
    if (!existsSync2(ledgerPath)) return [];
    const lines = readFileSync2(ledgerPath, "utf-8").split("\n").filter((l) => l.trim());
    const out = [];
    for (const line of lines.slice(-n)) {
      try {
        out.push(JSON.parse(line));
      } catch {
      }
    }
    return out;
  } catch {
    return [];
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
function clearRunningAgent(agentId, path = RUNNING_PATH) {
  try {
    const map = loadRunning(path);
    if (map[agentId]) {
      delete map[agentId];
      saveRunning(map, path);
    }
  } catch {
  }
}

// src/subagent-stop-learner.ts
var LEARNING_PATTERNS = [
  // Error → Fix
  { regex: /(?:fixed|resolved|solved)\s+(?:by|with|using)\s+(.{10,120})/gi, label: "error-fix", confidence: 0.8 },
  { regex: /(?:root\s+cause)[:\s]+(.{10,120})/gi, label: "root-cause", confidence: 0.9 },
  { regex: /(?:caused\s+by)\s+(.{10,120})/gi, label: "root-cause", confidence: 0.7 },
  // Başarılı yaklaşımlar
  { regex: /(?:solution|approach|fix)[:\s]+(.{10,120})/gi, label: "working-solution", confidence: 0.7 },
  // Başarısız yaklaşımlar
  { regex: /(?:didn'?t\s+work|failed|doesn'?t\s+work|won'?t\s+work)[:\s]*(.{10,100})/gi, label: "failed-approach", confidence: 0.7 },
  { regex: /(?:avoid|don'?t|never|careful\s+with)\s+(.{10,100})/gi, label: "anti-pattern", confidence: 0.6 },
  // Kararlar
  { regex: /(?:decided|chose|chosen|selected)\s+(?:to\s+)?(.{10,100})\s+(?:because|since|as)/gi, label: "decision", confidence: 0.7 },
  // Pattern keşfi
  { regex: /(?:pattern|convention|standard)[:\s]+(.{10,100})/gi, label: "codebase-pattern", confidence: 0.7 },
  { regex: /(?:found\s+that|discovered\s+that|noticed\s+that)\s+(.{10,120})/gi, label: "discovery", confidence: 0.7 },
  // Security
  { regex: /(?:vulnerabilit(?:y|ies)|security\s+(?:issue|risk|concern))[:\s]+(.{10,120})/gi, label: "security-finding", confidence: 0.8 },
  // Performance
  { regex: /(?:bottleneck|memory\s+leak)[:\s]*(.{10,100})/gi, label: "performance-finding", confidence: 0.6 }
];
var HIGH_VALUE_AGENTS = /* @__PURE__ */ new Set([
  "sleuth",
  "scout",
  "kraken",
  "spark",
  "architect",
  "phoenix",
  "code-reviewer",
  "security-reviewer",
  "profiler",
  "build-error-resolver",
  "tdd-guide",
  "database-reviewer",
  "verifier",
  "self-learner"
]);
function extractLearnings(output, agentType, sessionId) {
  if (!output || output.length < 20) return [];
  const learnings = [];
  const seen = /* @__PURE__ */ new Set();
  const text = output.slice(0, 3e3);
  for (const { regex, label, confidence } of LEARNING_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const detail = (match[1] || match[0]).trim();
      if (detail.length < 10 || detail.length > 150) continue;
      const key = `${label}:${detail.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      learnings.push({
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        session: sessionId.slice(0, 8),
        type: "agent_learning",
        agent_type: agentType,
        pattern: `${agentType}:${label}`,
        detail: detail.slice(0, 150),
        confidence: HIGH_VALUE_AGENTS.has(agentType) ? confidence : confidence * 0.7,
        task_description: ""
      });
      if (learnings.filter((l) => l.pattern === `${agentType}:${label}`).length >= 3) break;
    }
  }
  return learnings.slice(0, 8);
}
function writeLearnings(learnings, agentType, sessionId) {
  if (learnings.length === 0) return;
  try {
    const claudeDir = join3(homedir3(), ".claude");
    if (!existsSync3(claudeDir)) mkdirSync3(claudeDir, { recursive: true });
    const instinctsPath = join3(claudeDir, "instincts.jsonl");
    for (const learning of learnings) {
      appendFileSync2(instinctsPath, JSON.stringify(learning) + "\n");
    }
    const agentLogPath = join3(claudeDir, "agent-learnings.jsonl");
    appendFileSync2(agentLogPath, JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      session: sessionId.slice(0, 8),
      agent_type: agentType,
      learnings_count: learnings.length,
      patterns: learnings.map((l) => l.pattern)
    }) + "\n");
  } catch {
  }
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
  if (input.hook_event_name !== "SubagentStop") {
    console.log("{}");
    return;
  }
  const sessionId = input.session_id || "unknown";
  const agentId = input.agent_id || "unknown";
  const resolvedType = resolveAgentType(input.agent_type, input.agent_transcript_path);
  const agentType = resolvedType || "unknown-agent";
  const lastMessage = input.last_assistant_message || "";
  const stopHookActive = input.stop_hook_active === true;
  let errors = [];
  let successfulCommands = [];
  let compactionCount = 0;
  if (input.agent_transcript_path) {
    const scan = scanTranscriptFull(input.agent_transcript_path);
    errors = scan.errors;
    successfulCommands = scan.successfulCommands;
    compactionCount = scan.compactionCount;
  }
  const ctx = { sessionId, agentId, agentType };
  const policy = evaluateStopPolicy({ errors, lastMessage, stopHookActive, successfulCommands });
  if (!stopHookActive) {
    const recentLedger = readLedgerTail(100);
    appendLedgerEntries([
      ...toLedgerEntries(errors, ctx),
      ...stormsToLedgerEntries(policy.retryStorms, ctx),
      // E2: aynı komut ≥3 fail
      ...claimsToLedgerEntries(policy.unverifiedClaims, ctx),
      // B1: kanıtsız GREEN iddiası
      ...detectParallelConflicts(errors, ctx, recentLedger)
      // D2: paralel kaynak çakışması
    ]);
    if (resolvedType) {
      recordAgentStop(resolvedType, errors);
      if (policy.retryStorms.length > 0) {
        bumpAgentMetric(resolvedType, "retry_storms", policy.retryStorms.length);
      }
      if (policy.unverifiedClaims.length > 0) {
        bumpAgentMetric(resolvedType, "unverified_claims", policy.unverifiedClaims.length);
      }
      if (compactionCount > 0) {
        bumpAgentMetric(resolvedType, "compactions", compactionCount);
      }
    }
    if (errors.length > 0 || policy.unverifiedClaims.length > 0) {
      await emitDashboardEvent({
        type: "agent_error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId: sessionId.slice(0, 8),
        agentType,
        agentId,
        status: "error",
        metadata: {
          errorCount: errors.length,
          commands: [...new Set(errors.map((e) => e.command_head))].slice(0, 10),
          classifications: [...new Set(errors.map((e) => e.classification))],
          unverifiedClaims: policy.unverifiedClaims.length,
          retryStorms: policy.retryStorms.map((s) => s.command_head),
          source: "subagent-scan"
        }
      });
    }
  }
  if (policy.shouldBlock) {
    console.log(JSON.stringify({
      decision: "block",
      reason: policy.blockReason
    }));
    return;
  }
  clearRunningAgent(agentId);
  if (policy.evaded) {
    appendLedgerEntries([evadedLedgerEntry(errors.length, ctx)]);
    if (resolvedType) bumpAgentMetric(resolvedType, "enforcement_evasions");
  }
  const learnings = extractLearnings(lastMessage, agentType, sessionId);
  writeLearnings(learnings, agentType, sessionId);
  if (learnings.length > 0) {
    console.log(JSON.stringify({
      result: `Extracted ${learnings.length} learnings from ${agentType} agent`
    }));
  } else {
    console.log("{}");
  }
}
main();

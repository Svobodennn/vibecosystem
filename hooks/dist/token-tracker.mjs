// src/token-tracker.ts
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
function charCount(text) {
  if (!text) return 0;
  return String(text).length;
}
function runHook() {
  let input;
  try {
    input = readFileSync(0, "utf-8");
  } catch {
    return;
  }
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return;
  }
  const claudeDir = join(homedir(), ".claude");
  const logFile = join(claudeDir, "token-usage.jsonl");
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
  const inputChars = charCount(JSON.stringify(event.tool_input || {}));
  const outputChars = charCount(event.tool_output);
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: event.session_id || "unknown",
    tool: event.tool_name,
    input_chars: inputChars,
    output_chars: outputChars,
    total_chars: inputChars + outputChars
  };
  if (event.tool_name === "Agent" && event.tool_input) {
    entry.agent = String(event.tool_input.subagent_type || "general-purpose");
  }
  try {
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch {
  }
}
try {
  runHook();
} catch {
  process.exit(0);
}

// src/token-tracker.ts
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}
async function main() {
  let input;
  try {
    input = readFileSync("/dev/stdin", "utf-8");
  } catch {
    process.exit(0);
  }
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const claudeDir = join(homedir(), ".claude");
  const logFile = join(claudeDir, "token-usage.jsonl");
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
  const inputTokens = estimateTokens(JSON.stringify(event.tool_input || {}));
  const outputTokens = estimateTokens(event.tool_output);
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: event.session_id || "unknown",
    tool: event.tool_name,
    input_tokens_est: inputTokens,
    output_tokens_est: outputTokens,
    total_est: inputTokens + outputTokens
  };
  if (event.tool_name === "Agent" && event.tool_input) {
    entry.agent = String(event.tool_input.subagent_type || "general-purpose");
  }
  try {
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch {
  }
  try {
    const { createConnection } = await import("node:net");
    const client = createConnection({ port: 3847, host: "127.0.0.1" }, () => {
      client.write(JSON.stringify({ type: "token_usage", ...entry }));
      client.end();
    });
    client.on("error", () => {
    });
  } catch {
  }
  console.log(JSON.stringify({ result: "approve" }));
}
main().catch(() => process.exit(0));

// src/prompt-improver.ts
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
var CLAUDE_DIR = join(homedir(), ".claude");
var VAGUE_VERBS = ["fix", "do", "make", "update", "change", "modify", "handle", "add", "remove", "check"];
var AMBIGUOUS_REFS = ["it", "this", "that", "the thing", "the issue", "the problem", "the bug"];
function main() {
  let input;
  try {
    input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
  } catch {
    return;
  }
  if (input.tool_name !== "UserPromptSubmit") {
    process.stdout.write("{}");
    return;
  }
  const prompt = (input.tool_input.user_message || input.tool_input.content || "").trim();
  if (!prompt) {
    process.stdout.write("{}");
    return;
  }
  const words = prompt.split(/\s+/);
  const wordCount = words.length;
  const lowerPrompt = prompt.toLowerCase();
  const isShort = wordCount < 10;
  const hasVagueVerb = VAGUE_VERBS.some((v) => lowerPrompt.includes(v));
  const hasAmbiguousRef = AMBIGUOUS_REFS.some((r) => lowerPrompt.includes(r));
  const hasFilePath = /[a-zA-Z0-9_-]+\.[a-zA-Z]{1,5}/.test(prompt) || prompt.includes("/") || prompt.includes("\\");
  if (!isShort || !hasVagueVerb && !hasAmbiguousRef || hasFilePath) {
    process.stdout.write("{}");
    return;
  }
  const hints = [];
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const recentFiles = execSync("git diff --name-only HEAD~3 2>/dev/null || git diff --name-only 2>/dev/null", {
      cwd,
      encoding: "utf-8",
      timeout: 2e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (recentFiles) {
      const files = recentFiles.split("\n").slice(0, 8);
      hints.push(`Recently changed files:
${files.map((f) => `  - ${f}`).join("\n")}`);
    }
  } catch {
  }
  try {
    const ledger = join(CLAUDE_DIR, "canavar", "error-ledger.jsonl");
    if (existsSync(ledger)) {
      const content = readFileSync(ledger, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        const lastError = JSON.parse(lines[lines.length - 1]);
        if (lastError.pattern || lastError.error) {
          hints.push(`Last recorded error: ${lastError.pattern || lastError.error}`);
        }
      }
    }
  } catch {
  }
  try {
    const intentPath = join(CLAUDE_DIR, "cache", "current-intent.json");
    if (existsSync(intentPath)) {
      const intent = JSON.parse(readFileSync(intentPath, "utf-8"));
      if (intent.taskType) {
        hints.push(`Detected intent: ${intent.taskType}`);
      }
    }
  } catch {
  }
  if (hints.length === 0) {
    process.stdout.write("{}");
    return;
  }
  const context = `[prompt-improver] Your prompt is brief. Here's context that might help:

${hints.join("\n\n")}`;
  const output = {
    additionalContext: context
  };
  process.stdout.write(JSON.stringify(output));
}
main();

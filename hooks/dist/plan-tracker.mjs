// src/plan-tracker.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
function main() {
  let input;
  try {
    input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
  } catch {
    return;
  }
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const thoughtsDir = join(cwd, "thoughts");
  const planPath = join(thoughtsDir, "PLAN.md");
  const progressPath = join(thoughtsDir, "PROGRESS.md");
  if (input.tool_name === "SessionStart" || input.tool_name === "session_start") {
    if (existsSync(planPath)) {
      try {
        const plan = readFileSync(planPath, "utf-8");
        if (plan.trim()) {
          const output = {
            additionalContext: `[plan-tracker] Active plan found:

${plan.slice(0, 3e3)}`
          };
          process.stdout.write(JSON.stringify(output));
          return;
        }
      } catch {
      }
    }
    process.stdout.write("{}");
    return;
  }
  if (input.tool_name === "Bash") {
    const command = String(input.tool_input.command || "");
    const response = String(input.tool_response || "");
    if (command.includes("git commit") && response.includes("[") && !response.includes("error")) {
      const commitMatch = response.match(/\[[\w/-]+\s+([a-f0-9]+)\]\s+(.+)/);
      if (commitMatch) {
        const hash = commitMatch[1];
        const message = commitMatch[2];
        const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
        const entry = `- [${timestamp}] \`${hash}\` ${message}
`;
        try {
          mkdirSync(thoughtsDir, { recursive: true });
          let existing = "";
          if (existsSync(progressPath)) {
            existing = readFileSync(progressPath, "utf-8");
          } else {
            existing = "# Progress\n\nAutomatically tracked commits:\n\n";
          }
          writeFileSync(progressPath, existing + entry, "utf-8");
        } catch {
        }
      }
    }
  }
  if (input.tool_name === "Write" || input.tool_name === "Edit") {
    const filePath = String(input.tool_input.file_path || "");
    if (filePath.endsWith("PLAN.md") || filePath.endsWith("CONTEXT.md")) {
    }
  }
  process.stdout.write("{}");
}
main();

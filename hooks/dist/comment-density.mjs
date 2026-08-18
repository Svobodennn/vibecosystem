// src/comment-density.ts
import { readFileSync } from "fs";
var cont = () => console.log(JSON.stringify({ result: "continue" }));
function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    cont();
    return;
  }
  const tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit") return cont();
  const fp = input.tool_input?.file_path ?? "";
  if (!/\.(ts|tsx|js|jsx)$/.test(fp)) return cont();
  let added = "";
  if (tool === "Write") added = input.tool_input?.content ?? "";
  else if (tool === "MultiEdit")
    added = (input.tool_input?.edits ?? []).map((e) => e.new_string ?? "").join("\n");
  else added = input.tool_input?.new_string ?? "";
  if (!added.trim()) return cont();
  const lines = added.split("\n");
  let commentLines = 0;
  let codeLines = 0;
  let maxRun = 0;
  let run = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const isComment = t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("{/*");
    if (isComment) {
      commentLines++;
      maxRun = Math.max(maxRun, ++run);
    } else {
      codeLines++;
      run = 0;
    }
  }
  const hasJsdoc = /\/\*\*[\s\S]*?\n[\s\S]*?\*\//.test(added);
  const longRun = maxRun >= 3;
  const dense = commentLines >= 4 && codeLines > 0 && commentLines / codeLines > 0.35;
  if (!hasJsdoc && !longRun && !dense) return cont();
  const reasons = [];
  if (hasJsdoc) reasons.push("a multi-line /** JSDoc */ block");
  if (longRun) reasons.push(`${maxRun} consecutive comment lines`);
  if (dense)
    reasons.push(`${commentLines} comment lines for ${codeLines} code lines`);
  const file = fp.split("/").pop() ?? fp;
  const reminder = `<system-reminder>
\u26A0\uFE0F COMMENT STYLE (WORKING_AGREEMENT madde 6 + comment-style memory) \u2014 ${file}
This edit added ${reasons.join(" + ")}. Comments must be SPARSE, human, why-focused:
- No multi-line /** JSDoc */ \u2014 collapse to one or two // lines, or delete.
- Delete "what it does" comments; good names + types already say it.
- Keep a single-line "why" only when it's non-obvious. When in doubt, delete.
Re-read the comments you just wrote and trim them now.
</system-reminder>`;
  console.log(JSON.stringify({ result: "continue", additionalContext: reminder }));
}
main();

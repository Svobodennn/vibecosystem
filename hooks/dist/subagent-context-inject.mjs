// src/subagent-context-inject.ts
import { readFileSync } from "fs";
var OUTPUT_CONTRACT = `## Agent Output Contract (plan your output around this)

Only your FINAL message is returned to the parent \u2014 earlier turns are discarded. Your final message must therefore be COMPLETE on its own: always include your full findings/answer in it.

If a REAL tool error happened during the task (a command genuinely failed and left a result you cannot trust), end your final message with a short section titled "## HATA RAPORU":
- the command/tool that failed and the error
- what you did about it (fixed / workaround / skipped)
- whether it leaves the task INCOMPLETE or affects correctness
then one final line: "TASK STATUS: COMPLETE" or "TASK STATUS: PARTIAL \u2014 <what remains>".

These are NOT errors \u2014 do NOT report them: grep/find/ls with no matches (exit 1), "file not found" probes, "no such tool available" fallbacks, or a command you simply re-ran successfully. Report genuine failures honestly, but NEVER shorten or drop your findings in order to write the report.`;
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
  if (input.hook_event_name !== "SubagentStart") {
    console.log("{}");
    return;
  }
  const output = {
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: OUTPUT_CONTRACT
    }
  };
  console.log(JSON.stringify(output));
}
main();

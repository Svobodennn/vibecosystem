// src/epistemic-reminder.ts
import { readFileSync as readFileSync2 } from "fs";

// src/shared/context-budget.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
var DEFAULT_LIMITS = {
  perEventChars: 4e3,
  sessionChars: 12e3
};
function budgetPath() {
  return process.env.VIBECO_CONTEXT_BUDGET_PATH || join(homedir(), ".claude", "cache", "context-budget.json");
}
function runtimePath() {
  return process.env.VIBECO_RUNTIME_PATH || join(homedir(), ".claude", "vibecosystem-runtime.json");
}
function getBudgetLimits() {
  try {
    const path = runtimePath();
    if (existsSync(path)) {
      const runtime = JSON.parse(readFileSync(path, "utf-8"));
      const perEventChars = Number(runtime.contextBudget?.perEventChars);
      const sessionChars = Number(runtime.contextBudget?.sessionChars);
      if (Number.isFinite(perEventChars) && Number.isFinite(sessionChars)) {
        return {
          perEventChars: Math.max(0, perEventChars),
          sessionChars: Math.max(0, sessionChars)
        };
      }
    }
  } catch {
  }
  return DEFAULT_LIMITS;
}
function loadBudget() {
  try {
    const path = budgetPath();
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {
  }
  return {
    session_id: "unknown",
    total_chars: 0,
    per_hook: {},
    per_event: {},
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function saveBudget(budget) {
  try {
    const path = budgetPath();
    const cacheDir = dirname(path);
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path, JSON.stringify(budget, null, 2));
  } catch {
  }
}
function tryInject(hookName, eventKey, charCount) {
  const budget = loadBudget();
  const limits = getBudgetLimits();
  if (budget.total_chars + charCount > limits.sessionChars) return false;
  const eventChars = budget.per_event[eventKey] || 0;
  if (eventChars + charCount > limits.perEventChars) return false;
  budget.total_chars += charCount;
  budget.per_hook[hookName] = (budget.per_hook[hookName] || 0) + charCount;
  budget.per_event[eventKey] = (budget.per_event[eventKey] || 0) + charCount;
  budget.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  saveBudget(budget);
  return true;
}
function budgetContext(hookName, eventKey, context) {
  if (!context) return "";
  const budget = loadBudget();
  const limits = getBudgetLimits();
  const eventRemaining = Math.max(0, limits.perEventChars - (budget.per_event[eventKey] || 0));
  const sessionRemaining = Math.max(0, limits.sessionChars - budget.total_chars);
  const available = Math.min(eventRemaining, sessionRemaining);
  if (available <= 0) return "";
  const bounded = context.length > available ? `${context.slice(0, Math.max(0, available - 18))}
[truncated]` : context;
  return tryInject(hookName, eventKey, bounded.length) ? bounded : "";
}
function budgetHookOutput(output, hookName, eventKey) {
  const root = output;
  if (root.additionalContext) {
    const context = budgetContext(hookName, eventKey, String(root.additionalContext));
    if (context) root.additionalContext = context;
    else delete root.additionalContext;
  }
  const hookOutput = output.hookSpecificOutput;
  if (hookOutput?.additionalContext) {
    const context = budgetContext(hookName, eventKey, String(hookOutput.additionalContext));
    if (context) {
      hookOutput.additionalContext = context;
    } else {
      delete hookOutput.additionalContext;
      if (Object.keys(hookOutput).length === 0) delete output.hookSpecificOutput;
    }
  }
  if (hookOutput?.permissionDecisionReason) {
    const reason = budgetContext(hookName, `${eventKey}:reason`, String(hookOutput.permissionDecisionReason));
    if (reason) hookOutput.permissionDecisionReason = reason;
    else delete hookOutput.permissionDecisionReason;
  }
  if (hookOutput?.updatedInput?.prompt) {
    const prompt = budgetContext(hookName, `${eventKey}:prompt`, String(hookOutput.updatedInput.prompt));
    if (prompt) hookOutput.updatedInput.prompt = prompt;
    else delete hookOutput.updatedInput.prompt;
  }
  for (const field of ["message", "systemMessage"]) {
    if (typeof root[field] !== "string") continue;
    const message = budgetContext(hookName, `${eventKey}:${field}`, root[field]);
    if (message) root[field] = message;
    else delete root[field];
  }
  return output;
}

// src/epistemic-reminder.ts
function main() {
  let input;
  try {
    const stdinContent = readFileSync2(0, "utf-8");
    input = JSON.parse(stdinContent);
  } catch {
    console.log(JSON.stringify({ result: "continue" }));
    return;
  }
  if (input.tool_name !== "Grep" && input.tool_name !== "Read") {
    console.log(JSON.stringify({ result: "continue" }));
    return;
  }
  let reminder;
  if (input.tool_name === "Read") {
    const filePath = input.tool_input?.file_path || "file";
    const fileName = filePath.split("/").pop() || "file";
    reminder = `<system-reminder>
\u2713 Read ${fileName} - note findings. Update any prior ? INFERRED claims to \u2713 VERIFIED if confirmed.
</system-reminder>`;
  } else {
    const pattern = input.tool_input?.pattern || "";
    const outputMode = input.tool_input?.output_mode || "files_with_matches";
    const existencePatterns = [
      /try.*catch/i,
      /error.*handl/i,
      /exist/i,
      /missing/i,
      /lack/i,
      /without/i,
      /no.*found/i
    ];
    const isExistenceCheck = existencePatterns.some((p) => p.test(pattern));
    const isFileListMode = outputMode === "files_with_matches";
    if (isExistenceCheck || isFileListMode) {
      reminder = `<epistemic-reminder>
\u26A0\uFE0F GREP RESULTS ARE NOT PROOF

Before claiming "X exists" or "X doesn't exist":
1. READ the actual file(s) to verify
2. Grep may miss: different naming, regex mismatch, file not searched
3. Grep may false-match: substring matches, comments, strings

REQUIRED: Use Read tool on relevant files before making existence claims.
Mark claims as: \u2713 VERIFIED (read file) | ? INFERRED (grep only) | \u2717 UNCERTAIN
</epistemic-reminder>`;
    } else {
      reminder = `<epistemic-reminder>
Grep results are evidence, not proof. Verify with Read before claiming.
</epistemic-reminder>`;
    }
  }
  const output = {
    result: "continue",
    additionalContext: reminder
  };
  console.log(JSON.stringify(budgetHookOutput(output, "epistemic-reminder", `PostToolUse:${input.tool_name}`)));
}
main();

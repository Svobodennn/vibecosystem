// src/magic-doc-tracker.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";

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

// src/magic-doc-tracker.ts
var MAGIC_DOC_DIR = join2(homedir2(), ".claude", "magic-docs");
var TRACKED_FILE = join2(MAGIC_DOC_DIR, "tracked.json");
var MAGIC_DOC_PATTERN = /^#\s*MAGIC\s+DOC:\s*(.+)$/im;
var INSTRUCTIONS_PATTERN = /^[_*](.+?)[_*]\s*$/m;
function ensureDir(dir) {
  if (!existsSync2(dir)) {
    mkdirSync2(dir, { recursive: true });
  }
}
function loadTracked() {
  try {
    if (existsSync2(TRACKED_FILE)) {
      return JSON.parse(readFileSync2(TRACKED_FILE, "utf-8"));
    }
  } catch {
  }
  return {};
}
function saveTracked(tracked) {
  ensureDir(MAGIC_DOC_DIR);
  writeFileSync2(TRACKED_FILE, JSON.stringify(tracked, null, 2), "utf-8");
}
function main() {
  try {
    const input = JSON.parse(process.argv[2] || "{}");
    if (input.tool_name !== "Read") return;
    const filePath = input.tool_input?.file_path;
    const output = input.tool_output || "";
    if (!filePath || !output) return;
    const match = output.match(MAGIC_DOC_PATTERN);
    if (!match || !match[1]) return;
    const title = match[1].trim();
    let instructions;
    const afterHeader = output.substring((match.index || 0) + match[0].length);
    const instrMatch = afterHeader.match(INSTRUCTIONS_PATTERN);
    if (instrMatch && instrMatch[1]) {
      instructions = instrMatch[1].trim();
    }
    const tracked = loadTracked();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    tracked[filePath] = {
      path: filePath,
      title,
      instructions,
      firstSeen: tracked[filePath]?.firstSeen || now,
      lastSeen: now
    };
    saveTracked(tracked);
    const result = {
      additionalContext: `[Magic Doc detected: "${title}" at ${filePath}. Will be auto-updated at session end.]`
    };
    process.stdout.write(JSON.stringify(budgetHookOutput(result, "magic-doc-tracker", "PostToolUse:Read")));
  } catch {
  }
}
main();

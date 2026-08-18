// src/agent-memory-loader.ts
import { readFileSync as readFileSync2, existsSync as existsSync2, readdirSync, statSync as statSync2 } from "fs";
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

// src/agent-memory-loader.ts
var CLAUDE_HOME = join2(homedir2(), ".claude");
var MAX_MEMORY_SIZE = 8e3;
var MAX_FILES = 10;
function sanitizeAgentType(agentType) {
  return agentType.replace(/[:/\\]/g, "-").replace(/\s+/g, "-").toLowerCase();
}
function getAgentMemoryDir(agentType, scope) {
  const dirName = sanitizeAgentType(agentType);
  switch (scope) {
    case "user":
      return join2(CLAUDE_HOME, "agent-memory", dirName);
    case "project":
      return join2(process.cwd(), ".claude", "agent-memory", dirName);
    case "local":
      return join2(process.cwd(), ".claude", "agent-memory-local", dirName);
  }
}
function scanMemoryDir(dir) {
  if (!existsSync2(dir)) return [];
  const results = [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).slice(0, MAX_FILES);
    for (const file of files) {
      const filePath = join2(dir, file);
      try {
        const stat = statSync2(filePath);
        if (stat.isFile() && stat.size > 0 && stat.size < 5e4) {
          const content = readFileSync2(filePath, "utf-8").trim();
          if (content) {
            results.push(`### ${file}
${content}`);
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return results;
}
function getAgentMemoryScope(agentType) {
  const agentDir = join2(CLAUDE_HOME, "agents");
  const agentFile = join2(agentDir, `${agentType}.md`);
  if (!existsSync2(agentFile)) return void 0;
  try {
    const content = readFileSync2(agentFile, "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return void 0;
    const memoryMatch = frontmatterMatch[1].match(/^memory:\s*(.+)$/m);
    if (!memoryMatch) return void 0;
    const scope = memoryMatch[1].trim().toLowerCase();
    if (scope === "user" || scope === "project" || scope === "local") {
      return scope;
    }
  } catch {
  }
  return void 0;
}
function main() {
  try {
    const input = JSON.parse(process.argv[2] || "{}");
    if (input.tool_name !== "Agent") return;
    const agentType = input.tool_input?.subagent_type;
    if (!agentType) return;
    const scope = getAgentMemoryScope(agentType);
    const effectiveScope = scope || "user";
    const memoryDir = getAgentMemoryDir(agentType, effectiveScope);
    const memories = scanMemoryDir(memoryDir);
    if (memories.length === 0) return;
    let combined = memories.join("\n\n");
    if (combined.length > MAX_MEMORY_SIZE) {
      combined = combined.substring(0, MAX_MEMORY_SIZE) + "\n\n[... truncated]";
    }
    const context = `## Agent Persistent Memory (${agentType}, scope: ${effectiveScope})

Bu agent'in onceki session'lardan biriktirdigi kalici bellek:

${combined}

---
Bu memory'yi guncelle: Yeni ogrenimler varsa ~/.claude/agent-memory/${sanitizeAgentType(agentType)}/ dizinine yaz.
Memory guncelleme zorunlu DEGiL - sadece gercekten yeni ve degerli bilgi varsa kaydet.`;
    const result = {
      additionalContext: context
    };
    process.stdout.write(JSON.stringify(budgetHookOutput(result, "agent-memory-loader", "PreToolUse:Agent")));
  } catch {
  }
}
main();

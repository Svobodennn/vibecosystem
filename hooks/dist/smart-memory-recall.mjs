var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/smart-memory-recall.ts
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

// src/smart-memory-recall.ts
var CLAUDE_HOME = join2(homedir2(), ".claude");
var MAX_RESULTS = 3;
var MAX_CONTEXT_SIZE = 4e3;
var FRONTMATTER_MAX_BYTES = 2e3;
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "", description: "", type: "" };
  const fm = match[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const typeMatch = fm.match(/^type:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim() || "",
    description: descMatch?.[1]?.trim() || "",
    type: typeMatch?.[1]?.trim() || ""
  };
}
function scanDir(dir) {
  if (!existsSync2(dir)) return [];
  const results = [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "MEMORY.md");
    for (const file of files) {
      const filePath = join2(dir, file);
      try {
        const stat = statSync2(filePath);
        if (!stat.isFile() || stat.size === 0) continue;
        const fd = __require("fs").openSync(filePath, "r");
        const buf = Buffer.alloc(Math.min(FRONTMATTER_MAX_BYTES, stat.size));
        __require("fs").readSync(fd, buf, 0, buf.length, 0);
        __require("fs").closeSync(fd);
        const content = buf.toString("utf-8");
        const fm = parseFrontmatter(content);
        results.push({
          filename: file,
          filePath,
          name: fm.name || file.replace(".md", ""),
          description: fm.description,
          type: fm.type,
          mtimeMs: stat.mtimeMs,
          score: 0
        });
      } catch {
      }
    }
  } catch {
  }
  return results;
}
function scanAllMemories() {
  const headers = [];
  const projectsDir = join2(CLAUDE_HOME, "projects");
  if (existsSync2(projectsDir)) {
    try {
      for (const proj of readdirSync(projectsDir)) {
        const memDir = join2(projectsDir, proj, "memory");
        headers.push(...scanDir(memDir));
      }
    } catch {
    }
  }
  const agentMemDir = join2(CLAUDE_HOME, "agent-memory");
  if (existsSync2(agentMemDir)) {
    try {
      for (const agent of readdirSync(agentMemDir)) {
        const dir = join2(agentMemDir, agent);
        if (existsSync2(dir) && statSync2(dir).isDirectory()) {
          headers.push(...scanDir(dir));
        }
      }
    } catch {
    }
  }
  return headers;
}
function scoreMemories(headers, query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return [];
  for (const header of headers) {
    let score = 0;
    const searchText = `${header.name} ${header.description} ${header.filename} ${header.type}`.toLowerCase();
    for (const word of queryWords) {
      if (searchText.includes(word)) {
        score += 10;
      }
    }
    if (searchText.includes(queryLower.substring(0, 30))) {
      score += 20;
    }
    const filenameLower = header.filename.toLowerCase().replace(".md", "").replace(/[-_]/g, " ");
    for (const word of queryWords) {
      if (filenameLower.includes(word)) {
        score += 15;
      }
    }
    if (header.type === "feedback") score += 5;
    if (header.type === "project") score += 3;
    const ageMs = Date.now() - header.mtimeMs;
    if (ageMs < 7 * 24 * 60 * 60 * 1e3) score += 5;
    else if (ageMs < 30 * 24 * 60 * 60 * 1e3) score += 2;
    header.score = score;
  }
  return headers.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
function loadMemoryContents(selected) {
  const parts = [];
  let totalSize = 0;
  for (const mem of selected) {
    try {
      let content = readFileSync2(mem.filePath, "utf-8").trim();
      if (totalSize + content.length > MAX_CONTEXT_SIZE) {
        const remaining = MAX_CONTEXT_SIZE - totalSize;
        if (remaining < 200) break;
        content = content.substring(0, remaining) + "\n[... truncated]";
      }
      parts.push(`### ${mem.name} (${mem.type || "unknown"}, score: ${mem.score})
*Source: ${mem.filename}*

${content}`);
      totalSize += content.length;
    } catch {
    }
  }
  return parts.join("\n\n---\n\n");
}
function readStdin() {
  return readFileSync2(0, "utf-8");
}
async function main() {
  const input = JSON.parse(readStdin());
  if (process.env.CLAUDE_AGENT_ID) return;
  if (input.prompt.length < 15) return;
  if (input.prompt.trim().startsWith("/")) return;
  const allHeaders = scanAllMemories();
  if (allHeaders.length === 0) return;
  const selected = scoreMemories(allHeaders, input.prompt);
  if (selected.length === 0) return;
  const contents = loadMemoryContents(selected);
  if (!contents) return;
  const context = `## Smart Memory Recall (${selected.length} relevant memories found)

${contents}

---
*Memory recall otomatik. Alakali icerik varsa kullan, yoksa yok say.*`;
  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context
    }
  };
  console.log(JSON.stringify(budgetHookOutput(output, "smart-memory-recall", "UserPromptSubmit")));
}
main().catch(() => {
});

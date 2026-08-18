// src/edit-context-inject.ts
import { readFileSync as readFileSync3 } from "fs";
import { basename } from "path";

// src/daemon-client.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { join, resolve } from "path";
import { tmpdir } from "os";
import * as net from "net";
import * as crypto from "crypto";
function resolveProjectDir(projectDir) {
  return resolve(projectDir);
}
function getLockPath(projectDir) {
  const resolvedPath = resolveProjectDir(projectDir);
  const hash = crypto.createHash("md5").update(resolvedPath).digest("hex").substring(0, 8);
  return `${tmpdir()}/tldr-${hash}.lock`;
}
function getPidPath(projectDir) {
  const resolvedPath = resolveProjectDir(projectDir);
  const hash = crypto.createHash("md5").update(resolvedPath).digest("hex").substring(0, 8);
  return `${tmpdir()}/tldr-${hash}.pid`;
}
function isDaemonProcessRunning(projectDir) {
  const pidPath = getPidPath(projectDir);
  if (!existsSync(pidPath)) return false;
  try {
    const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
    if (isNaN(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function tryAcquireLock(projectDir) {
  const lockPath = getLockPath(projectDir);
  try {
    if (existsSync(lockPath)) {
      const lockContent = readFileSync(lockPath, "utf-8");
      const lockTime = parseInt(lockContent, 10);
      if (!isNaN(lockTime) && Date.now() - lockTime < 3e4) {
        return false;
      }
      try {
        unlinkSync(lockPath);
      } catch {
      }
    }
    writeFileSync(lockPath, Date.now().toString(), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
function releaseLock(projectDir) {
  try {
    unlinkSync(getLockPath(projectDir));
  } catch {
  }
}
var QUERY_TIMEOUT = 3e3;
function getConnectionInfo(projectDir) {
  const resolvedPath = resolveProjectDir(projectDir);
  const hash = crypto.createHash("md5").update(resolvedPath).digest("hex").substring(0, 8);
  if (process.platform === "win32") {
    const port = 49152 + parseInt(hash, 16) % 1e4;
    return { type: "tcp", host: "127.0.0.1", port };
  } else {
    return { type: "unix", path: `${tmpdir()}/tldr-${hash}.sock` };
  }
}
function getStatusFile(projectDir) {
  const statusPath = join(projectDir, ".tldr", "status");
  if (existsSync(statusPath)) {
    try {
      return readFileSync(statusPath, "utf-8").trim();
    } catch {
      return null;
    }
  }
  return null;
}
function isIndexing(projectDir) {
  return getStatusFile(projectDir) === "indexing";
}
function isDaemonReachable(projectDir) {
  const connInfo = getConnectionInfo(projectDir);
  if (connInfo.type === "tcp") {
    try {
      const testSocket = new net.Socket();
      testSocket.setTimeout(100);
      let connected = false;
      testSocket.on("connect", () => {
        connected = true;
        testSocket.destroy();
      });
      testSocket.on("error", () => {
        testSocket.destroy();
      });
      testSocket.connect(connInfo.port, connInfo.host);
      const end = Date.now() + 200;
      while (Date.now() < end && !connected) {
      }
      return connected;
    } catch {
      return false;
    }
  } else {
    if (!existsSync(connInfo.path)) {
      return false;
    }
    if (isDaemonProcessRunning(projectDir)) {
      try {
        execSync(`echo '{"cmd":"ping"}' | nc -U "${connInfo.path}"`, {
          encoding: "utf-8",
          timeout: 1e3,
          // Increased from 500ms
          stdio: ["pipe", "pipe", "pipe"]
        });
        return true;
      } catch {
        return true;
      }
    }
    try {
      execSync(`echo '{"cmd":"ping"}' | nc -U "${connInfo.path}"`, {
        encoding: "utf-8",
        timeout: 500,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return true;
    } catch {
      try {
        unlinkSync(connInfo.path);
      } catch {
      }
      return false;
    }
  }
}
function tryStartDaemon(projectDir) {
  try {
    if (isDaemonProcessRunning(projectDir)) {
      return true;
    }
    if (isDaemonReachable(projectDir)) {
      return true;
    }
    if (!tryAcquireLock(projectDir)) {
      const start = Date.now();
      while (Date.now() - start < 5e3) {
        if (isDaemonProcessRunning(projectDir) || isDaemonReachable(projectDir)) {
          return true;
        }
        const end = Date.now() + 100;
        while (Date.now() < end) {
        }
      }
      return isDaemonProcessRunning(projectDir) || isDaemonReachable(projectDir);
    }
    try {
      const tldrPath = join(projectDir, "opc", "packages", "tldr-code");
      let started = false;
      if (existsSync(tldrPath)) {
        const result = spawnSync("uv", ["run", "tldr", "daemon", "start", "--project", projectDir], {
          timeout: 1e4,
          stdio: "ignore",
          cwd: tldrPath
        });
        started = result.status === 0;
      }
      if (!started && !process.env.TLDR_DEV) {
        spawnSync("tldr", ["daemon", "start", "--project", projectDir], {
          timeout: 5e3,
          stdio: "ignore"
        });
      }
      const start = Date.now();
      while (Date.now() - start < 1e4) {
        if (isDaemonReachable(projectDir)) {
          const cooldown = Date.now() + 1e3;
          while (Date.now() < cooldown) {
          }
          return true;
        }
        const end = Date.now() + 100;
        while (Date.now() < end) {
        }
      }
      return isDaemonReachable(projectDir);
    } finally {
      releaseLock(projectDir);
    }
  } catch {
    return false;
  }
}
function queryDaemonSync(query, projectDir) {
  if (isIndexing(projectDir)) {
    return {
      indexing: true,
      status: "indexing",
      message: "Daemon is still indexing, results may be incomplete"
    };
  }
  const connInfo = getConnectionInfo(projectDir);
  if (!isDaemonReachable(projectDir)) {
    if (!tryStartDaemon(projectDir)) {
      return { status: "unavailable", error: "Daemon not running and could not start" };
    }
  }
  try {
    const input = JSON.stringify(query);
    let result;
    if (connInfo.type === "tcp") {
      const psCommand = `
        $client = New-Object System.Net.Sockets.TcpClient('${connInfo.host}', ${connInfo.port})
        $stream = $client.GetStream()
        $writer = New-Object System.IO.StreamWriter($stream)
        $reader = New-Object System.IO.StreamReader($stream)
        $writer.WriteLine('${input.replace(/'/g, "''")}')
        $writer.Flush()
        $response = $reader.ReadLine()
        $client.Close()
        Write-Output $response
      `.trim();
      result = execSync(`powershell -Command "${psCommand.replace(/"/g, '\\"')}"`, {
        encoding: "utf-8",
        timeout: QUERY_TIMEOUT
      });
    } else {
      result = execSync(`echo '${input}' | nc -U "${connInfo.path}"`, {
        encoding: "utf-8",
        timeout: QUERY_TIMEOUT
      });
    }
    return JSON.parse(result.trim());
  } catch (err) {
    if (err.killed) {
      return { status: "error", error: "timeout" };
    }
    if (err.message?.includes("ECONNREFUSED") || err.message?.includes("ENOENT")) {
      return { status: "unavailable", error: "Daemon not running" };
    }
    return { status: "error", error: err.message || "Unknown error" };
  }
}
function trackHookActivitySync(hookName, projectDir, success = true, metrics = {}) {
  try {
    queryDaemonSync(
      { cmd: "track", hook: hookName, success, metrics },
      projectDir
    );
  } catch {
  }
}

// src/shared/context-budget.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync, statSync } from "fs";
import { dirname, join as join2 } from "path";
import { homedir } from "os";
var DEFAULT_LIMITS = {
  perEventChars: 4e3,
  sessionChars: 12e3
};
function budgetPath() {
  return process.env.VIBECO_CONTEXT_BUDGET_PATH || join2(homedir(), ".claude", "cache", "context-budget.json");
}
function runtimePath() {
  return process.env.VIBECO_RUNTIME_PATH || join2(homedir(), ".claude", "vibecosystem-runtime.json");
}
function getBudgetLimits() {
  try {
    const path = runtimePath();
    if (existsSync2(path)) {
      const runtime = JSON.parse(readFileSync2(path, "utf-8"));
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
    if (existsSync2(path)) {
      return JSON.parse(readFileSync2(path, "utf-8"));
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
    if (!existsSync2(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync2(path, JSON.stringify(budget, null, 2));
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
var HOOK_RELEVANCE = {
  "tldr-read-enforcer": ["implementation", "debug", "research"],
  "smart-search-router": ["implementation", "debug", "research"],
  "signature-helper": ["implementation"],
  "arch-context-inject": ["implementation", "planning"],
  "compiler-in-the-loop": ["implementation", "debug"],
  "edit-context-inject": ["implementation"],
  "impact-refactor": ["implementation"]
};
function isRelevantForIntent(hookName) {
  const relevantTypes = HOOK_RELEVANCE[hookName];
  if (!relevantTypes) return true;
  try {
    const intentPath = join2(homedir(), ".claude", "cache", "current-intent.json");
    if (!existsSync2(intentPath)) return true;
    const fileStat = statSync(intentPath);
    const ageMs = Date.now() - fileStat.mtimeMs;
    if (ageMs > 30 * 60 * 1e3) return true;
    const intent = JSON.parse(readFileSync2(intentPath, "utf-8"));
    const taskType = intent.task_type || "conversational";
    return relevantTypes.includes(taskType);
  } catch {
    return true;
  }
}

// src/edit-context-inject.ts
function getTLDRImports(filePath) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const response = queryDaemonSync(
      { cmd: "imports", file: filePath },
      projectDir
    );
    if (response.indexing || response.status === "unavailable" || response.status === "error") {
      return [];
    }
    if (response.imports && Array.isArray(response.imports)) {
      return response.imports;
    }
    return [];
  } catch {
    return [];
  }
}
function getTLDRExtract(filePath, sessionId) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const response = queryDaemonSync(
      { cmd: "extract", file: filePath, session: sessionId },
      projectDir
    );
    if (response.indexing || response.status === "unavailable" || response.status === "error") {
      return null;
    }
    if (response.result) {
      return response.result;
    }
    return null;
  } catch {
    return null;
  }
}
async function main() {
  const input = JSON.parse(readFileSync3(0, "utf-8"));
  if (!isRelevantForIntent("edit-context-inject")) {
    console.log("{}");
    return;
  }
  if (input.tool_name !== "Edit") {
    console.log("{}");
    return;
  }
  const filePath = input.tool_input.file_path;
  if (!filePath) {
    console.log("{}");
    return;
  }
  const extract = getTLDRExtract(filePath, input.session_id);
  const imports = getTLDRImports(filePath);
  const classCount = extract?.classes?.length || 0;
  const funcCount = extract?.functions?.length || 0;
  const importCount = imports.length;
  const total = classCount + funcCount;
  if (total === 0 && importCount === 0) {
    console.log("{}");
    return;
  }
  const parts = [];
  if (importCount > 0) {
    const importModules = imports.slice(0, 8).map((i) => i.module);
    parts.push(`Dependencies: ${importModules.join(", ")}${importCount > 8 ? "..." : ""}`);
  }
  if (classCount > 0 && extract) {
    const classNames = extract.classes.map((c) => c.name).slice(0, 10);
    parts.push(`Classes: ${classNames.join(", ")}${classCount > 10 ? "..." : ""}`);
  }
  if (funcCount > 0 && extract) {
    const funcSummaries = extract.functions.slice(0, 12).map((f) => {
      const paramCount = f.params?.length || 0;
      return paramCount > 0 ? `${f.name}(${paramCount})` : f.name;
    });
    parts.push(`Functions: ${funcSummaries.join(", ")}${funcCount > 12 ? "..." : ""}`);
  }
  const symbolInfo = total > 0 ? `${total} symbols` : "";
  const depInfo = importCount > 0 ? `${importCount} deps` : "";
  const summary = [symbolInfo, depInfo].filter(Boolean).join(", ");
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `[Edit context: ${basename(filePath)} - ${summary}]
${parts.join("\n")}`
    }
  };
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  trackHookActivitySync("edit-context-inject", projectDir, true, {
    edits_processed: 1,
    symbols_shown: total
  });
  console.log(JSON.stringify(budgetHookOutput(output, "edit-context-inject", "PreToolUse:Edit")));
}
main().catch(() => console.log("{}"));

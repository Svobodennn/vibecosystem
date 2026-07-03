// src/canavar-subagent-tracker.ts
import { readFileSync as readFileSync3 } from "fs";

// src/shared/agent-error-scan.ts
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import http from "http";
var LOOKBACK_BYTES = 256 * 1024;
var CANAVAR_DIR = join(homedir(), ".claude", "canavar");
var LEDGER_PATH = join(CANAVAR_DIR, "error-ledger.jsonl");
var MATRIX_PATH = join(CANAVAR_DIR, "skill-matrix.json");
function loadMatrix(matrixPath) {
  try {
    if (existsSync(matrixPath)) return JSON.parse(readFileSync(matrixPath, "utf-8"));
  } catch {
  }
  return { agents: {}, updated_at: "" };
}
function ensureProfile(matrix, agentType) {
  if (!matrix.agents[agentType]) {
    matrix.agents[agentType] = {
      total_tasks: 0,
      successes: 0,
      failures: 0,
      success_rate: 0,
      skills: {},
      common_errors: [],
      last_active: ""
    };
  }
  return matrix.agents[agentType];
}
function recordAgentStart(agentType, matrixPath = MATRIX_PATH) {
  try {
    if (!existsSync(CANAVAR_DIR)) mkdirSync(CANAVAR_DIR, { recursive: true });
    const matrix = loadMatrix(matrixPath);
    const profile = ensureProfile(matrix, agentType);
    profile.last_active = (/* @__PURE__ */ new Date()).toISOString();
    matrix.updated_at = profile.last_active;
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  } catch {
  }
}
function emitDashboardEvent(event) {
  return new Promise((resolve) => {
    try {
      const postData = Buffer.from(JSON.stringify(event));
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: 3847,
          path: "/event",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": postData.length },
          timeout: 400
        },
        () => resolve()
      );
      req.on("error", () => resolve());
      req.on("timeout", () => {
        req.destroy();
        resolve();
      });
      req.write(postData);
      req.end();
    } catch {
      resolve();
    }
  });
}

// src/shared/canavar-store.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, statSync as statSync2, readdirSync, unlinkSync } from "fs";
import { join as join2, dirname as dirname2 } from "path";
import { homedir as homedir2 } from "os";
var CANAVAR_DIR2 = join2(homedir2(), ".claude", "canavar");
var LEDGER_PATH2 = join2(CANAVAR_DIR2, "error-ledger.jsonl");
var RUNNING_PATH = join2(CANAVAR_DIR2, "running-agents.json");
var LEDGER_MAX_BYTES = 1024 * 1024;
var HANG_THRESHOLD_MS = 30 * 60 * 1e3;
var STALE_THRESHOLD_MS = 24 * 60 * 60 * 1e3;
function loadRunning(path) {
  try {
    if (existsSync2(path)) return JSON.parse(readFileSync2(path, "utf-8"));
  } catch {
  }
  return {};
}
function saveRunning(map, path) {
  try {
    if (!existsSync2(dirname2(path))) mkdirSync2(dirname2(path), { recursive: true });
    writeFileSync2(path, JSON.stringify(map, null, 1));
  } catch {
  }
}
function registerRunningAgent(agentId, agentType, sessionId, path = RUNNING_PATH) {
  try {
    const map = loadRunning(path);
    map[agentId] = {
      agent_type: agentType,
      session: sessionId.slice(0, 8),
      started_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveRunning(map, path);
  } catch {
  }
}

// src/canavar-subagent-tracker.ts
async function main() {
  let raw = "";
  try {
    raw = readFileSync3(0, "utf-8");
  } catch {
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
  const agentType = input.agent_type || "unknown-agent";
  const agentId = input.agent_id || "unknown";
  const sessionId = (input.session_id || "unknown").slice(0, 8);
  if (input.agent_type) recordAgentStart(agentType);
  registerRunningAgent(agentId, agentType, input.session_id || "unknown");
  await emitDashboardEvent({
    type: "agent_spawn",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId,
    agentType,
    agentId,
    status: "running",
    metadata: { source: "subagent-start" }
  });
  console.log("{}");
}
main();

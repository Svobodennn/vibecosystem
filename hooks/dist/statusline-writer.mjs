// src/statusline-writer.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";

// src/shared/statusline.ts
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var STATUSLINE_PATH = join(homedir(), ".claude", "statusline.json");
function readStatusline() {
  try {
    if (existsSync(STATUSLINE_PATH)) {
      return JSON.parse(readFileSync(STATUSLINE_PATH, "utf-8"));
    }
  } catch {
  }
  return {
    session: "",
    profile: "all",
    agents: { running: 0, completed: 0, errors: 0 },
    tools: 0,
    duration: "0s",
    lastAgent: "",
    intent: "",
    updated: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function writeStatusline(data) {
  try {
    writeFileSync(STATUSLINE_PATH, JSON.stringify(data), { encoding: "utf-8" });
  } catch {
  }
}
function formatDuration(startMs) {
  const elapsed = Math.floor((Date.now() - startMs) / 1e3);
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  return `${Math.floor(elapsed / 3600)}h${Math.floor(elapsed % 3600 / 60)}m`;
}

// src/statusline-writer.ts
var CLAUDE_DIR = join2(homedir2(), ".claude");
function main() {
  let input;
  try {
    input = JSON.parse(readFileSync2("/dev/stdin", "utf-8"));
  } catch {
    return;
  }
  const data = readStatusline();
  if (input.session_id && !data.session) {
    data.session = input.session_id;
  }
  try {
    const configPath = join2(CLAUDE_DIR, "plugin-config.json");
    if (existsSync2(configPath)) {
      const config = JSON.parse(readFileSync2(configPath, "utf-8"));
      data.profile = config.activeProfile || "all";
    }
  } catch {
  }
  try {
    const intentPath = join2(CLAUDE_DIR, "cache", "current-intent.json");
    if (existsSync2(intentPath)) {
      const intent = JSON.parse(readFileSync2(intentPath, "utf-8"));
      data.intent = intent.taskType || intent.intent || "";
    }
  } catch {
  }
  data.tools++;
  const toolName = input.tool_name;
  const toolInput = input.tool_input;
  const hasResponse = input.tool_response !== void 0 && input.tool_response !== null;
  if (toolName === "Agent" || toolName === "Task") {
    const agentType = toolInput.subagent_type || toolInput.type || "unknown";
    if (!hasResponse) {
      data.agents.running++;
      data.lastAgent = agentType;
    } else {
      const responseStr = typeof input.tool_response === "string" ? input.tool_response : JSON.stringify(input.tool_response || "");
      const hasError = responseStr.toLowerCase().includes("error") || responseStr.toLowerCase().includes("fail");
      if (data.agents.running > 0) data.agents.running--;
      if (hasError) {
        data.agents.errors++;
      } else {
        data.agents.completed++;
      }
      data.lastAgent = agentType;
    }
  }
  if (!data.updated || data.duration === "0s") {
    data.duration = "0s";
  } else {
    try {
      const startTime = new Date(data.updated.replace(/T.*/, "T00:00:00Z")).getTime();
      data.duration = formatDuration(startTime);
    } catch {
    }
  }
  data.updated = (/* @__PURE__ */ new Date()).toISOString();
  writeStatusline(data);
  process.stdout.write("{}");
}
main();

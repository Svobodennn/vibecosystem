// src/canavar-skill-tracker.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// src/shared/event-schema.ts
var LIFECYCLE_EVENTS = /* @__PURE__ */ new Set(["agent_spawn", "agent_complete", "agent_error"]);
function asString(value) {
  return typeof value === "string" ? value : "";
}
function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw;
  const meta = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
  const ts = asString(r.ts) || asString(r.timestamp);
  const session = asString(r.session) || asString(r.sessionId);
  const event = asString(r.event) || asString(r.type);
  if (!ts && !session && !event) {
    return null;
  }
  return {
    ts,
    // Yazanlar zaten 8 karaktere kirpiyor; idempotent, tuketici filtresiyle hizali
    session: session.slice(0, 8),
    event,
    tool: asString(r.tool) || asString(meta.tool),
    detail: asString(r.detail) || asString(meta.command) || asString(meta.promptSummary) || asString(meta.source),
    agentType: asString(r.agent_type) || asString(r.agentType),
    agentId: asString(r.agent_id) || asString(r.agentId)
  };
}
function normalizeEvents(rawList) {
  const out = [];
  for (const raw of rawList) {
    const normalized = normalizeEvent(raw);
    if (normalized) {
      out.push(normalized);
    }
  }
  return out;
}
function isLifecycleEvent(event) {
  return LIFECYCLE_EVENTS.has(event);
}

// src/canavar-skill-tracker.ts
function fileToSkill(detail) {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(detail)) return "typescript";
  if (/\.(py|pyi)$/i.test(detail)) return "python";
  if (/\.(go)$/i.test(detail)) return "go";
  if (/\.(sql)$/i.test(detail)) return "database";
  if (/\.(ya?ml|dockerfile|\.github)/i.test(detail)) return "devops";
  if (/\.(test|spec)\./i.test(detail)) return "testing";
  if (/\.(md|txt|rst)$/i.test(detail)) return "documentation";
  if (/\.(css|scss|less|styled)$/i.test(detail)) return "styling";
  return null;
}
function readJsonl(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").split("\n").filter((l) => l.trim());
  const results = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {
    }
  }
  return results;
}
function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
  }
  let sessionId = "unknown";
  if (raw) {
    try {
      const input = JSON.parse(raw);
      sessionId = input.session_id?.slice(0, 8) || "unknown";
    } catch {
    }
  }
  const claudeDir = join(homedir(), ".claude");
  const canavarDir = join(claudeDir, "canavar");
  if (!existsSync(canavarDir)) mkdirSync(canavarDir, { recursive: true });
  const eventsPath = join(claudeDir, "agent-events.jsonl");
  const ledgerPath = join(canavarDir, "error-ledger.jsonl");
  const matrixPath = join(canavarDir, "skill-matrix.json");
  let matrix = { agents: {}, updated_at: "" };
  if (existsSync(matrixPath)) {
    try {
      matrix = JSON.parse(readFileSync(matrixPath, "utf-8"));
    } catch {
    }
  }
  const allEvents = normalizeEvents(readJsonl(eventsPath));
  const sessionEvents = allEvents.filter((e) => e.session === sessionId);
  const allErrors = readJsonl(ledgerPath);
  const sessionErrors = allErrors.filter((e) => e.session === sessionId);
  const agentEvents = /* @__PURE__ */ new Map();
  for (const evt of sessionEvents) {
    const aType = evt.agentType || "main";
    if (!agentEvents.has(aType)) agentEvents.set(aType, []);
    agentEvents.get(aType).push(evt);
  }
  const agentErrors = /* @__PURE__ */ new Map();
  for (const err of sessionErrors) {
    const aType = err.agent_type || "main";
    if (!agentErrors.has(aType)) agentErrors.set(aType, []);
    agentErrors.get(aType).push(err);
  }
  const allAgentTypes = /* @__PURE__ */ new Set([...agentEvents.keys(), ...agentErrors.keys()]);
  for (const agentType of allAgentTypes) {
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
    const profile = matrix.agents[agentType];
    const events = agentEvents.get(agentType) || [];
    const errors = agentErrors.get(agentType) || [];
    const taskEvents = events.filter(
      (e) => e.tool === "Edit" || e.tool === "Write" || e.tool === "Bash" || isLifecycleEvent(e.event)
    );
    if (taskEvents.length > 0 || errors.length > 0) {
      profile.total_tasks++;
      if (errors.length === 0 && taskEvents.length > 0) {
        profile.successes++;
      } else if (errors.length > 0) {
        profile.failures++;
      }
      profile.success_rate = profile.total_tasks > 0 ? Number((profile.successes / profile.total_tasks).toFixed(2)) : 0;
      profile.last_active = (/* @__PURE__ */ new Date()).toISOString();
    }
    for (const evt of events) {
      const skill = fileToSkill(evt.detail);
      if (skill) {
        if (!profile.skills[skill]) {
          profile.skills[skill] = { attempts: 0, successes: 0, rate: 0 };
        }
        profile.skills[skill].attempts++;
      }
    }
    for (const err of errors) {
      const skill = fileToSkill(err.file);
      if (skill && profile.skills[skill]) {
      } else if (skill) {
        if (!profile.skills[skill]) {
          profile.skills[skill] = { attempts: 0, successes: 0, rate: 0 };
        }
        profile.skills[skill].attempts++;
      }
    }
    for (const [skillName, stats] of Object.entries(profile.skills)) {
      const errorCount = errors.filter((e) => fileToSkill(e.file) === skillName).length;
      stats.successes = stats.attempts - errorCount;
      if (stats.successes < 0) stats.successes = 0;
      stats.rate = stats.attempts > 0 ? Number((stats.successes / stats.attempts).toFixed(2)) : 1;
    }
    const errorPatterns = allErrors.filter((e) => e.agent_type === agentType).map((e) => e.error_pattern);
    const patternCounts = /* @__PURE__ */ new Map();
    for (const p of errorPatterns) {
      patternCounts.set(p, (patternCounts.get(p) || 0) + 1);
    }
    profile.common_errors = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pattern, count]) => `${pattern} (${count}x)`);
  }
  matrix.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  const agentCount = Object.keys(matrix.agents).length;
  const sessionErrorCount = sessionErrors.length;
  console.log(JSON.stringify({
    result: `Canavar: ${agentCount} agent profiled, ${sessionErrorCount} errors this session`
  }));
}
main();

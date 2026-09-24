// src/session-analytics.ts
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// src/shared/event-schema.ts
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

// src/session-analytics.ts
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
  const cacheDir = join(claudeDir, "cache");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const eventsPath = join(claudeDir, "agent-events.jsonl");
  const perfPath = join(cacheDir, "hook-perf.jsonl");
  const ledgerPath = join(claudeDir, "canavar", "error-ledger.jsonl");
  const outputPath = join(cacheDir, "session-analytics.jsonl");
  const allEvents = normalizeEvents(readJsonl(eventsPath));
  const sessionEvents = allEvents.filter((e) => e.session === sessionId);
  const allPerf = readJsonl(perfPath);
  const sessionPerf = allPerf.filter((p) => p.session === sessionId);
  const allErrors = readJsonl(ledgerPath);
  const sessionErrors = allErrors.filter((e) => e.session === sessionId);
  const toolCounts = {};
  for (const evt of sessionEvents) {
    if (evt.tool) {
      toolCounts[evt.tool] = (toolCounts[evt.tool] || 0) + 1;
    }
  }
  const agentSpawns = sessionEvents.filter((e) => e.event === "agent_spawn" || e.tool === "Agent").length;
  let hookTotalMs = 0;
  let hookSlowest = null;
  for (const p of sessionPerf) {
    hookTotalMs += p.duration_ms;
    if (!hookSlowest || p.duration_ms > hookSlowest.ms) {
      hookSlowest = { name: p.hook, ms: p.duration_ms };
    }
  }
  let durationMs = 0;
  if (sessionEvents.length > 0) {
    const timestamps = sessionEvents.map((e) => new Date(e.ts).getTime()).filter((t) => !isNaN(t));
    if (timestamps.length >= 2) {
      durationMs = Math.max(...timestamps) - Math.min(...timestamps);
    }
  }
  const analytics = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: sessionId,
    duration_ms: durationMs,
    tool_counts: toolCounts,
    agent_spawns: agentSpawns,
    errors: sessionErrors.length,
    hook_total_ms: Math.round(hookTotalMs * 100) / 100,
    hook_slowest: hookSlowest ? { name: hookSlowest.name, ms: Math.round(hookSlowest.ms * 100) / 100 } : null
  };
  try {
    appendFileSync(outputPath, JSON.stringify(analytics) + "\n");
  } catch {
  }
  console.log(JSON.stringify({
    result: `Analytics: ${Object.values(toolCounts).reduce((a, b) => a + b, 0)} tool calls, ${agentSpawns} agents, ${sessionErrors.length} errors, ${Math.round(hookTotalMs)}ms hook overhead`
  }));
}
main();

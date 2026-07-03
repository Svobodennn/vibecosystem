// src/palace-auto-save.ts
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
var PALACE_DIR = join(homedir(), ".claude", "palace");
var ROOM_KEYWORDS = {
  authentication: ["auth", "login", "jwt", "oauth", "session", "token", "password", "credential"],
  database: ["database", "sql", "migration", "schema", "query", "postgres", "mysql", "mongo", "redis"],
  deployment: ["deploy", "ci/cd", "docker", "kubernetes", "k8s", "vercel", "aws", "pipeline"],
  frontend: ["react", "css", "component", "ui", "ux", "tailwind", "next.js", "vue", "svelte"],
  api: ["api", "endpoint", "rest", "graphql", "grpc", "route", "handler", "middleware"],
  testing: ["test", "tdd", "coverage", "mock", "fixture", "assertion", "vitest", "jest", "playwright"],
  security: ["security", "xss", "injection", "cors", "csrf", "vulnerability", "audit"],
  performance: ["performance", "cache", "optimize", "latency", "bundle", "lazy", "profil"],
  configuration: ["config", "env", "settings", "dotenv", "yaml", "toml"],
  architecture: ["architect", "design", "pattern", "refactor", "structure", "module", "layer"]
};
function detectRoom(content) {
  const lower = content.toLowerCase();
  let bestRoom = "general";
  let bestScore = 0;
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRoom = room;
    }
  }
  return bestRoom;
}
function detectType(content) {
  const lower = content.toLowerCase();
  if (lower.includes("chose") || lower.includes("decided") || lower.includes("selected") || lower.includes("picked")) return "decision";
  if (lower.includes("error") || lower.includes("fix") || lower.includes("bug") || lower.includes("resolved")) return "error";
  if (lower.includes("must") || lower.includes("required") || lower.includes("constraint") || lower.includes("limit")) return "constraint";
  if (lower.includes("pattern") || lower.includes("always") || lower.includes("convention")) return "pattern";
  return "discovery";
}
function getProjectName() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, "");
    } catch {
    }
  }
  return basename(projectDir);
}
function generateId() {
  return "d-" + createHash("md5").update(Date.now().toString() + Math.random().toString()).digest("hex").slice(0, 8);
}
function isSignificantOutput(output) {
  if (!output || output.length < 100) return false;
  const markers = [
    "decided",
    "chose",
    "architecture",
    "because",
    "reason:",
    "conclusion",
    "error:",
    "fixed",
    "resolved",
    "constraint",
    "requirement",
    "pattern"
  ];
  const lower = output.toLowerCase();
  return markers.some((m) => lower.includes(m));
}
function saveToPalace(entry) {
  mkdirSync(PALACE_DIR, { recursive: true });
  const indexPath = join(PALACE_DIR, "index.json");
  let index = {};
  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, "utf-8"));
    } catch {
    }
  }
  if (!index[entry.wing]) {
    index[entry.wing] = { rooms: [], lastUpdate: "" };
  }
  if (!index[entry.wing].rooms.includes(entry.room)) {
    index[entry.wing].rooms.push(entry.room);
  }
  index[entry.wing].lastUpdate = entry.timestamp;
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  const wingFile = join(PALACE_DIR, `${entry.wing}.jsonl`);
  appendFileSync(wingFile, JSON.stringify(entry) + "\n");
}
async function main() {
  let input;
  try {
    input = readFileSync("/dev/stdin", "utf-8");
  } catch {
    process.exit(0);
  }
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  if (event.tool_name !== "Agent" || !event.tool_output) {
    console.log(JSON.stringify({ result: "approve" }));
    return;
  }
  const output = String(event.tool_output);
  if (!isSignificantOutput(output)) {
    console.log(JSON.stringify({ result: "approve" }));
    return;
  }
  const wing = getProjectName();
  const room = detectRoom(output);
  const type = detectType(output);
  const agentType = String(event.tool_input?.subagent_type || "unknown");
  const sentences = output.split(/[.!?\n]/).filter((s) => s.trim().length > 20);
  const content = sentences.slice(0, 2).join(". ").slice(0, 200);
  if (!content) {
    console.log(JSON.stringify({ result: "approve" }));
    return;
  }
  const entry = {
    id: generateId(),
    wing,
    room,
    content,
    tags: [room, type, agentType],
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: event.session_id || "unknown",
    agent: agentType,
    type
  };
  try {
    saveToPalace(entry);
  } catch {
  }
  console.log(JSON.stringify({ result: "approve" }));
}
main().catch(() => process.exit(0));

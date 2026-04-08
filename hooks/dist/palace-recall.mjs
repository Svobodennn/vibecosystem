// src/palace-recall.ts
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
var PALACE_DIR = join(homedir(), ".claude", "palace");
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
function loadLayer2(project) {
  const wingFile = join(PALACE_DIR, `${project}.jsonl`);
  if (!existsSync(wingFile)) return [];
  try {
    const lines = readFileSync(wingFile, "utf-8").split("\n").filter((l) => l.trim());
    const facts = [];
    const seen = /* @__PURE__ */ new Set();
    for (const line of lines.slice(-50).reverse()) {
      try {
        const entry = JSON.parse(line);
        const key = `${entry.room}:${entry.content.slice(0, 50)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (entry.type === "decision" || entry.type === "constraint") {
          facts.push(`[${entry.room}] ${entry.content}`);
        }
      } catch {
      }
    }
    return facts.slice(0, 10);
  } catch {
    return [];
  }
}
function loadLastSession(project) {
  const sessionsFile = join(PALACE_DIR, `${project}-sessions.jsonl`);
  if (!existsSync(sessionsFile)) return null;
  try {
    const lines = readFileSync(sessionsFile, "utf-8").split("\n").filter((l) => l.trim());
    if (lines.length === 0) return null;
    const last = JSON.parse(lines[lines.length - 1]);
    const parts = [];
    if (last.acde?.actions?.length) {
      parts.push("Last session: " + last.acde.actions.slice(0, 3).join(", "));
    }
    if (last.acde?.entities?.length) {
      parts.push("Files: " + last.acde.entities.slice(0, 5).join(", "));
    }
    return parts.join(" | ");
  } catch {
    return null;
  }
}
function getRoomSummary(project) {
  const indexPath = join(PALACE_DIR, "index.json");
  if (!existsSync(indexPath)) return "";
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf-8"));
    const wing = index[project];
    if (!wing?.rooms?.length) return "";
    return `Rooms: ${wing.rooms.join(", ")}`;
  } catch {
    return "";
  }
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
  if (event.type !== "startup" && event.type !== "resume") {
    process.exit(0);
  }
  const project = getProjectName();
  if (!existsSync(PALACE_DIR)) {
    process.exit(0);
  }
  const facts = loadLayer2(project);
  const lastSession = loadLastSession(project);
  const rooms = getRoomSummary(project);
  if (facts.length === 0 && !lastSession) {
    process.exit(0);
  }
  const parts = [`[Memory Palace] Project: ${project}`];
  if (rooms) parts.push(rooms);
  if (lastSession) {
    parts.push("");
    parts.push(lastSession);
  }
  if (facts.length > 0) {
    parts.push("");
    parts.push("Critical Facts:");
    for (const fact of facts) {
      parts.push(`  ${fact}`);
    }
  }
  parts.push("");
  parts.push("Use memory-palace skill for deeper recall. Layer 3-4 available on demand.");
  console.log(JSON.stringify({
    systemMessage: parts.join("\n")
  }));
}
main().catch(() => process.exit(0));

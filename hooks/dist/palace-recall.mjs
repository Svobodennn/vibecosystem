// src/palace-recall.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { join as join2, resolve as resolve2, sep } from "node:path";
import { homedir } from "node:os";

// src/shared/project-identity.ts
import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join, basename, resolve } from "path";
var cachedIdentity = null;
function getProjectIdentity() {
  if (cachedIdentity) return cachedIdentity;
  const projectPath = getGitRoot();
  if (!projectPath) return null;
  const hash = createHash("md5").update(projectPath).digest("hex").slice(0, 12);
  const name = detectProjectName(projectPath);
  cachedIdentity = { hash, name, path: projectPath };
  return cachedIdentity;
}
function getGitRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return resolve(process.env.CLAUDE_PROJECT_DIR);
  }
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      timeout: 500,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return root || null;
  } catch {
    return null;
  }
}
function detectProjectName(projectPath) {
  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name && typeof pkg.name === "string") return pkg.name;
    } catch {
    }
  }
  const goModPath = join(projectPath, "go.mod");
  if (existsSync(goModPath)) {
    try {
      const content = readFileSync(goModPath, "utf-8");
      const match = /^module\s+(\S+)/m.exec(content);
      if (match) {
        const parts = match[1].trim().split("/");
        return parts[parts.length - 1];
      }
    } catch {
    }
  }
  const pyPath = join(projectPath, "pyproject.toml");
  if (existsSync(pyPath)) {
    try {
      const content = readFileSync(pyPath, "utf-8");
      const section = content.match(/\[project\]\s*\n([\s\S]*?)(?:\n\[|$)/);
      if (section) {
        const nameMatch = /^name\s*=\s*"(.+?)"/m.exec(section[1]);
        if (nameMatch) return nameMatch[1];
      }
    } catch {
    }
  }
  const cargoPath = join(projectPath, "Cargo.toml");
  if (existsSync(cargoPath)) {
    try {
      const content = readFileSync(cargoPath, "utf-8");
      const section = content.match(/\[package\]\s*\n([\s\S]*?)(?:\n\[|$)/);
      if (section) {
        const nameMatch = /^name\s*=\s*"(.+?)"/m.exec(section[1]);
        if (nameMatch) return nameMatch[1];
      }
    } catch {
    }
  }
  return basename(projectPath);
}
function sanitizeProjectName(name) {
  if (!name || typeof name !== "string") return "default";
  const stripped = name.replace(/^@[^/]+\//, "");
  const safe = stripped.replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 64);
  const result = safe.replace(/^\.+/, "").replace(/\.+$/, "");
  return result || "default";
}
function getSafeProjectName() {
  try {
    const identity = getProjectIdentity();
    if (identity?.name) return sanitizeProjectName(identity.name);
  } catch {
  }
  try {
    const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    return sanitizeProjectName(basename(dir));
  } catch {
    return "default";
  }
}

// src/palace-recall.ts
var PALACE_DIR = join2(homedir(), ".claude", "palace");
function safePalacePath(filename) {
  const candidate = resolve2(join2(PALACE_DIR, filename));
  const root = resolve2(PALACE_DIR);
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  return candidate;
}
function loadLayer2(project) {
  const wingFile = safePalacePath(`${project}.jsonl`);
  if (!wingFile || !existsSync2(wingFile)) return [];
  try {
    const lines = readFileSync2(wingFile, "utf-8").split("\n").filter((l) => l.trim());
    const facts = [];
    const seen = /* @__PURE__ */ new Set();
    for (const line of lines.slice(-50).reverse()) {
      try {
        const entry = JSON.parse(line);
        if (typeof entry.content !== "string" || typeof entry.room !== "string") continue;
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
  const sessionsFile = safePalacePath(`${project}-sessions.jsonl`);
  if (!sessionsFile || !existsSync2(sessionsFile)) return null;
  try {
    const lines = readFileSync2(sessionsFile, "utf-8").split("\n").filter((l) => l.trim());
    if (lines.length === 0) return null;
    const last = JSON.parse(lines[lines.length - 1]);
    const parts = [];
    if (Array.isArray(last.acde?.actions) && last.acde.actions.length) {
      parts.push("Last session: " + last.acde.actions.slice(0, 3).join(", "));
    }
    if (Array.isArray(last.acde?.entities) && last.acde.entities.length) {
      parts.push("Files: " + last.acde.entities.slice(0, 5).join(", "));
    }
    return parts.length ? parts.join(" | ") : null;
  } catch {
    return null;
  }
}
function getRoomSummary(project) {
  const indexPath = join2(PALACE_DIR, "index.json");
  if (!existsSync2(indexPath)) return "";
  try {
    const index = JSON.parse(readFileSync2(indexPath, "utf-8"));
    const wing = index[project];
    if (!wing?.rooms?.length) return "";
    return `Rooms: ${wing.rooms.join(", ")}`;
  } catch {
    return "";
  }
}
function runHook() {
  let input;
  try {
    input = readFileSync2(0, "utf-8");
  } catch {
    return;
  }
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return;
  }
  const phase = event.source ?? event.type;
  if (phase !== "startup" && phase !== "resume") return;
  if (!existsSync2(PALACE_DIR)) return;
  const project = getSafeProjectName();
  const facts = loadLayer2(project);
  const lastSession = loadLastSession(project);
  const rooms = getRoomSummary(project);
  if (facts.length === 0 && !lastSession) return;
  const parts = [`[Memory Palace] Project: ${project}`];
  if (rooms) parts.push(rooms);
  if (lastSession) {
    parts.push("");
    parts.push(lastSession);
  }
  if (facts.length > 0) {
    parts.push("");
    parts.push("Critical Facts:");
    for (const fact of facts) parts.push(`  ${fact}`);
  }
  parts.push("");
  parts.push("Use memory-palace skill for deeper recall. Layer 3-4 available on demand.");
  console.log(JSON.stringify({
    systemMessage: parts.join("\n")
  }));
}
try {
  runHook();
} catch {
  process.exit(0);
}

// src/session-compressor.ts
import { readFileSync as readFileSync2, appendFileSync, existsSync as existsSync2, mkdirSync } from "node:fs";
import { join as join2, resolve as resolve2, sep } from "node:path";
import { homedir } from "node:os";
import { execSync as execSync2 } from "node:child_process";

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

// src/session-compressor.ts
var PALACE_DIR = join2(homedir(), ".claude", "palace");
function safePalacePath(filename) {
  const candidate = resolve2(join2(PALACE_DIR, filename));
  const root = resolve2(PALACE_DIR);
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  return candidate;
}
function getRecentChangedFiles() {
  try {
    const result = execSync2("git diff --name-only HEAD~3 HEAD 2>/dev/null || git diff --name-only 2>/dev/null", {
      encoding: "utf-8",
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      timeout: 5e3
    });
    return result.split("\n").filter((f) => f.trim()).slice(0, 20);
  } catch {
    return [];
  }
}
function getRecentCommits() {
  try {
    const result = execSync2("git log --oneline -5 2>/dev/null", {
      encoding: "utf-8",
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      timeout: 5e3
    });
    return result.split("\n").filter((l) => l.trim());
  } catch {
    return [];
  }
}
function getProjectContext() {
  const context = [];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (existsSync2(join2(projectDir, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync2(join2(projectDir, "package.json"), "utf-8"));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
      if (deps.length) context.push(`Stack: Node.js, ${deps.join(", ")}`);
    } catch {
    }
  }
  try {
    const branch = execSync2("git branch --show-current 2>/dev/null", {
      encoding: "utf-8",
      cwd: projectDir,
      timeout: 3e3
    }).trim();
    if (branch) context.push(`Branch: ${branch}`);
  } catch {
  }
  return context;
}
function loadPalaceDecisions(project) {
  const wingFile = safePalacePath(`${project}.jsonl`);
  if (!wingFile || !existsSync2(wingFile)) return [];
  try {
    const lines = readFileSync2(wingFile, "utf-8").split("\n").filter((l) => l.trim());
    const decisions = [];
    for (const line of lines.slice(-10)) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "decision" && typeof entry.content === "string") {
          decisions.push(`${entry.room}: ${entry.content}`);
        }
      } catch {
      }
    }
    return decisions;
  } catch {
    return [];
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
  const project = getSafeProjectName();
  const files = getRecentChangedFiles();
  const commits = getRecentCommits();
  const context = getProjectContext();
  const decisions = loadPalaceDecisions(project);
  const summary = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: event.session_id || "unknown",
    project,
    acde: {
      actions: commits.map((c) => `[x] ${c}`),
      context,
      decisions: decisions.slice(-5),
      entities: files.slice(0, 15)
    }
  };
  mkdirSync(PALACE_DIR, { recursive: true });
  const sessionsFile = safePalacePath(`${project}-sessions.jsonl`);
  if (sessionsFile) {
    try {
      appendFileSync(sessionsFile, JSON.stringify(summary) + "\n");
    } catch {
    }
  }
  const lines = [`[Session Compressed] Project: ${project}`, ""];
  if (summary.acde.actions.length) {
    lines.push("Actions:");
    summary.acde.actions.forEach((a) => lines.push(`  ${a}`));
    lines.push("");
  }
  if (summary.acde.context.length) {
    lines.push("Context:");
    summary.acde.context.forEach((c) => lines.push(`  ${c}`));
    lines.push("");
  }
  if (summary.acde.decisions.length) {
    lines.push("Decisions:");
    summary.acde.decisions.forEach((d) => lines.push(`  ${d}`));
    lines.push("");
  }
  if (summary.acde.entities.length) {
    lines.push("Changed Files:");
    summary.acde.entities.forEach((e) => lines.push(`  ${e}`));
  }
  console.log(JSON.stringify({ systemMessage: lines.join("\n") }));
}
try {
  runHook();
} catch {
  process.exit(0);
}

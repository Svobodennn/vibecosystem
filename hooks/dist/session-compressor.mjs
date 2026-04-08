// src/session-compressor.ts
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
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
function getRecentChangedFiles() {
  try {
    const result = execSync("git diff --name-only HEAD~3 HEAD 2>/dev/null || git diff --name-only 2>/dev/null", {
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
    const result = execSync("git log --oneline -5 2>/dev/null", {
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
  if (existsSync(join(projectDir, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8"));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
      context.push(`Stack: Node.js, ${deps.join(", ")}`);
    } catch {
    }
  }
  try {
    const branch = execSync("git branch --show-current 2>/dev/null", {
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
  const wingFile = join(PALACE_DIR, `${project}.jsonl`);
  if (!existsSync(wingFile)) return [];
  try {
    const lines = readFileSync(wingFile, "utf-8").split("\n").filter((l) => l.trim());
    const decisions = [];
    for (const line of lines.slice(-10)) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "decision") {
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
  const project = getProjectName();
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
  const sessionsFile = join(PALACE_DIR, `${project}-sessions.jsonl`);
  try {
    appendFileSync(sessionsFile, JSON.stringify(summary) + "\n");
  } catch {
  }
  const acdeText = [
    `[Session Compressed] Project: ${project}`,
    "",
    "Actions:",
    ...summary.acde.actions.map((a) => `  ${a}`),
    "",
    "Context:",
    ...summary.acde.context.map((c) => `  ${c}`),
    "",
    decisions.length ? "Decisions:" : "",
    ...summary.acde.decisions.map((d) => `  ${d}`),
    "",
    "Changed Files:",
    ...summary.acde.entities.map((e) => `  ${e}`)
  ].filter((l) => l !== void 0).join("\n");
  console.log(JSON.stringify({
    systemMessage: acdeText
  }));
}
main().catch(() => process.exit(0));

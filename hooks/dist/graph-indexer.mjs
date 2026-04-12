// src/graph-indexer.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";
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

// src/graph-indexer.ts
function isMcpAvailable() {
  const mcpConfigPath = join2(homedir(), ".mcp.json");
  if (!existsSync2(mcpConfigPath)) return false;
  try {
    const config = JSON.parse(readFileSync2(mcpConfigPath, "utf-8"));
    return !!config.mcpServers?.["codebase-memory"];
  } catch {
    return false;
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
  if (!isMcpAvailable()) return;
  const projectName = getSafeProjectName();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const message = [
    `[Knowledge Graph] codebase-memory MCP available.`,
    `Project: "${projectName}" at ${projectDir}`,
    `Use mcp__codebase-memory__index_repository to index for token-efficient queries.`,
    `Use mcp__codebase-memory__search_code for targeted queries instead of reading whole files.`
  ].join("\n");
  console.log(JSON.stringify({
    systemMessage: message
  }));
}
try {
  runHook();
} catch {
  process.exit(0);
}

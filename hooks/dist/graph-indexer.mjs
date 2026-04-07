// src/graph-indexer.ts
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
function detectProjectName() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, "");
    } catch {
    }
  }
  const goModPath = join(projectDir, "go.mod");
  if (existsSync(goModPath)) {
    try {
      const content = readFileSync(goModPath, "utf-8");
      const match = content.match(/^module\s+(\S+)/m);
      if (match) return basename(match[1]);
    } catch {
    }
  }
  return basename(projectDir);
}
function isMcpAvailable() {
  const mcpConfigPath = join(homedir(), ".mcp.json");
  if (!existsSync(mcpConfigPath)) return false;
  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
    return !!config.mcpServers?.["codebase-memory"];
  } catch {
    return false;
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
  if (!isMcpAvailable()) {
    process.exit(0);
  }
  const projectName = detectProjectName();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const message = [
    `[Knowledge Graph] codebase-memory MCP available.`,
    `Project: "${projectName}" at ${projectDir}`,
    `Use mcp__codebase-memory__index_repository to index for 6-71x token savings.`,
    `Use mcp__codebase-memory__search_code for targeted queries instead of reading whole files.`
  ].join("\n");
  console.log(JSON.stringify({
    systemMessage: message
  }));
}
main().catch(() => process.exit(0));

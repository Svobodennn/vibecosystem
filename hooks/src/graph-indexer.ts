/**
 * graph-indexer.ts - Knowledge Graph Auto-Indexer
 *
 * SessionStart hook that checks if codebase-memory MCP is available
 * and suggests indexing the current project for token-efficient queries.
 *
 * Does NOT block or modify prompts - only adds context suggestion.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

interface SessionEvent {
  type: string;
  session_id?: string;
}

function detectProjectName(): string {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Try package.json
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, '');
    } catch {}
  }

  // Try go.mod
  const goModPath = join(projectDir, 'go.mod');
  if (existsSync(goModPath)) {
    try {
      const content = readFileSync(goModPath, 'utf-8');
      const match = content.match(/^module\s+(\S+)/m);
      if (match) return basename(match[1]);
    } catch {}
  }

  return basename(projectDir);
}

function isMcpAvailable(): boolean {
  // Check ~/.mcp.json for codebase-memory config
  const mcpConfigPath = join(homedir(), '.mcp.json');
  if (!existsSync(mcpConfigPath)) return false;

  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
    return !!(config.mcpServers?.['codebase-memory']);
  } catch {
    return false;
  }
}

async function main() {
  let input: string;
  try {
    input = readFileSync('/dev/stdin', 'utf-8');
  } catch {
    process.exit(0);
  }

  let event: SessionEvent;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  // Only run on session start
  if (event.type !== 'startup' && event.type !== 'resume') {
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
    `Use mcp__codebase-memory__search_code for targeted queries instead of reading whole files.`,
  ].join('\n');

  console.log(JSON.stringify({
    systemMessage: message,
  }));
}

main().catch(() => process.exit(0));

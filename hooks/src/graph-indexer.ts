/**
 * graph-indexer.ts - Knowledge Graph Auto-Indexer
 *
 * SessionStart hook that checks if codebase-memory MCP is available
 * and suggests indexing the current project for token-efficient queries.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getSafeProjectName } from './shared/project-identity.js';

interface SessionEvent {
  type?: string;
  source?: string;
  session_id?: string;
}

function isMcpAvailable(): boolean {
  const mcpConfigPath = join(homedir(), '.mcp.json');
  if (!existsSync(mcpConfigPath)) return false;

  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
    return !!(config.mcpServers?.['codebase-memory']);
  } catch {
    return false;
  }
}

function runHook(): void {
  let input: string;
  try {
    input = readFileSync(0, 'utf-8');
  } catch { return; }

  let event: SessionEvent;
  try {
    event = JSON.parse(input);
  } catch { return; }

  const phase = event.source ?? event.type;
  if (phase !== 'startup' && phase !== 'resume') return;

  if (!isMcpAvailable()) return;

  const projectName = getSafeProjectName();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const message = [
    `[Knowledge Graph] codebase-memory MCP available.`,
    `Project: "${projectName}" at ${projectDir}`,
    `Use mcp__codebase-memory__index_repository to index for token-efficient queries.`,
    `Use mcp__codebase-memory__search_code for targeted queries instead of reading whole files.`,
  ].join('\n');

  console.log(JSON.stringify({
    systemMessage: message,
  }));
}

try { runHook(); } catch { process.exit(0); }

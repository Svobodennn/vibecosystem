/**
 * Statusline Writer - PostToolUse hook
 *
 * Updates ~/.claude/statusline.json after every tool call.
 * Enables real-time terminal HUD via Claude Code's statusLine config.
 *
 * Tracks: agent spawns/completions/errors, tool count, session duration,
 * active profile, current intent, last agent used.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readStatusline, writeStatusline, formatDuration } from './shared/statusline.js';

const CLAUDE_DIR = join(homedir(), '.claude');

function main(): void {
  let input: {
    session_id: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_response?: unknown;
  };

  try {
    input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  } catch {
    return;
  }

  const data = readStatusline();

  // Session ID
  if (input.session_id && !data.session) {
    data.session = input.session_id;
  }

  // Profile from plugin-config.json
  try {
    const configPath = join(CLAUDE_DIR, 'plugin-config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      data.profile = config.activeProfile || 'all';
    }
  } catch { /* keep existing */ }

  // Intent from current-intent.json
  try {
    const intentPath = join(CLAUDE_DIR, 'cache', 'current-intent.json');
    if (existsSync(intentPath)) {
      const intent = JSON.parse(readFileSync(intentPath, 'utf-8'));
      data.intent = intent.taskType || intent.intent || '';
    }
  } catch { /* keep existing */ }

  // Tool count
  data.tools++;

  // Agent tracking
  const toolName = input.tool_name;
  const toolInput = input.tool_input as Record<string, string>;
  const hasResponse = input.tool_response !== undefined && input.tool_response !== null;

  if (toolName === 'Agent' || toolName === 'Task') {
    const agentType = toolInput.subagent_type || toolInput.type || 'unknown';

    if (!hasResponse) {
      // Agent spawned (PreToolUse or no response yet)
      data.agents.running++;
      data.lastAgent = agentType;
    } else {
      // Agent completed
      const responseStr = typeof input.tool_response === 'string'
        ? input.tool_response
        : JSON.stringify(input.tool_response || '');
      const hasError = responseStr.toLowerCase().includes('error') ||
                       responseStr.toLowerCase().includes('fail');

      if (data.agents.running > 0) data.agents.running--;

      if (hasError) {
        data.agents.errors++;
      } else {
        data.agents.completed++;
      }
      data.lastAgent = agentType;
    }
  }

  // Duration - use session start from statusline or approximate
  if (!data.updated || data.duration === '0s') {
    // First event of session
    data.duration = '0s';
  } else {
    try {
      const startTime = new Date(data.updated.replace(/T.*/, 'T00:00:00Z')).getTime();
      data.duration = formatDuration(startTime);
    } catch {
      // Keep existing duration
    }
  }

  data.updated = new Date().toISOString();

  writeStatusline(data);

  // Output empty JSON (hook should not block)
  process.stdout.write('{}');
}

main();

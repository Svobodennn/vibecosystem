/**
 * token-tracker.ts - Token Usage Tracker
 *
 * PostToolUse hook that estimates token usage per tool call
 * and writes to ~/.claude/token-usage.jsonl for dashboard consumption.
 *
 * Also broadcasts to dashboard WebSocket if running.
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface ToolEvent {
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  session_id?: string;
}

interface TokenEntry {
  timestamp: string;
  session_id: string;
  tool: string;
  input_chars: number;
  output_chars: number;
  total_chars: number;
  agent?: string;
}

// Rough char-to-token approximation
function charCount(text: string | undefined): number {
  if (!text) return 0;
  return String(text).length;
}

function runHook(): void {
  let input: string;
  try {
    input = readFileSync(0, 'utf-8');
  } catch { return; }

  let event: ToolEvent;
  try {
    event = JSON.parse(input);
  } catch { return; }

  const claudeDir = join(homedir(), '.claude');
  const logFile = join(claudeDir, 'token-usage.jsonl');

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  const inputChars = charCount(JSON.stringify(event.tool_input || {}));
  const outputChars = charCount(event.tool_output);

  const entry: TokenEntry = {
    timestamp: new Date().toISOString(),
    session_id: event.session_id || 'unknown',
    tool: event.tool_name,
    input_chars: inputChars,
    output_chars: outputChars,
    total_chars: inputChars + outputChars,
  };

  if (event.tool_name === 'Agent' && event.tool_input) {
    entry.agent = String(event.tool_input.subagent_type || 'general-purpose');
  }

  try {
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch { /* silent */ }
}

try { runHook(); } catch { process.exit(0); }

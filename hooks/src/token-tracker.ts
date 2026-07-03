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
  input_tokens_est: number;
  output_tokens_est: number;
  total_est: number;
  agent?: string;
}

// Rough token estimation: ~4 chars per token
function estimateTokens(text: string | undefined): number {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

async function main() {
  let input: string;
  try {
    input = readFileSync('/dev/stdin', 'utf-8');
  } catch {
    process.exit(0);
  }

  let event: ToolEvent;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const claudeDir = join(homedir(), '.claude');
  const logFile = join(claudeDir, 'token-usage.jsonl');

  // Ensure directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  const inputTokens = estimateTokens(JSON.stringify(event.tool_input || {}));
  const outputTokens = estimateTokens(event.tool_output);

  const entry: TokenEntry = {
    timestamp: new Date().toISOString(),
    session_id: event.session_id || 'unknown',
    tool: event.tool_name,
    input_tokens_est: inputTokens,
    output_tokens_est: outputTokens,
    total_est: inputTokens + outputTokens,
  };

  // Check if this is an agent-related tool call
  if (event.tool_name === 'Agent' && event.tool_input) {
    entry.agent = String(event.tool_input.subagent_type || 'general-purpose');
  }

  try {
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch {}

  // Try to broadcast to dashboard WebSocket
  try {
    const { createConnection } = await import('node:net');
    const client = createConnection({ port: 3847, host: '127.0.0.1' }, () => {
      client.write(JSON.stringify({ type: 'token_usage', ...entry }));
      client.end();
    });
    client.on('error', () => {}); // Silently ignore if dashboard not running
  } catch {}

  // Output approve (PostToolUse hooks should not block)
  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch(() => process.exit(0));

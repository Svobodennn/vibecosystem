/**
 * Token Usage Logger - PostToolUse hook (C3)
 *
 * Her tool call'un input/output token tahminini hesaplar ve
 * ~/.claude/token-usage.jsonl'a tek satir JSONL olarak yazar.
 *
 * Token estimate: char / 4 heuristic (zero-dep, performans kritik).
 * Anthropic gercek tokenizer ~3.5 char/token; bu yaklasim close enough.
 *
 * Fail-silent: hata olursa ana is akisini bozma, `{}` dondur.
 * Hedef execution time: < 30ms.
 */
import { appendFileSync } from 'fs';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface PostToolInput {
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
}

interface TokenLogEntry {
  ts: string;
  session: string;
  tool: string;
  agent: string | null;
  input_est: number;
  output_est: number;
  total_est: number;
}

const TOKEN_LOG = join(homedir(), '.claude', 'token-usage.jsonl');

// Response cap — cok buyuk response'larda JSON.stringify cost'unu sinirla.
// 100KB cap, gercek payload'in token'i ile orantili (char/4 = ~25k token).
const MAX_RESPONSE_SCAN = 100000;

function safeStringifyLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    return value.length > MAX_RESPONSE_SCAN ? MAX_RESPONSE_SCAN : value.length;
  }
  try {
    const s = JSON.stringify(value);
    if (!s) return 0;
    return s.length > MAX_RESPONSE_SCAN ? MAX_RESPONSE_SCAN : s.length;
  } catch {
    return 0;
  }
}

function estimateTokens(charLength: number): number {
  // char / 4 heuristic — tokenizer cagrisi YOK (performans).
  return Math.ceil(charLength / 4);
}

function extractAgentType(toolName: string, toolInput: unknown): string | null {
  // Agent/Task tool'larinda subagent_type veya type alani agent kimligini verir.
  if (toolName !== 'Agent' && toolName !== 'Task') return null;
  if (!toolInput || typeof toolInput !== 'object') return null;
  const ti = toolInput as Record<string, unknown>;
  const candidate = ti.subagent_type || ti.type;
  return typeof candidate === 'string' ? candidate : null;
}

function main(): void {
  // 1) stdin oku — Claude Code PostToolUse payload'i.
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    console.log('{}');
    return;
  }
  if (!raw) {
    console.log('{}');
    return;
  }

  // 2) Parse — bozuksa silent exit.
  let input: PostToolInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.log('{}');
    return;
  }

  const toolName = typeof input.tool_name === 'string' ? input.tool_name : '';
  if (!toolName) {
    console.log('{}');
    return;
  }

  // 3) Token estimate hesapla.
  const inputChars = safeStringifyLength(input.tool_input);
  const outputChars = safeStringifyLength(input.tool_response);
  const input_est = estimateTokens(inputChars);
  const output_est = estimateTokens(outputChars);
  const total_est = input_est + output_est;

  // 4) JSONL entry olustur.
  const entry: TokenLogEntry = {
    ts: new Date().toISOString(),
    session: typeof input.session_id === 'string' ? input.session_id.slice(0, 8) : 'unknown',
    tool: toolName,
    agent: extractAgentType(toolName, input.tool_input),
    input_est,
    output_est,
    total_est,
  };

  // 5) Append-only disk yazimi — try/catch zorunlu, fail-silent.
  try {
    appendFileSync(TOKEN_LOG, JSON.stringify(entry) + '\n');
  } catch {
    // Sessizce devam — ana is akisini bozma.
  }

  console.log('{}');
}

main();

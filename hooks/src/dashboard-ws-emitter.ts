/**
 * Dashboard WebSocket Emitter - PostToolUse hook
 * Agent spawn, error, completion event'lerini ws://localhost:3847 adresine yayinlar.
 * Dashboard opsiyonel - baglanti yoksa sessizce devam eder.
 */
import { readFileSync } from 'fs';
import http from 'http';
import { createHash } from 'crypto';

interface PostToolInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: unknown;
}

interface DashboardEvent {
  type: 'agent_spawn' | 'agent_complete' | 'agent_error' | 'hook_fire' | 'tool_call';
  timestamp: string;
  sessionId: string;
  agentType?: string;
  agentId?: string;
  /**
   * C4: Parent agent identifier for sub-agent hierarchy.
   * Source priority:
   *   1. process.env.CLAUDE_PARENT_AGENT_ID (if Claude Code propagates it; verify via spike)
   *   2. undefined -> UI falls back to flat rendering (acceptance criteria)
   * Optional field: existing consumers ignore it; tree-aware UI uses indent + connector.
   */
  parentAgentId?: string;
  taskId?: string;
  duration?: number;
  status: 'running' | 'done' | 'error';
  metadata: Record<string, unknown>;
}

/**
 * Gercek hata sinyallerini tespit eder. Substring "error"/"fail" match'i YAPMAZ
 * (refactor-cleaner, security-reviewer gibi agent'lar normal ciktilarinda bu
 * kelimeleri kullanir; false positive uretir).
 */
function detectRealError(toolResponse: unknown): boolean {
  if (toolResponse === null || toolResponse === undefined) return false;

  // Object response'larda standart is_error flag'i
  if (typeof toolResponse === 'object') {
    const obj = toolResponse as Record<string, unknown>;
    if (obj.is_error === true) return true;
    if (obj.error && typeof obj.error === 'string' && obj.error.length > 0) return true;
    if (typeof obj.exit_code === 'number' && obj.exit_code !== 0) return true;
  }

  const responseStr = typeof toolResponse === 'string'
    ? toolResponse
    : JSON.stringify(toolResponse);

  // Bos response -> hata degil
  if (!responseStr || responseStr === '""' || responseStr === '{}') return false;

  // Gercek hata pattern'leri (substring degil, yapisal)
  const realErrorPatterns = [
    /^Error:/m,                          // Satir basinda "Error:"
    /^Uncaught\s+\w+Error/m,             // Uncaught TypeError, ReferenceError, ...
    /\bTraceback\s+\(most recent call/,  // Python traceback
    /^\s*at\s+\S+\s+\([^)]+:\d+:\d+\)/m, // JS stack trace
    /"is_error"\s*:\s*true/,             // JSON is_error
    /\bexit\s+code\s+[^0]\b/i,           // Non-zero exit code
    /\b(EACCES|ENOENT|EADDRINUSE|ETIMEDOUT)\b/, // Node errno
    /Permission denied/,
    /Command failed/,
    /Process exited with code [^0]/,
  ];

  return realErrorPatterns.some((re) => re.test(responseStr));
}

function extractAgentInfo(input: PostToolInput): Partial<DashboardEvent> {
  const ti = input.tool_input as Record<string, string>;

  if (input.tool_name === 'Agent' || input.tool_name === 'Task') {
    const agentType = ti.subagent_type || ti.type || 'unknown';
    const prompt = ti.description || ti.prompt || '';
    const promptSummary = typeof prompt === 'string' ? prompt.slice(0, 120) : '';

    const responseStr = typeof input.tool_response === 'string'
      ? input.tool_response
      : JSON.stringify(input.tool_response || '');
    const hasError = detectRealError(input.tool_response);

    const completeType: DashboardEvent['type'] = hasError ? 'agent_error' : 'agent_complete';
    const completeStatus: DashboardEvent['status'] = hasError ? 'error' : 'done';

    // H2: Error context — sadece gercek hata durumunda response'un ilk 500 char'ini sakla.
    // Token tasarrufu: normal complete event'lerde EKLEME. UI'da expand ile gosterilir.
    // XSS guard UI tarafinda (textContent + escapeHtml) yapilir; burada raw snippet kalir.
    let errorContext: string | undefined;
    if (hasError) {
      errorContext = responseStr.slice(0, 500);
    }

    // H9: Synthetic correlation ID (Plan B — H9-SPIKE confirmed no tool_use_id/task_id in
    // PostToolUse input). Same agent + same session + same prompt prefix -> same hash -> retry.
    // 16 hex chars = ~10^19 collision space (safe within a session). Fail-silent: hash error
    // must not break event emission (createHash should never throw on string input, but be defensive).
    let correlationId: string | undefined;
    try {
      const sessionPrefix = (input.session_id || '').slice(0, 8);
      correlationId = createHash('sha256')
        .update(`${agentType}:${sessionPrefix}:${promptSummary.slice(0, 100)}`)
        .digest('hex')
        .slice(0, 16);
    } catch {
      // Defensive: if hashing fails for any reason, event still ships without correlationId.
      correlationId = undefined;
    }

    return {
      type: completeType,
      agentType,
      status: completeStatus,
      metadata: {
        promptSummary,
        responseLength: responseStr.length,
        emitSpawn: true, // main() complete'den once spawn event'i de yayinlasin
        ...(correlationId ? { correlationId } : {}), // H9: opsiyonel field, eski consumer'lar yok sayar
        ...(errorContext ? { errorContext } : {}), // H2: sadece varsa ekle (opsiyonel field)
      },
    };
  }

  if (input.tool_name === 'Bash') {
    const cmd = (ti.command || '').slice(0, 200);
    const hasError = detectRealError(input.tool_response);

    return {
      type: 'tool_call',
      status: hasError ? 'error' : 'done',
      metadata: { tool: 'Bash', command: cmd },
    };
  }

  // Diger tool'lar
  return {
    type: 'tool_call',
    status: 'done',
    metadata: {
      tool: input.tool_name,
      detail: JSON.stringify(input.tool_input).slice(0, 150),
    },
  };
}

function sendToWebSocket(event: DashboardEvent): Promise<void> {
  return new Promise((resolve) => {
    // Raw TCP ile WebSocket frame gonderme yerine,
    // basit UDP-like fire-and-forget HTTP POST kullaniyoruz
    // Dashboard server bunu alip WS client'lara broadcast eder
    const payload = JSON.stringify(event);
    const postData = Buffer.from(payload);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3847,
        path: '/event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length,
        },
        timeout: 500,
      },
      () => resolve()
    );

    req.on('error', () => resolve()); // Sessizce devam et
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(postData);
    req.end();
  });
}

async function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { return; }
  if (!raw) { console.log('{}'); return; }

  let input: PostToolInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  // Sadece ilginc event'leri gonder (Agent, Task, Bash, Edit, Write)
  const interestingTools = ['Agent', 'Task', 'Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob'];
  if (!interestingTools.includes(input.tool_name)) {
    console.log('{}');
    return;
  }

  const partial = extractAgentInfo(input);
  const now = new Date();
  const sessionId = (input.session_id || 'unknown').slice(0, 8);

  // C4 SPIKE: One-shot stderr probe to verify CLAUDE_PARENT_AGENT_ID propagation.
  // Gated by DASHBOARD_C4_SPIKE=1 so it does not spam stderr on every hook fire.
  // To run the spike: `DASHBOARD_C4_SPIKE=1 claude` and inspect stderr after one
  // agent spawn. Remove DASHBOARD_C4_SPIKE from env once decision documented.
  if (process.env.DASHBOARD_C4_SPIKE === '1' && partial.agentType) {
    try {
      console.error(JSON.stringify({
        c4_spike: {
          tool: input.tool_name,
          self_agent_id: process.env.CLAUDE_AGENT_ID || null,
          parent_agent_id: process.env.CLAUDE_PARENT_AGENT_ID || null,
          claude_env_keys: Object.keys(process.env).filter(k => k.startsWith('CLAUDE_')),
          spawned_agent_type: partial.agentType,
        }
      }));
    } catch { /* fire-and-forget */ }
  }

  // C4: Parent agent ID — only present if Claude Code propagates this env var.
  // If undefined, dashboard UI degrades to flat render (backward compat).
  const parentAgentId = process.env.CLAUDE_PARENT_AGENT_ID || undefined;

  // Agent/Task icin once SPAWN event'i de yay (timeline'da hem spawn hem
  // complete/error gozuksun diye). PreToolUse hook'u yok cunku.
  const meta = partial.metadata as Record<string, unknown> | undefined;
  if (meta?.emitSpawn && partial.agentType) {
    // H9: correlationId hem spawn hem complete event'inde olmali — server retry tracking
    // sadece spawn'lari sayar ama tutarlilik icin ikisinde de tasiyalim.
    const correlationId = (meta.correlationId as string) || undefined;
    const spawnEvent: DashboardEvent = {
      type: 'agent_spawn',
      timestamp: new Date(now.getTime() - 1).toISOString(), // complete'den 1ms once
      sessionId,
      agentType: partial.agentType,
      agentId: process.env.CLAUDE_AGENT_ID || undefined,
      parentAgentId,
      status: 'running',
      metadata: {
        promptSummary: (meta.promptSummary as string) || '',
        ...(correlationId ? { correlationId } : {}),
      },
    };
    await sendToWebSocket(spawnEvent);
    delete meta.emitSpawn;
  }

  const event: DashboardEvent = {
    type: partial.type || 'tool_call',
    timestamp: now.toISOString(),
    sessionId,
    agentType: partial.agentType || undefined,
    agentId: process.env.CLAUDE_AGENT_ID || undefined,
    parentAgentId,
    status: partial.status || 'done',
    metadata: partial.metadata || {},
  };

  // Fire-and-forget: Dashboard'a gonder, yoksa skip et
  await sendToWebSocket(event);

  console.log('{}');
}

main();

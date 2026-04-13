/**
 * Dashboard WebSocket Emitter - PostToolUse hook
 * Agent spawn, error, completion event'lerini ws://localhost:3847 adresine yayinlar.
 * Dashboard opsiyonel - baglanti yoksa sessizce devam eder.
 */
import { readFileSync } from 'fs';

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
  taskId?: string;
  duration?: number;
  status: 'running' | 'done' | 'error';
  metadata: Record<string, unknown>;
}

function extractAgentInfo(input: PostToolInput): Partial<DashboardEvent> {
  const ti = input.tool_input as Record<string, string>;

  if (input.tool_name === 'Agent' || input.tool_name === 'Task') {
    const agentType = ti.subagent_type || ti.type || 'unknown';
    const prompt = ti.description || ti.prompt || '';
    const promptSummary = typeof prompt === 'string' ? prompt.slice(0, 120) : '';

    // tool_response varsa agent tamamlanmis demek (PostToolUse)
    const hasResponse = input.tool_response !== undefined && input.tool_response !== null;
    const responseStr = typeof input.tool_response === 'string'
      ? input.tool_response
      : JSON.stringify(input.tool_response || '');
    const hasError = responseStr.toLowerCase().includes('error') ||
                     responseStr.toLowerCase().includes('fail');

    let status: DashboardEvent['status'] = 'running';
    let type: DashboardEvent['type'] = 'agent_spawn';

    if (hasResponse && hasError) {
      status = 'error';
      type = 'agent_error';
    } else if (hasResponse) {
      status = 'done';
      type = 'agent_complete';
    }

    return {
      type,
      agentType,
      status,
      metadata: {
        promptSummary,
        responseLength: responseStr.length,
      },
    };
  }

  if (input.tool_name === 'Bash') {
    const cmd = (ti.command || '').slice(0, 200);
    const responseStr = typeof input.tool_response === 'string'
      ? input.tool_response
      : JSON.stringify(input.tool_response || '');
    const hasError = responseStr.includes('Error') ||
                     responseStr.includes('error:') ||
                     responseStr.includes('FAIL');

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

    const req = require('http').request(
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

  const event: DashboardEvent = {
    type: partial.type || 'tool_call',
    timestamp: new Date().toISOString(),
    sessionId: (input.session_id || 'unknown').slice(0, 8),
    agentType: partial.agentType || undefined,
    agentId: process.env.CLAUDE_AGENT_ID || undefined,
    status: partial.status || 'done',
    metadata: partial.metadata || {},
  };

  // Fire-and-forget: Dashboard'a gonder, yoksa skip et
  await sendToWebSocket(event);

  console.log('{}');
}

main();

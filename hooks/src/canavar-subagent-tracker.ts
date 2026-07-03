/**
 * Canavar Subagent Tracker - SubagentStart hook
 *
 * Subagent spawn olduğunda:
 *   1. skill-matrix.json'da profil oluşturur / last_active günceller
 *   2. Dashboard'a gerçek agent_id'li agent_spawn event'i yayınlar (real-time)
 *
 * Sonuç takibi (success/failure) SubagentStop tarafında yapılır
 * (subagent-stop-learner.ts → recordAgentStop). Bu hook sadece spawn kaydı tutar.
 *
 * Gerçek SubagentStart input şeması (2026-06-04 probe ile doğrulandı):
 *   { session_id, transcript_path, cwd, agent_id, agent_type, hook_event_name }
 */
import { readFileSync } from 'fs';
import { recordAgentStart, emitDashboardEvent } from './shared/agent-error-scan.js';
import { registerRunningAgent } from './shared/canavar-store.js';

interface SubagentStartInput {
  session_id: string;
  hook_event_name: string;
  agent_id?: string;
  agent_type?: string;
}

async function main(): Promise<void> {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { return; }
  if (!raw) { console.log('{}'); return; }

  let input: SubagentStartInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  if (input.hook_event_name !== 'SubagentStart') {
    console.log('{}');
    return;
  }

  const agentType = input.agent_type || 'unknown-agent';
  const agentId = input.agent_id || 'unknown';
  const sessionId = (input.session_id || 'unknown').slice(0, 8);

  // P3: kimliksiz iç sidechain'ler matrix'te unknown-agent profili açmasın
  if (input.agent_type) recordAgentStart(agentType);
  // A3 watchdog: Stop gelmezse main-scan 30dk sonra hung_agent olarak raporlar
  registerRunningAgent(agentId, agentType, input.session_id || 'unknown');

  await emitDashboardEvent({
    type: 'agent_spawn',
    timestamp: new Date().toISOString(),
    sessionId,
    agentType,
    agentId,
    status: 'running',
    metadata: { source: 'subagent-start' },
  });

  console.log('{}');
}

main();

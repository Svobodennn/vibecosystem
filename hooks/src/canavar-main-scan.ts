/**
 * Canavar Main Scan - Stop hook
 *
 * ANA session transcript'ini incremental tarar ve subagent-scan'in göremediği
 * üç hata sınıfını yakalar (beyin fırtınası A1+A2+D1, 2026-06-04):
 *
 *   A1. SPAWN FAIL: Fail eden Agent tool call'ları (örn. "Cannot create agent
 *       worktree") — PostToolUse fail'de ateşlenmez, SubagentStop hiç gelmez
 *       (agent doğmadı). Tek iz ana transcript'teki is_error Agent result'ı.
 *   A2. AGENT CRASH: API error / max-turn gibi sebeplerle hata döndüren Agent
 *       call'ları — aynı şekilde sadece ana transcript'te görünür.
 *   D1. PARENT HATALARI: Main context'in kendi Bash/Edit/tool hataları.
 *
 * Stop her asistan turunda tetiklenir → cursor (byte offset) ile sadece YENİ
 * satırlar taranır; çift kayıt imkânsız. Cursor: canavar/scan-cursors/<session>.json
 *
 * ASLA decision:block döndürmez (parent'ı durdurmak tehlikeli) — sadece kayıt.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  scanTranscriptIncremental,
  toLedgerEntries,
  appendLedgerEntries,
  emitDashboardEvent,
  type LedgerEntry,
} from './shared/agent-error-scan.js';
import {
  rotateLedgerIfNeeded,
  findHungAgents,
  hungAgentsToLedgerEntries,
  cleanupOldCursors,
} from './shared/canavar-store.js';

interface StopInput {
  session_id: string;
  transcript_path?: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

interface CursorState {
  offset: number;
  transcript_path: string;
  updated_at: string;
}

const CURSOR_DIR = join(homedir(), '.claude', 'canavar', 'scan-cursors');

function loadCursor(sessionId: string, transcriptPath: string): CursorState {
  try {
    const p = join(CURSOR_DIR, `${sessionId}.json`);
    if (existsSync(p)) {
      const state = JSON.parse(readFileSync(p, 'utf-8')) as CursorState;
      // Transcript yolu değiştiyse (beklenmez) eskiyi yeniden taramamak için sıfırla
      if (state.transcript_path === transcriptPath && typeof state.offset === 'number') {
        return state;
      }
    }
  } catch { /* bozuk cursor → baştan */ }
  return { offset: 0, transcript_path: transcriptPath, updated_at: '' };
}

function saveCursor(sessionId: string, state: CursorState): void {
  try {
    if (!existsSync(CURSOR_DIR)) mkdirSync(CURSOR_DIR, { recursive: true });
    writeFileSync(join(CURSOR_DIR, `${sessionId}.json`), JSON.stringify(state));
  } catch { /* fail-silent */ }
}

/** "subagent: scout" özetinden hedef agent türünü çıkar */
function targetAgentType(command: string): string {
  const m = /subagent:\s*(\S+)/.exec(command);
  return m ? m[1] : 'unknown';
}

/**
 * Agent/Task tool hatalarını spawn_fail olarak yeniden sınıflandır:
 * komut bazlı değil hedef-agent bazlı aggregate edilsinler.
 */
function reclassifyAgentFailures(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.map((e) => {
    if (e.tool !== 'Agent' && e.tool !== 'Task') return e;
    const target = targetAgentType(e.command || '');
    // detail formatı: "[Agent] subagent: X → <hata mesajı>" — lesson'a hata mesajının başını al
    const errMsg = (e.detail || '').split('→')[1]?.trim().slice(0, 120) || (e.detail || '').slice(0, 120);
    return {
      ...e,
      error_type: 'spawn_fail',
      error_pattern: `agent-fail: ${target}`,
      command_head: `agent:${target}`,
      lesson: `'${target}' agent çağrısı düştü — ${errMsg}`,
    };
  });
}

async function main(): Promise<void> {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { return; }
  if (!raw) { console.log('{}'); return; }

  let input: StopInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  if (input.hook_event_name !== 'Stop' || !input.transcript_path) {
    console.log('{}');
    return;
  }

  const sessionId = input.session_id || 'unknown';
  const cursor = loadCursor(sessionId, input.transcript_path);

  const { errors, offset } = scanTranscriptIncremental(input.transcript_path, cursor.offset);

  if (errors.length > 0) {
    const entries = reclassifyAgentFailures(
      toLedgerEntries(errors, { sessionId, agentId: 'main', agentType: 'main' }, 'main-scan')
    );
    appendLedgerEntries(entries);

    const spawnFails = entries.filter((e) => e.error_type === 'spawn_fail');
    if (spawnFails.length > 0) {
      await emitDashboardEvent({
        type: 'agent_error',
        timestamp: new Date().toISOString(),
        sessionId: sessionId.slice(0, 8),
        agentType: 'main',
        agentId: 'main',
        status: 'error',
        metadata: {
          spawnFail: true,
          targets: [...new Set(spawnFails.map((e) => e.command_head))],
          source: 'main-scan',
        },
      });
    }
  }

  saveCursor(sessionId, {
    offset,
    transcript_path: input.transcript_path,
    updated_at: new Date().toISOString(),
  });

  // A3 WATCHDOG: SubagentStart almış ama 30dk'dır Stop vermemiş agent'lar
  const hung = findHungAgents();
  if (hung.length > 0) {
    appendLedgerEntries(hungAgentsToLedgerEntries(hung));
    await emitDashboardEvent({
      type: 'agent_error',
      timestamp: new Date().toISOString(),
      sessionId: sessionId.slice(0, 8),
      agentType: 'main',
      agentId: 'main',
      status: 'error',
      metadata: { hungAgents: hung.map((h) => `${h.agent_type}(${h.running_minutes}dk)`), source: 'watchdog' },
    });
  }

  // E4 HİJYEN: ledger 1MB üstüne çıktıysa arşive devir; eski cursor'ları temizle
  rotateLedgerIfNeeded();
  cleanupOldCursors();

  console.log('{}');
}

main();

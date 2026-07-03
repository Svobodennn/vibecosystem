/**
 * Canavar Store - Ledger hijyeni + çalışan-agent takibi
 *
 * P2 paketi (2026-06-04):
 *
 *   E4. LEDGER ROTATION: error-ledger.jsonl sonsuz büyür; dashboard ve
 *       broadcast hook'u dosyayı baştan okur → performans saatli bombası.
 *       1MB üstünde eski satırlar archive/'a TAŞINIR (silinmez), aktif
 *       dosyada son 500 satır kalır.
 *
 *   A3. HANG WATCHDOG: SubagentStart geldi ama Stop hiç gelmedi (askıda
 *       process, interactive bekleyen komut, oturum çökmesi). running-agents.json
 *       lifecycle'ı: Start'ta kayıt → Stop'ta sil → 30dk+ kalan = hung_agent.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { LedgerEntry } from './agent-error-scan.js';

const CANAVAR_DIR = join(homedir(), '.claude', 'canavar');
const LEDGER_PATH = join(CANAVAR_DIR, 'error-ledger.jsonl');
const RUNNING_PATH = join(CANAVAR_DIR, 'running-agents.json');

// ---------------------------------------------------------------------------
// E4: Ledger rotation
// ---------------------------------------------------------------------------

export const LEDGER_MAX_BYTES = 1024 * 1024; // 1MB
export const LEDGER_KEEP_LINES = 500;

/**
 * Ledger eşiği aştıysa eski satırları archive/'a taşır (append-only audit korunur).
 * NOT: Atomic değil — rotation anında paralel append teorik olarak kaybolabilir
 * (~ms pencere, Stop hook'unda risk düşük); kabul edilmiş trade-off.
 */
export function rotateLedgerIfNeeded(
  ledgerPath: string = LEDGER_PATH,
  maxBytes: number = LEDGER_MAX_BYTES,
  keepLines: number = LEDGER_KEEP_LINES
): boolean {
  try {
    if (!existsSync(ledgerPath)) return false;
    if (statSync(ledgerPath).size <= maxBytes) return false;

    const lines = readFileSync(ledgerPath, 'utf-8').split('\n').filter((l) => l.trim());
    if (lines.length <= keepLines) return false;

    const archiveDir = join(dirname(ledgerPath), 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const archivePath = join(archiveDir, `error-ledger-${stamp}.jsonl`);

    writeFileSync(archivePath, lines.slice(0, -keepLines).join('\n') + '\n');
    writeFileSync(ledgerPath, lines.slice(-keepLines).join('\n') + '\n');
    return true;
  } catch {
    return false;
  }
}

/** Ledger'ın son n kaydını parse et (korelasyon kontrolleri için) */
export function readLedgerTail(n: number = 100, ledgerPath: string = LEDGER_PATH): LedgerEntry[] {
  try {
    if (!existsSync(ledgerPath)) return [];
    const lines = readFileSync(ledgerPath, 'utf-8').split('\n').filter((l) => l.trim());
    const out: LedgerEntry[] = [];
    for (const line of lines.slice(-n)) {
      try { out.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// A3: Running-agents lifecycle
// ---------------------------------------------------------------------------

export interface RunningAgent {
  agent_type: string;
  session: string;
  started_at: string;
  /** hung_agent olarak bir kez raporlandı (tekrar raporlanmasın) */
  flagged?: boolean;
}

type RunningMap = Record<string, RunningAgent>;

export const HANG_THRESHOLD_MS = 30 * 60 * 1000; // 30 dk
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 saat: oturum çökmesi kalıntısı

function loadRunning(path: string): RunningMap {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { /* bozuk → sıfırla */ }
  return {};
}

function saveRunning(map: RunningMap, path: string): void {
  try {
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(map, null, 1));
  } catch { /* fail-silent */ }
}

/** SubagentStart: agent'ı çalışıyor olarak kaydet */
export function registerRunningAgent(
  agentId: string,
  agentType: string,
  sessionId: string,
  path: string = RUNNING_PATH
): void {
  try {
    const map = loadRunning(path);
    map[agentId] = {
      agent_type: agentType,
      session: sessionId.slice(0, 8),
      started_at: new Date().toISOString(),
    };
    saveRunning(map, path);
  } catch { /* fail-silent */ }
}

/** SubagentStop: kaydı düş (normal yaşam döngüsü) */
export function clearRunningAgent(agentId: string, path: string = RUNNING_PATH): void {
  try {
    const map = loadRunning(path);
    if (map[agentId]) {
      delete map[agentId];
      saveRunning(map, path);
    }
  } catch { /* fail-silent */ }
}

export interface HungAgent {
  agent_id: string;
  agent_type: string;
  session: string;
  running_minutes: number;
}

/**
 * Eşiği aşan ve henüz raporlanmamış agent'ları döndürür; döndürdüklerini
 * flagged işaretler (idempotent rapor). 24h+ kalıntıları sessizce temizler.
 */
export function findHungAgents(
  thresholdMs: number = HANG_THRESHOLD_MS,
  now: number = Date.now(),
  path: string = RUNNING_PATH
): HungAgent[] {
  try {
    const map = loadRunning(path);
    const hung: HungAgent[] = [];
    let changed = false;

    for (const [agentId, rec] of Object.entries(map)) {
      const started = Date.parse(rec.started_at);
      if (!Number.isFinite(started)) {
        delete map[agentId];
        changed = true;
        continue;
      }
      const age = now - started;

      if (age > STALE_THRESHOLD_MS) {
        // Oturum çökmesi kalıntısı — raporlamadan temizle (zaten flagged'dı ya da çok eski)
        delete map[agentId];
        changed = true;
        continue;
      }

      if (age > thresholdMs && !rec.flagged) {
        hung.push({
          agent_id: agentId,
          agent_type: rec.agent_type,
          session: rec.session,
          running_minutes: Math.round(age / 60000),
        });
        rec.flagged = true;
        changed = true;
      }
    }

    if (changed) saveRunning(map, path);
    return hung;
  } catch {
    return [];
  }
}

/** Watchdog bulgularını ledger şemasına çevir */
export function hungAgentsToLedgerEntries(hung: HungAgent[]): LedgerEntry[] {
  const now = new Date().toISOString();
  return hung.map((h) => ({
    ts: now,
    session: h.session,
    agent_id: h.agent_id,
    agent_type: h.agent_type,
    error_type: 'hung_agent',
    error_pattern: `hung-agent: ${h.agent_type}`,
    detail: `'${h.agent_type}' (${h.agent_id}) ${h.running_minutes} dk'dır Stop vermedi — askıda olabilir`,
    file: 'unknown',
    lesson: `'${h.agent_type}' askıda kaldı — interactive komut/stdin bekliyor olabilir; uzun işler run_in_background + timeout ile verilmeli`,
    tool: 'watchdog',
    command: '',
    command_head: `hung:${h.agent_type}`,
    source: 'watchdog',
  }));
}

// ---------------------------------------------------------------------------
// Cursor hijyeni (main-scan'in scan-cursors/ dizini)
// ---------------------------------------------------------------------------

/** 7 günden eski cursor cache dosyalarını temizle (kendi ürettiğimiz cache) */
export function cleanupOldCursors(
  cursorDir: string = join(CANAVAR_DIR, 'scan-cursors'),
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
  now: number = Date.now()
): number {
  let removed = 0;
  try {
    if (!existsSync(cursorDir)) return 0;
    for (const name of readdirSync(cursorDir)) {
      if (!name.endsWith('.json')) continue;
      const p = join(cursorDir, name);
      try {
        if (now - statSync(p).mtimeMs > maxAgeMs) {
          unlinkSync(p);
          removed++;
        }
      } catch { /* tek dosya hatası tüm temizliği durdurmasın */ }
    }
  } catch { /* fail-silent */ }
  return removed;
}

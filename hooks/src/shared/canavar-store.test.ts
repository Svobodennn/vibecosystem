/**
 * canavar-store unit testleri — P2 (rotation, watchdog, cursor hijyeni)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, mkdirSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  rotateLedgerIfNeeded,
  readLedgerTail,
  registerRunningAgent,
  clearRunningAgent,
  findHungAgents,
  hungAgentsToLedgerEntries,
  cleanupOldCursors,
} from './canavar-store.js';
import { classifyError } from './agent-error-scan.js';
import { detectParallelConflicts } from './stop-policy.js';
import type { ToolErrorRecord, LedgerEntry } from './agent-error-scan.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'canavar-store-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

const entry = (i: number, over: Partial<LedgerEntry> = {}): string =>
  JSON.stringify({
    ts: new Date().toISOString(), session: 's', agent_id: 'a', agent_type: 't',
    error_type: 'command_fail', error_pattern: `p${i}`, detail: 'd', file: 'f', lesson: 'l',
    ...over,
  });

describe('rotateLedgerIfNeeded (E4)', () => {
  it('eşik altı → dokunmaz', () => {
    const ledger = join(tmpDir, 'ledger.jsonl');
    writeFileSync(ledger, entry(1) + '\n');
    expect(rotateLedgerIfNeeded(ledger, 1024 * 1024, 500)).toBe(false);
  });

  it('eşik üstü → eskiler arşive TAŞINIR, aktifte son N kalır, veri kaybolmaz', () => {
    const ledger = join(tmpDir, 'ledger.jsonl');
    const total = 100;
    writeFileSync(ledger, Array.from({ length: total }, (_, i) => entry(i)).join('\n') + '\n');

    const rotated = rotateLedgerIfNeeded(ledger, 1000 /* küçük eşik */, 30);
    expect(rotated).toBe(true);

    const active = readFileSync(ledger, 'utf-8').trim().split('\n');
    expect(active).toHaveLength(30);
    expect(JSON.parse(active[active.length - 1]).error_pattern).toBe('p99');

    const archiveDir = join(tmpDir, 'archive');
    const archives = readdirSync(archiveDir);
    expect(archives).toHaveLength(1);
    const archived = readFileSync(join(archiveDir, archives[0]), 'utf-8').trim().split('\n');
    expect(archived).toHaveLength(70);
    expect(JSON.parse(archived[0]).error_pattern).toBe('p0'); // veri korundu
  });

  it('olmayan dosya → false, exception yok', () => {
    expect(rotateLedgerIfNeeded(join(tmpDir, 'yok.jsonl'))).toBe(false);
  });
});

describe('readLedgerTail', () => {
  it('son n kaydı parse eder, bozuk satırı atlar', () => {
    const ledger = join(tmpDir, 'ledger.jsonl');
    writeFileSync(ledger, [entry(1), 'BOZUK JSON', entry(2), entry(3)].join('\n') + '\n');
    const tail = readLedgerTail(10, ledger);
    expect(tail).toHaveLength(3);
    expect(tail[2].error_pattern).toBe('p3');
  });
});

describe('running-agents lifecycle (A3)', () => {
  it('register → clear normal akış', () => {
    const p = join(tmpDir, 'running.json');
    registerRunningAgent('ag1', 'kraken', 'sess-full-id', p);
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toHaveProperty('ag1');

    clearRunningAgent('ag1', p);
    expect(JSON.parse(readFileSync(p, 'utf-8'))).not.toHaveProperty('ag1');
  });

  it('30dk+ kayıt hung döner ve flagged olur (ikinci çağrı boş)', () => {
    const p = join(tmpDir, 'running.json');
    const old = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    writeFileSync(p, JSON.stringify({ ag2: { agent_type: 'scout', session: 'ses1', started_at: old } }));

    const hung = findHungAgents(30 * 60 * 1000, Date.now(), p);
    expect(hung).toHaveLength(1);
    expect(hung[0]).toMatchObject({ agent_id: 'ag2', agent_type: 'scout' });
    expect(hung[0].running_minutes).toBeGreaterThanOrEqual(34);

    // İdempotent: ikinci çağrıda tekrar raporlamaz
    expect(findHungAgents(30 * 60 * 1000, Date.now(), p)).toHaveLength(0);
  });

  it('eşik altı kayıt hung değil; 24h+ kalıntı sessizce temizlenir', () => {
    const p = join(tmpDir, 'running.json');
    writeFileSync(p, JSON.stringify({
      fresh: { agent_type: 'spark', session: 's', started_at: new Date().toISOString() },
      stale: { agent_type: 'old', session: 's', started_at: new Date(Date.now() - 25 * 3600_000).toISOString() },
    }));

    expect(findHungAgents(30 * 60 * 1000, Date.now(), p)).toHaveLength(0);
    const map = JSON.parse(readFileSync(p, 'utf-8'));
    expect(map).toHaveProperty('fresh');
    expect(map).not.toHaveProperty('stale'); // kalıntı temizlendi
  });

  it('hungAgentsToLedgerEntries şemaya uygun', () => {
    const [e] = hungAgentsToLedgerEntries([{ agent_id: 'x', agent_type: 'scout', session: 's1', running_minutes: 42 }]);
    expect(e.error_type).toBe('hung_agent');
    expect(e.command_head).toBe('hung:scout');
    expect(e.detail).toContain('42 dk');
  });
});

describe('cleanupOldCursors', () => {
  it('7 günden eski cursor silinir, yenisi kalır', () => {
    const dir = join(tmpDir, 'cursors');
    mkdirSync(dir);
    const oldFile = join(dir, 'old.json');
    const newFile = join(dir, 'new.json');
    writeFileSync(oldFile, '{}');
    writeFileSync(newFile, '{}');
    const eightDaysAgo = (Date.now() - 8 * 24 * 3600_000) / 1000;
    utimesSync(oldFile, eightDaysAgo, eightDaysAgo);

    const removed = cleanupOldCursors(dir, 7 * 24 * 3600_000);
    expect(removed).toBe(1);
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(newFile)).toBe(true);
  });
});

describe('resource_conflict + detectParallelConflicts (D2)', () => {
  const mkConflict = (head: string): ToolErrorRecord => ({
    tool: 'Bash', command: `${head} serve`, command_head: head,
    error_text: 'Error: listen EADDRINUSE: address already in use :::3000',
    classification: classifyError('Error: listen EADDRINUSE: address already in use :::3000', 1),
    exit_code: 1, tool_use_id: 'tu',
  });

  it('classifyError kaynak çakışmasını tanır', () => {
    expect(classifyError('EADDRINUSE: address already in use', 1)).toBe('resource_conflict');
    expect(classifyError('SQLITE_BUSY: database is locked', 1)).toBe('resource_conflict');
    expect(classifyError('could not acquire lock on state file', null)).toBe('resource_conflict');
    // Regresyon: mevcut sınıflar bozulmadı
    expect(classifyError('Permission denied', null)).toBe('permission_denied');
    expect(classifyError('Exit code 1\ngeneric', 1)).toBe('command_fail');
  });

  it('farklı agent + 2dk pencere → parallel_conflict', () => {
    const now = Date.now();
    const ctx = { sessionId: 'sess', agentId: 'me', agentType: 'backend-dev' };
    const recent: LedgerEntry[] = [JSON.parse(entry(1, {
      error_type: 'resource_conflict', agent_id: 'other', agent_type: 'frontend-dev',
      ts: new Date(now - 60_000).toISOString(),
    }))];

    const out = detectParallelConflicts([mkConflict('npm')], ctx, recent, 120_000, now);
    expect(out).toHaveLength(1);
    expect(out[0].error_type).toBe('parallel_conflict');
    expect(out[0].detail).toContain('frontend-dev');
  });

  it('aynı agent veya pencere dışı → korelasyon yok', () => {
    const now = Date.now();
    const ctx = { sessionId: 'sess', agentId: 'me', agentType: 'backend-dev' };
    const sameAgent: LedgerEntry[] = [JSON.parse(entry(1, {
      error_type: 'resource_conflict', agent_id: 'me', ts: new Date(now - 30_000).toISOString(),
    }))];
    const tooOld: LedgerEntry[] = [JSON.parse(entry(2, {
      error_type: 'resource_conflict', agent_id: 'other', ts: new Date(now - 10 * 60_000).toISOString(),
    }))];

    expect(detectParallelConflicts([mkConflict('npm')], ctx, sameAgent, 120_000, now)).toEqual([]);
    expect(detectParallelConflicts([mkConflict('npm')], ctx, tooOld, 120_000, now)).toEqual([]);
    expect(detectParallelConflicts([], ctx, sameAgent, 120_000, now)).toEqual([]);
  });
});

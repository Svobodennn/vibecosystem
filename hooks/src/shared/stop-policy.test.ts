/**
 * stop-policy unit testleri — P1 paketi (claim/evidence/storm/evasion)
 */
import { describe, it, expect } from 'vitest';
import {
  detectClaims,
  hasEvidence,
  detectUnverifiedClaims,
  detectRetryStorms,
  evaluateStopPolicy,
  claimsToLedgerEntries,
  stormsToLedgerEntries,
  evadedLedgerEntry,
} from './stop-policy.js';
import type { ToolErrorRecord } from './agent-error-scan.js';

const mkError = (head: string, classification: ToolErrorRecord['classification'] = 'command_fail'): ToolErrorRecord => ({
  tool: 'Bash', command: head, command_head: head,
  error_text: 'Exit code 1', classification, exit_code: 1, tool_use_id: 'tu',
});

const ctx = { sessionId: 'sess1234-full', agentId: 'ag1', agentType: 'kraken' };

describe('detectClaims — kesin iddialar yakalanır', () => {
  it.each([
    ['All tests pass and the feature is complete.', 'test'],
    ['12 tests passed, coverage is good.', 'test'],
    ['Test suite is green after the fix.', 'test'],
    ['Tüm testler geçti, görev tamam.', 'test'],
    ['The build is successful on all targets.', 'build'],
    ['Code compiles cleanly now.', 'build'],
    ['tsc is clean.', 'build'],
    ['Build temiz, deploy edilebilir.', 'build'],
  ])('%s → %s claim', (msg, type) => {
    const claims = detectClaims(msg);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims[0].type).toBe(type);
  });
});

describe('detectClaims — hedge/feragat İDDİA SAYILMAZ', () => {
  it.each([
    'Tests should pass once dependencies are installed.',
    'The tests will likely pass but I could not run them.',
    'Tests pass (UNVERIFIED — environment lacked node).',
    "I didn't run the suite, but tests passed previously.",
    'Muhtemelen testler geçer ama koşulmadı.',
    'Build temiz olmalı ama doğrulanmadı.',
    'If you run npm test, all tests pass.',
  ])('hedge: %s', (msg) => {
    expect(detectClaims(msg)).toEqual([]);
  });

  it('boş mesaj → boş', () => {
    expect(detectClaims('')).toEqual([]);
  });
});

describe('hasEvidence — komut eşleşmesi', () => {
  it.each([
    ['test', ['npx vitest run src/'], true],
    ['test', ['npm test'], true],
    ['test', ['go test ./...'], true],
    ['test', ['dotnet test DemonTide.sln'], true],
    ['test', ['echo hello', 'ls -la'], false],
    ['build', ['npm run build'], true],
    ['build', ['dotnet build X.sln -c Release'], true],
    ['build', ['npx tsc --noEmit'], true],
    ['build', ['cat package.json'], false],
  ] as const)('%s + %j → %s', (type, cmds, expected) => {
    expect(hasEvidence(type, [...cmds])).toBe(expected);
  });
});

describe('detectUnverifiedClaims', () => {
  it('iddia + kanıt → temiz', () => {
    expect(detectUnverifiedClaims('All tests pass.', ['npx vitest run'])).toEqual([]);
  });
  it('iddia + kanıt yok → unverified', () => {
    const r = detectUnverifiedClaims('All tests pass.', ['echo done']);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('test');
  });
  it('test kanıtı build iddiasını doğrulamaz (tip eşleşmesi)', () => {
    const r = detectUnverifiedClaims('Build is successful.', ['npm test']);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('build');
  });
});

describe('detectRetryStorms', () => {
  it('aynı komut 3+ fail → storm; farklı komutlar ayrık', () => {
    const errors = [
      mkError('dotnet build'), mkError('dotnet build'), mkError('dotnet build'),
      mkError('git push'), mkError('git push'),
    ];
    const storms = detectRetryStorms(errors);
    expect(storms).toHaveLength(1);
    expect(storms[0]).toMatchObject({ command_head: 'dotnet build', count: 3 });
  });
  it('eşik altı → boş', () => {
    expect(detectRetryStorms([mkError('ls'), mkError('ls')])).toEqual([]);
  });
});

describe('evaluateStopPolicy', () => {
  it('ilk geçiş: raporlanmamış hata → block (hata bölümü)', () => {
    const r = evaluateStopPolicy({
      errors: [mkError('git push')],
      lastMessage: 'Done, everything looks fine.',
      stopHookActive: false,
      successfulCommands: [],
    });
    expect(r.shouldBlock).toBe(true);
    expect(r.blockReason).toContain('HATA RAPORU');
    expect(r.evaded).toBe(false);
  });

  it('ilk geçiş: hata yok ama kanıtsız iddia → block (claim bölümü)', () => {
    const r = evaluateStopPolicy({
      errors: [],
      lastMessage: 'All tests pass.',
      stopHookActive: false,
      successfulCommands: ['echo hi'],
    });
    expect(r.shouldBlock).toBe(true);
    expect(r.blockReason).toContain('UNVERIFIED');
    expect(r.unverifiedClaims).toHaveLength(1);
  });

  it('ilk geçiş: hem hata hem iddia → birleşik tek block', () => {
    const r = evaluateStopPolicy({
      errors: [mkError('npm test', 'command_fail')],
      lastMessage: 'All tests pass, task complete.',
      stopHookActive: false,
      successfulCommands: [],
    });
    expect(r.shouldBlock).toBe(true);
    expect(r.blockReason).toContain('HATA RAPORU');
    expect(r.blockReason).toContain('verification claim');
  });

  it('hata raporlu + kanıtlı → block yok', () => {
    const r = evaluateStopPolicy({
      errors: [mkError('git push')],
      lastMessage: 'İş bitti.\n\n## HATA RAPORU\n- git push: denied, skipped\nTASK STATUS: PARTIAL — push kaldı\n\nAll tests pass.',
      stopHookActive: false,
      successfulCommands: ['npx vitest run'],
    });
    expect(r.shouldBlock).toBe(false);
  });

  it('ikinci geçiş: ASLA block; rapor hâlâ yoksa evaded', () => {
    const r = evaluateStopPolicy({
      errors: [mkError('git push')],
      lastMessage: 'Done.', // hâlâ rapor yok
      stopHookActive: true,
      successfulCommands: [],
    });
    expect(r.shouldBlock).toBe(false);
    expect(r.evaded).toBe(true);
  });

  it('ikinci geçiş: rapor yazılmış → evaded değil', () => {
    const r = evaluateStopPolicy({
      errors: [mkError('git push')],
      lastMessage: '## HATA RAPORU\n- git push failed\nTASK STATUS: COMPLETE',
      stopHookActive: true,
      successfulCommands: [],
    });
    expect(r.evaded).toBe(false);
  });
});

describe('ledger entry builder\'ları', () => {
  it('claimsToLedgerEntries şemaya uygun', () => {
    const [e] = claimsToLedgerEntries([{ type: 'test', claim: 'All tests pass' }], ctx);
    expect(e.error_type).toBe('unverified_claim');
    expect(e.error_pattern).toBe('claim-fail: test');
    expect(e.command_head).toBe('claim:test');
    expect(e.agent_type).toBe('kraken');
    expect(e.session).toBe('sess1234');
    expect(e.source).toBe('stop-policy');
  });

  it('stormsToLedgerEntries şemaya uygun', () => {
    const [e] = stormsToLedgerEntries([{ command_head: 'dotnet build', count: 4, classification: 'command_fail' }], ctx);
    expect(e.error_type).toBe('retry_storm');
    expect(e.error_pattern).toBe('retry-storm: dotnet build');
    expect(e.detail).toContain('4 kez');
  });

  it('evadedLedgerEntry şemaya uygun', () => {
    const e = evadedLedgerEntry(3, ctx);
    expect(e.error_type).toBe('enforcement_evaded');
    expect(e.detail).toContain('3 hataya rağmen');
    expect(e.command_head).toBe('enforcement:evaded');
  });
});

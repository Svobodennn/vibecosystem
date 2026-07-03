/**
 * agent-error-scan unit testleri
 * Fixture'lar 2026-06-04 probe deneyinde doğrulanmış GERÇEK transcript formatını kullanır.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, appendFileSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  scanTranscriptForErrors,
  scanTranscriptIncremental,
  scanTranscriptFull,
  resolveAgentType,
  classifyError,
  normalizeCommandHead,
  extractExitCode,
  extractText,
  hasErrorReport,
  buildErrorReportInstruction,
  toLedgerEntries,
  appendLedgerEntries,
  recordAgentStart,
  recordAgentStop,
  summarizeToolInput,
  type ToolErrorRecord,
} from './agent-error-scan.js';

// --- Fixture helpers: gerçek transcript satır formatı ---

function assistantToolUse(id: string, name: string, input: Record<string, unknown>) {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  });
}

function userToolResult(toolUseId: string, isError: boolean, content: unknown) {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError, content }] },
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'canavar-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('scanTranscriptForErrors', () => {
  it('exit code hatasını komutuyla eşleştirir (probe-doğrulanmış format)', () => {
    const transcript = [
      assistantToolUse('tu_1', 'Bash', { command: 'echo CANAVAR_PROBE_FAIL_MARKER; exit 7' }),
      userToolResult('tu_1', true, 'Exit code 7\nCANAVAR_PROBE_FAIL_MARKER'),
    ].join('\n');
    const path = join(tmpDir, 'agent-x.jsonl');
    writeFileSync(path, transcript);

    const errors = scanTranscriptForErrors(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].tool).toBe('Bash');
    expect(errors[0].exit_code).toBe(7);
    expect(errors[0].classification).toBe('command_fail');
    expect(errors[0].command).toContain('CANAVAR_PROBE_FAIL_MARKER');
  });

  it('command not found (exit 127) sınıflandırır', () => {
    const transcript = [
      assistantToolUse('tu_2', 'Bash', { command: 'godot-mono --headless' }),
      userToolResult('tu_2', true, 'Exit code 127\n(eval):1: command not found: godot-mono'),
    ].join('\n');
    const path = join(tmpDir, 'agent-y.jsonl');
    writeFileSync(path, transcript);

    const errors = scanTranscriptForErrors(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].classification).toBe('command_not_found');
    expect(errors[0].command_head).toBe('godot-mono');
  });

  it('başarılı tool_result hata üretmez', () => {
    const transcript = [
      assistantToolUse('tu_3', 'Bash', { command: 'echo ok' }),
      userToolResult('tu_3', false, 'ok'),
    ].join('\n');
    const path = join(tmpDir, 'agent-z.jsonl');
    writeFileSync(path, transcript);

    expect(scanTranscriptForErrors(path)).toHaveLength(0);
  });

  it('kullanıcı iptalini hata saymaz', () => {
    const transcript = [
      assistantToolUse('tu_4', 'Bash', { command: 'sleep 100' }),
      userToolResult('tu_4', true, '[Request interrupted by user for tool use]'),
    ].join('\n');
    const path = join(tmpDir, 'agent-a.jsonl');
    writeFileSync(path, transcript);

    expect(scanTranscriptForErrors(path)).toHaveLength(0);
  });

  it('array content formatını parse eder', () => {
    const transcript = [
      assistantToolUse('tu_5', 'Bash', { command: 'npm test' }),
      userToolResult('tu_5', true, [{ type: 'text', text: 'Exit code 1\n3 tests failed' }]),
    ].join('\n');
    const path = join(tmpDir, 'agent-b.jsonl');
    writeFileSync(path, transcript);

    const errors = scanTranscriptForErrors(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].error_text).toContain('3 tests failed');
    expect(errors[0].command_head).toBe('npm test');
  });

  it('Bash dışı tool hatalarını da yakalar', () => {
    const transcript = [
      assistantToolUse('tu_6', 'Read', { file_path: '/nonexistent/file.ts' }),
      userToolResult('tu_6', true, 'File does not exist.'),
    ].join('\n');
    const path = join(tmpDir, 'agent-c.jsonl');
    writeFileSync(path, transcript);

    const errors = scanTranscriptForErrors(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].tool).toBe('Read');
    expect(errors[0].command).toBe('/nonexistent/file.ts');
  });

  it('bozuk JSON satırlarını ve eksik dosyayı tolere eder', () => {
    const path = join(tmpDir, 'agent-d.jsonl');
    writeFileSync(path, 'NOT JSON\n{"half": \n' + userToolResult('orphan', true, 'Exit code 1\nfail'));
    // Orphan tool_result (tool_use'u yok) yine de yakalanır, ayrı bucket'a düşer
    const errors = scanTranscriptForErrors(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].tool).toBe('unknown');
    expect(errors[0].command_head).toBe('unknown-tool');
    // Hiç olmayan dosya → boş dizi, exception yok
    expect(scanTranscriptForErrors(join(tmpDir, 'yok.jsonl'))).toEqual([]);
  });

  it('600 char sonrasına gömülü keyword sınıflandırmayı etkiler, depolama 600 ile sınırlı kalır', () => {
    const longPrefix = 'x'.repeat(700);
    const transcript = [
      assistantToolUse('tu_7', 'Bash', { command: 'git push origin main' }),
      userToolResult('tu_7', true, `${longPrefix}\nPermission denied (publickey)`),
    ].join('\n');
    const path = join(tmpDir, 'agent-e.jsonl');
    writeFileSync(path, transcript);

    const errors = scanTranscriptForErrors(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].classification).toBe('permission_denied');
    expect(errors[0].error_text.length).toBeLessThanOrEqual(600);
  });
});

describe('scanTranscriptIncremental', () => {
  it('ilk tarama tüm hataları bulur, ikinci tarama 0 döner (idempotent cursor)', () => {
    const path = join(tmpDir, 'main.jsonl');
    writeFileSync(path, [
      assistantToolUse('tu_a', 'Bash', { command: 'git push' }),
      userToolResult('tu_a', true, 'Exit code 128\nfatal: not a repo'),
    ].join('\n') + '\n');

    const first = scanTranscriptIncremental(path, 0);
    expect(first.errors).toHaveLength(1);
    expect(first.offset).toBeGreaterThan(0);

    const second = scanTranscriptIncremental(path, first.offset);
    expect(second.errors).toHaveLength(0);
    expect(second.offset).toBe(first.offset);
  });

  it('append edilen yeni hata sonraki taramada gelir', () => {
    const path = join(tmpDir, 'main2.jsonl');
    writeFileSync(path, [
      assistantToolUse('tu_b', 'Bash', { command: 'echo ok' }),
      userToolResult('tu_b', false, 'ok'),
    ].join('\n') + '\n');

    const first = scanTranscriptIncremental(path, 0);
    expect(first.errors).toHaveLength(0);

    appendFileSync(path, [
      assistantToolUse('tu_c', 'Agent', { subagent_type: 'code-reviewer', description: 'review' }),
      userToolResult('tu_c', true, 'Cannot create agent worktree: not in a git repository'),
    ].join('\n') + '\n');

    const second = scanTranscriptIncremental(path, first.offset);
    expect(second.errors).toHaveLength(1);
    expect(second.errors[0].tool).toBe('Agent');
    expect(second.errors[0].command).toContain('code-reviewer');
  });

  it('tool_use önceki chunk\'ta kalsa bile lookback ile eşleşir', () => {
    const path = join(tmpDir, 'main3.jsonl');
    writeFileSync(path, assistantToolUse('tu_d', 'Bash', { command: 'dotnet build X.sln' }) + '\n');
    const first = scanTranscriptIncremental(path, 0);
    expect(first.errors).toHaveLength(0);

    // Result, use'dan SONRAKİ turda geliyor
    appendFileSync(path, userToolResult('tu_d', true, 'Exit code 1\nerror CS0103') + '\n');
    const second = scanTranscriptIncremental(path, first.offset);
    expect(second.errors).toHaveLength(1);
    expect(second.errors[0].command_head).toBe('dotnet build'); // lookback eşleşmesi kanıtı
  });

  it('newline\'sız parçalı son satırı işlemez, tamamlanınca işler', () => {
    const path = join(tmpDir, 'main4.jsonl');
    const fullLine = userToolResult('tu_e', true, 'Exit code 1\nfail');
    const half = fullLine.slice(0, 40);
    writeFileSync(path, assistantToolUse('tu_e', 'Bash', { command: 'ls' }) + '\n' + half);

    const first = scanTranscriptIncremental(path, 0);
    expect(first.errors).toHaveLength(0); // parçalı satır görmezden gelindi

    appendFileSync(path, fullLine.slice(40) + '\n');
    const second = scanTranscriptIncremental(path, first.offset);
    expect(second.errors).toHaveLength(1); // tamamlanan satır işlendi
  });

  it('Türkçe (multi-byte) içerikte byte-offset çift kayıt üretmez', () => {
    const path = join(tmpDir, 'main5.jsonl');
    writeFileSync(path, [
      assistantToolUse('tu_f', 'Bash', { command: 'echo "öğrenim şöleni ğüşıöç"' }),
      userToolResult('tu_f', true, 'Exit code 1\nhata: dosya yolu öğretici değil — ünlü karakterler'),
    ].join('\n') + '\n');

    const first = scanTranscriptIncremental(path, 0);
    expect(first.errors).toHaveLength(1);
    const second = scanTranscriptIncremental(path, first.offset);
    expect(second.errors).toHaveLength(0);

    appendFileSync(path, [
      assistantToolUse('tu_g', 'Bash', { command: 'çağrı --üret' }),
      userToolResult('tu_g', true, 'Exit code 2\nşöyle bir hata'),
    ].join('\n') + '\n');
    const third = scanTranscriptIncremental(path, second.offset);
    expect(third.errors).toHaveLength(1);
    expect(third.errors[0].exit_code).toBe(2);
  });

  it('olmayan dosya ve geri giden offset fail-silent', () => {
    expect(scanTranscriptIncremental(join(tmpDir, 'yok.jsonl'), 0)).toEqual({ errors: [], offset: 0 });
    const path = join(tmpDir, 'main6.jsonl');
    writeFileSync(path, 'kısa\n');
    // offset > dosya boyutu → size'a kırpılır, hata yok
    const r = scanTranscriptIncremental(path, 999999);
    expect(r.errors).toHaveLength(0);
  });
});

describe('resolveAgentType (P3 attribution fix)', () => {
  it('input agent_type öncelikli', () => {
    expect(resolveAgentType('kraken', undefined)).toBe('kraken');
  });

  it('input yoksa .meta.json fallback', () => {
    const tPath = join(tmpDir, 'agent-abc123.jsonl');
    writeFileSync(tPath, '');
    writeFileSync(join(tmpDir, 'agent-abc123.meta.json'),
      JSON.stringify({ agentType: 'claude-code-guide', description: 'd', toolUseId: 't' }));
    expect(resolveAgentType(undefined, tPath)).toBe('claude-code-guide');
  });

  it('ikisi de yoksa null (matrix kirletilmez)', () => {
    expect(resolveAgentType(undefined, join(tmpDir, 'agent-yok.jsonl'))).toBeNull();
    expect(resolveAgentType(undefined, undefined)).toBeNull();
  });
});

describe('scanTranscriptFull (P3: MCP body error + compaction)', () => {
  it('MCP tool gövde-içi error yakalanır (is_error:false olsa bile)', () => {
    const transcript = [
      assistantToolUse('tu_m1', 'mcp__firecrawl__scrape', { url: 'https://x.com' }),
      userToolResult('tu_m1', false, '{"error": "rate limit exceeded", "data": null}'),
      assistantToolUse('tu_m2', 'mcp__other__ok', {}),
      userToolResult('tu_m2', false, '{"data": "fine"}'),
    ].join('\n');
    const path = join(tmpDir, 'agent-mcp.jsonl');
    writeFileSync(path, transcript);

    const { errors } = scanTranscriptFull(path);
    expect(errors).toHaveLength(1);
    expect(errors[0].tool).toBe('mcp__firecrawl__scrape');
    expect(errors[0].error_text).toContain('rate limit');
    expect(errors[0].classification).toBe('tool_error');
  });

  it('MCP olmayan tool\'da JSON error alanı yakalanmaz (false positive koruması)', () => {
    const transcript = [
      assistantToolUse('tu_b1', 'Bash', { command: 'cat config.json' }),
      userToolResult('tu_b1', false, '{"error": "bu sadece dosya içeriği"}'),
    ].join('\n');
    const path = join(tmpDir, 'agent-nonmcp.jsonl');
    writeFileSync(path, transcript);
    expect(scanTranscriptFull(path).errors).toHaveLength(0);
  });

  it('compact_boundary sayılır', () => {
    const transcript = [
      JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } }),
      assistantToolUse('tu_c1', 'Bash', { command: 'echo ok' }),
      userToolResult('tu_c1', false, 'ok'),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } }),
    ].join('\n');
    const path = join(tmpDir, 'agent-compact.jsonl');
    writeFileSync(path, transcript);

    const r = scanTranscriptFull(path);
    expect(r.compactionCount).toBe(2);
    expect(r.successfulCommands).toContain('echo ok');
  });
});

describe('toLedgerEntries source parametresi', () => {
  it('default subagent-scan, main-scan override edilebilir', () => {
    const err: ToolErrorRecord = {
      tool: 'Bash', command: 'ls', command_head: 'ls',
      error_text: 'Exit code 1', classification: 'command_fail', exit_code: 1, tool_use_id: 't',
    };
    const ctx = { sessionId: 's', agentId: 'main', agentType: 'main' };
    expect(toLedgerEntries([err], ctx)[0].source).toBe('subagent-scan');
    expect(toLedgerEntries([err], ctx, 'main-scan')[0].source).toBe('main-scan');
  });
});

describe('classifyError', () => {
  it.each([
    ['Exit code 127\ncommand not found: xyz', 127, 'command_not_found'],
    ['Permission denied', null, 'permission_denied'],
    ['This command requires approval', null, 'permission_denied'],
    ['Operation not permitted (seatbelt)', null, 'sandbox_block'],
    ['Command timed out after 120s', null, 'timeout'],
    ['Exit code 1\nsome failure', 1, 'command_fail'],
    ['Some unexpected tool failure', null, 'tool_error'],
  ] as const)('%s → %s', (text, exitCode, expected) => {
    expect(classifyError(text, exitCode)).toBe(expected);
  });
});

describe('normalizeCommandHead', () => {
  it.each([
    ['git push origin main', 'git push'],
    ['cd /x && npm test', 'npm test'],
    ['FOO=1 BAR=2 python3 script.py', 'python3 script.py'],
    ['/usr/local/bin/godot-mono --headless --export-release', 'godot-mono'],
    ['dotnet build DemonTide.sln', 'dotnet build'],
    ['ls -la', 'ls'],
    ['cd /a/b; git status', 'git status'],
    // F3: never-fail builtin atlanır, anlamlı segment seçilir
    ['echo hi | grep hi', 'grep'],
    ['echo building && npm test', 'npm test'],
    // Tüm segmentler never-fail → ilkine düşer
    ['echo building; exit 3', 'echo'],
    ['', 'unknown'],
  ])('%s → %s', (cmd, expected) => {
    expect(normalizeCommandHead(cmd)).toBe(expected);
  });
});

describe('extractExitCode / extractText', () => {
  it('Error: prefix ile exit code çıkarır', () => {
    expect(extractExitCode('Error: Exit code 128\nfatal: not a git repo')).toBe(128);
    expect(extractExitCode('Exit code 7\nout')).toBe(7);
    expect(extractExitCode('no code here')).toBeNull();
  });
  it('string ve array content destekler', () => {
    expect(extractText('plain')).toBe('plain');
    expect(extractText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb');
    expect(extractText(null)).toBe('');
  });
});

describe('hasErrorReport', () => {
  it('HATA RAPORU ve ERROR REPORT başlıklarını tanır', () => {
    expect(hasErrorReport('Done.\n\n## HATA RAPORU\n- git push: denied')).toBe(true);
    expect(hasErrorReport('Done.\n\n### Error Report\n- ok')).toBe(true);
    expect(hasErrorReport('All tests green, task complete.')).toBe(false);
    expect(hasErrorReport('')).toBe(false);
  });
});

describe('buildErrorReportInstruction', () => {
  it('hataları listeler ve dürüstlük sözleşmesini içerir', () => {
    const errors: ToolErrorRecord[] = [{
      tool: 'Bash', command: 'git push', command_head: 'git push',
      error_text: 'Permission denied', classification: 'permission_denied',
      exit_code: null, tool_use_id: 'tu',
    }];
    const msg = buildErrorReportInstruction(errors);
    expect(msg).toContain('## HATA RAPORU');
    expect(msg).toContain('git push');
    expect(msg).toContain('TASK STATUS');
  });
});

describe('ledger + skill-matrix', () => {
  const ctx = { sessionId: 'f814ad87-full-session', agentId: 'agent123', agentType: 'kraken' };
  const sampleError: ToolErrorRecord = {
    tool: 'Bash', command: 'dotnet build X.sln', command_head: 'dotnet build',
    error_text: 'Exit code 1\nCS0103: name does not exist', classification: 'command_fail',
    exit_code: 1, tool_use_id: 'tu_9',
  };

  it('toLedgerEntries Canavar şemasıyla uyumlu entry üretir', () => {
    const [entry] = toLedgerEntries([sampleError], ctx);
    expect(entry.session).toBe('f814ad87');
    expect(entry.agent_id).toBe('agent123');
    expect(entry.agent_type).toBe('kraken');
    expect(entry.error_type).toBe('command_fail');
    expect(entry.error_pattern).toBe('bash-fail: dotnet build');
    expect(entry.command_head).toBe('dotnet build');
    expect(entry.source).toBe('subagent-scan');
    // Eski tüketicilerin beklediği alanlar mevcut
    for (const k of ['ts', 'detail', 'file', 'lesson']) expect(entry).toHaveProperty(k);
  });

  it('appendLedgerEntries jsonl olarak yazar', () => {
    const ledger = join(tmpDir, 'ledger.jsonl');
    appendLedgerEntries(toLedgerEntries([sampleError], ctx), ledger);
    appendLedgerEntries(toLedgerEntries([sampleError], ctx), ledger);
    const lines = readFileSync(ledger, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(() => lines.map((l) => JSON.parse(l))).not.toThrow();
  });

  it('recordAgentStop failure/success ve failing_commands sayar', () => {
    const matrix = join(tmpDir, 'matrix.json');
    recordAgentStop('kraken', [sampleError], matrix);
    recordAgentStop('kraken', [], matrix);
    const data = JSON.parse(readFileSync(matrix, 'utf-8'));
    const p = data.agents.kraken;
    expect(p.total_tasks).toBe(2);
    expect(p.failures).toBe(1);
    expect(p.successes).toBe(1);
    expect(p.success_rate).toBe(0.5);
    expect(p.failing_commands['dotnet build']).toBe(1);
    expect(p.common_errors[0]).toContain('dotnet build');
  });

  it('recordAgentStart profili oluşturur, sonuç saymaz', () => {
    const matrix = join(tmpDir, 'matrix2.json');
    recordAgentStart('scout', matrix);
    const data = JSON.parse(readFileSync(matrix, 'utf-8'));
    expect(data.agents.scout.total_tasks).toBe(0);
    expect(data.agents.scout.last_active).toBeTruthy();
    expect(existsSync(matrix)).toBe(true);
  });
});

describe('summarizeToolInput', () => {
  it.each([
    ['Bash', { command: 'ls -la' }, 'ls -la'],
    ['Read', { file_path: '/a/b.ts' }, '/a/b.ts'],
    ['Grep', { pattern: 'foo.*bar' }, 'pattern: foo.*bar'],
    ['Agent', { subagent_type: 'scout' }, 'subagent: scout'],
  ])('%s özetini üretir', (tool, input, expected) => {
    expect(summarizeToolInput(tool, input as Record<string, unknown>)).toBe(expected);
  });
});

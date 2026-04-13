import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: vi.fn() };
});

import { homedir } from 'os';

const mockHomedir = vi.mocked(homedir);

describe('hook-health', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), 'hook-health-'));
    mockHomedir.mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function freshModule() {
    return await import('../shared/hook-health.js');
  }

  function readHealthFile(): string[] {
    const healthFile = join(tmpDir, '.claude', 'hook-health.jsonl');
    if (!existsSync(healthFile)) return [];
    return readFileSync(healthFile, 'utf-8').split('\n').filter(l => l.trim());
  }

  it('reportHealth writes valid JSONL entry', async () => {
    const { reportHealth } = await freshModule();
    reportHealth('test-hook', true, 42);

    const lines = readHealthFile();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.hook).toBe('test-hook');
    expect(entry.success).toBe(true);
    expect(entry.duration_ms).toBe(42);
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.error).toBeUndefined();
  });

  it('reportHealth creates ~/.claude/ directory if missing', async () => {
    const { reportHealth } = await freshModule();
    expect(existsSync(join(tmpDir, '.claude'))).toBe(false);

    reportHealth('test-hook', true, 10);

    expect(existsSync(join(tmpDir, '.claude'))).toBe(true);
    expect(readHealthFile()).toHaveLength(1);
  });

  it('reportHealth truncates error to 200 chars', async () => {
    const { reportHealth } = await freshModule();
    const longError = 'x'.repeat(500);
    reportHealth('test-hook', false, 5, longError);

    const entry = JSON.parse(readHealthFile()[0]);
    expect(entry.error).toHaveLength(200);
    expect(entry.success).toBe(false);
  });

  it('reportHealth does not throw on filesystem error', async () => {
    // Mock homedir to invalid path
    mockHomedir.mockReturnValue('/nonexistent/path/that/cannot/be/created\0');
    const { reportHealth } = await import('../shared/hook-health.js');

    expect(() => {
      reportHealth('test-hook', true, 10);
    }).not.toThrow();
  });

  it('wrapWithHealth records success for passing function', async () => {
    const { wrapWithHealth } = await freshModule();

    wrapWithHealth('my-hook', () => { /* success */ });

    const entry = JSON.parse(readHealthFile()[0]);
    expect(entry.hook).toBe('my-hook');
    expect(entry.success).toBe(true);
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('wrapWithHealth records failure and re-throws on error', async () => {
    const { wrapWithHealth } = await freshModule();

    expect(() => {
      wrapWithHealth('my-hook', () => { throw new Error('boom'); });
    }).toThrow('boom');

    const entry = JSON.parse(readHealthFile()[0]);
    expect(entry.hook).toBe('my-hook');
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('boom');
  });

  it('wrapWithHealth measures duration', async () => {
    const { wrapWithHealth } = await freshModule();

    wrapWithHealth('my-hook', () => {
      // Busy wait ~5ms
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin */ }
    });

    const entry = JSON.parse(readHealthFile()[0]);
    expect(entry.duration_ms).toBeGreaterThanOrEqual(4);
  });

  it('multiple reportHealth calls append to same file', async () => {
    const { reportHealth } = await freshModule();

    reportHealth('hook-a', true, 10);
    reportHealth('hook-b', false, 20, 'fail');
    reportHealth('hook-c', true, 30);

    const lines = readHealthFile();
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).hook).toBe('hook-a');
    expect(JSON.parse(lines[1]).hook).toBe('hook-b');
    expect(JSON.parse(lines[2]).hook).toBe('hook-c');
  });
});

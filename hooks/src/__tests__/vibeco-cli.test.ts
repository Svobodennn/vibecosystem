/**
 * Smoke tests for the vibeco CLI (tools/vibeco/vibeco.mjs).
 *
 * Runs the real CLI as a child process against temp fixtures so the
 * security scanners (secrets, audit) have executable coverage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../../tools/vibeco/vibeco.mjs', import.meta.url));
const PKG = fileURLToPath(new URL('../../../package.json', import.meta.url));

function runCli(...args: string[]) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf-8', timeout: 30000 });
}

let cleanDir: string;
let dirtyDir: string;

beforeAll(() => {
  cleanDir = mkdtempSync(join(tmpdir(), 'vibeco-clean-'));
  writeFileSync(join(cleanDir, 'app.js'), 'const apiKey = process.env.OPENAI_API_KEY;\n');

  dirtyDir = mkdtempSync(join(tmpdir(), 'vibeco-dirty-'));
  // Synthetic test fixture, not a real credential
  writeFileSync(join(dirtyDir, 'config.js'), 'const awsKey = "AKIA' + 'ABCDEFGHIJKLMNOP";\n');
});

afterAll(() => {
  rmSync(cleanDir, { recursive: true, force: true });
  rmSync(dirtyDir, { recursive: true, force: true });
});

describe('vibeco version', () => {
  it('reports the same version as package.json', () => {
    const pkgVersion = JSON.parse(readFileSync(PKG, 'utf-8')).version;
    const result = runCli('version');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(pkgVersion);
  });
});

describe('vibeco secrets', () => {
  it('reports clean on a directory without secrets', () => {
    const result = runCli('secrets', cleanDir);
    expect(result.stdout).toContain('No secrets found');
  });

  it('detects a planted AWS access key', () => {
    const result = runCli('secrets', dirtyDir);
    expect(result.stdout).toContain('potential secret');
    expect(result.stdout).toContain('config.js');
    expect(result.stdout).toContain('AWS Access Key ID');
  });

  it('errors on a missing directory', () => {
    const result = runCli('secrets', join(tmpdir(), 'vibeco-does-not-exist-xyz'));
    expect(result.status).toBe(1);
  });

  it('does not flag localhost dev connection strings, still flags remote ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibeco-conn-'));
    try {
      writeFileSync(join(dir, 'dev.ts'), "const url = 'postgresql://claude:claude_dev@localhost:5432/db';\n");
      const clean = runCli('secrets', dir);
      expect(clean.stdout).toContain('No secrets found');

      // Fixture assembled across source LINES: the repo's own secret scan is
      // per-line, so neither source line alone matches the connection pattern
      const remoteUrl = 'postgresql://admin:supersecret9' +
        '@db.example.com:5432/db';
      writeFileSync(join(dir, 'prod.ts'), `const url = '${remoteUrl}';\n`);
      const dirty = runCli('secrets', dir);
      expect(dirty.stdout).toContain('PostgreSQL Connection String');
      expect(dirty.stdout).toContain('prod.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('vibeco audit', () => {
  it('runs against a clean directory without crashing', () => {
    const result = runCli('audit', cleanDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('vibeco audit');
  });
});

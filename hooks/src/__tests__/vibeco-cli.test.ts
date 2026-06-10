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
});

describe('vibeco audit', () => {
  it('runs against a clean directory without crashing', () => {
    const result = runCli('audit', cleanDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('vibeco audit');
  });
});

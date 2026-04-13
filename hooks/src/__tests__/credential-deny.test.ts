/**
 * Tests for hooks/src/credential-deny.ts
 *
 * Exported functions: resolveAllPaths, checkFilePath, extractPaths, checkBashCommand
 *
 * credential-deny.ts calls main() at module level, which reads stdin via
 * readFileSync(0). In vitest, stdin is either empty or throws -- both are
 * handled by try/catch in main(), so import does not crash.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  resolveAllPaths,
  checkFilePath,
  extractPaths,
  checkBashCommand,
} from '../credential-deny.js';

// Temp directory for symlink tests -- created once, cleaned up after all tests
const symlinkTmpDir = mkdtempSync(join(tmpdir(), 'cred-deny-test-'));

afterAll(() => {
  try { rmSync(symlinkTmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// checkFilePath
// ---------------------------------------------------------------------------
describe('checkFilePath', () => {
  it('blocks SSH key path', () => {
    const result = checkFilePath('/home/user/.ssh/id_rsa');
    expect(result).not.toBeNull();
    expect(result).toBe('SSH keys');
  });

  it('blocks AWS credentials path', () => {
    const result = checkFilePath('/home/user/.aws/credentials');
    expect(result).not.toBeNull();
    expect(result).toBe('AWS credentials');
  });

  it('blocks Kubernetes config path', () => {
    const result = checkFilePath('/home/user/.kube/config');
    expect(result).not.toBeNull();
    expect(result).toBe('Kubernetes config');
  });

  it('blocks GPG keys path', () => {
    const result = checkFilePath('/home/user/.gnupg/pubring.kbx');
    expect(result).not.toBeNull();
    expect(result).toBe('GPG keys');
  });

  it('blocks .npmrc path', () => {
    const result = checkFilePath('/home/user/.npmrc');
    expect(result).not.toBeNull();
    expect(result).toBe('NPM tokens');
  });

  it('blocks .env file', () => {
    const result = checkFilePath('/home/user/.env');
    expect(result).not.toBeNull();
    expect(result).toBe('Environment secrets');
  });

  it('blocks .env.local file', () => {
    const result = checkFilePath('/home/user/.env.local');
    expect(result).not.toBeNull();
    expect(result).toBe('Environment secrets');
  });

  it('blocks bare id_rsa file', () => {
    const result = checkFilePath('/home/user/id_rsa');
    expect(result).not.toBeNull();
    expect(result).toBe('Private SSH key');
  });

  it('blocks terraform.tfstate file', () => {
    const result = checkFilePath('/home/user/terraform.tfstate');
    expect(result).not.toBeNull();
    expect(result).toMatch(/Terraform state/);
  });

  it('blocks .git/config file', () => {
    const result = checkFilePath('/home/user/.git/config');
    expect(result).not.toBeNull();
    expect(result).toMatch(/Git config/);
  });

  it('allows safe file path in /tmp', () => {
    const result = checkFilePath('/tmp/safe-file.txt');
    expect(result).toBeNull();
  });

  it('allows normal source code path', () => {
    const result = checkFilePath('/home/user/project/src/index.ts');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractPaths
// ---------------------------------------------------------------------------
describe('extractPaths', () => {
  it('extracts absolute path from cat command', () => {
    const paths = extractPaths('cat /home/user/.ssh/id_rsa');
    expect(paths.some(p => p.includes('.ssh/id_rsa'))).toBe(true);
  });

  it('expands ~ to home directory', () => {
    const paths = extractPaths('cat ~/.aws/credentials');
    expect(paths.some(p => p.includes('.aws/credentials'))).toBe(true);
    // ~ should be expanded (no tilde in result)
    expect(paths.some(p => !p.startsWith('~') && p.includes('.aws/credentials'))).toBe(true);
  });

  it('extracts relative paths with ../', () => {
    const paths = extractPaths('cat ../../.env');
    expect(paths.some(p => p.includes('../../.env'))).toBe(true);
  });

  it('expands $HOME variable', () => {
    const paths = extractPaths('echo $HOME/.ssh/config');
    expect(paths.some(p => p.includes('.ssh/config'))).toBe(true);
  });

  it('expands ${HOME} variable', () => {
    const paths = extractPaths('echo ${HOME}/.kube/config');
    expect(paths.some(p => p.includes('.kube/config'))).toBe(true);
  });

  it('extracts quoted paths', () => {
    const paths = extractPaths('cat "/path/to/.env"');
    expect(paths.some(p => p.includes('.env'))).toBe(true);
  });

  it('extracts multiple paths from chained commands', () => {
    const paths = extractPaths('ls /tmp && cat /home/.ssh/key');
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths.some(p => p.includes('/tmp'))).toBe(true);
    expect(paths.some(p => p.includes('.ssh/key'))).toBe(true);
  });

  it('returns empty array for command with no paths', () => {
    const paths = extractPaths('echo hello');
    expect(paths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkBashCommand
// ---------------------------------------------------------------------------
describe('checkBashCommand', () => {
  it('blocks bare env command', () => {
    const result = checkBashCommand('env');
    expect(result).not.toBeNull();
  });

  it('blocks bare printenv command', () => {
    const result = checkBashCommand('printenv');
    expect(result).not.toBeNull();
  });

  it('blocks env piped to grep', () => {
    const result = checkBashCommand('env | grep PATH');
    expect(result).not.toBeNull();
  });

  it('blocks export -p', () => {
    const result = checkBashCommand('export -p');
    expect(result).not.toBeNull();
  });

  it('blocks sensitive env var access $AWS_SECRET_ACCESS_KEY', () => {
    const result = checkBashCommand('echo $AWS_SECRET_ACCESS_KEY');
    expect(result).not.toBeNull();
    expect(result).toMatch(/AWS_SECRET_ACCESS_KEY/);
  });

  it('blocks .ssh keyword in command', () => {
    const result = checkBashCommand('ls .ssh/known_hosts');
    expect(result).not.toBeNull();
    expect(result).toMatch(/SSH directory reference/);
  });

  it('allows safe ls command', () => {
    const result = checkBashCommand('ls -la /tmp');
    expect(result).toBeNull();
  });

  it('allows echo $PATH (not sensitive)', () => {
    const result = checkBashCommand('echo $PATH');
    expect(result).toBeNull();
  });

  it('allows npm install command', () => {
    const result = checkBashCommand('npm install express');
    expect(result).toBeNull();
  });

  it('blocks find command searching for id_rsa', () => {
    const result = checkBashCommand('find / -name id_rsa');
    expect(result).not.toBeNull();
    expect(result).toMatch(/SSH private key reference/);
  });
});

// ---------------------------------------------------------------------------
// resolveAllPaths
// ---------------------------------------------------------------------------
describe('resolveAllPaths', () => {
  it('returns the original path for a regular (non-symlink) path', () => {
    // Use a path that does not exist on disk -- resolveAllPaths should still
    // return the original path (lstatSync and realpathSync will throw, caught)
    const fakePath = '/nonexistent/regular/file.txt';
    const result = resolveAllPaths(fakePath);
    expect(result).toContain(fakePath);
  });

  it('normalizes nonexistent path via resolve', () => {
    // Even for a nonexistent path, the function should return at least
    // the original path without crashing
    const weirdPath = '/some/../other/file.txt';
    const result = resolveAllPaths(weirdPath);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result).toContain(weirdPath);
  });

  it('resolves symlink to its target when target exists', () => {
    // Create a real file and a symlink pointing to it
    const targetFile = join(symlinkTmpDir, 'real-secret.txt');
    const linkFile = join(symlinkTmpDir, 'link-to-secret');
    writeFileSync(targetFile, 'secret-content');
    symlinkSync(targetFile, linkFile);

    const result = resolveAllPaths(linkFile);
    // Should contain both the symlink path and the resolved target
    expect(result).toContain(linkFile);
    expect(result).toContain(targetFile);
  });

  it('resolves symlink target even when target does not exist', () => {
    // Create a symlink pointing to a nonexistent file
    const nonexistentTarget = join(symlinkTmpDir, 'does-not-exist.txt');
    const danglingLink = join(symlinkTmpDir, 'dangling-link');
    symlinkSync(nonexistentTarget, danglingLink);

    const result = resolveAllPaths(danglingLink);
    // Should contain the symlink path
    expect(result).toContain(danglingLink);
    // Should contain the readlink target (even though it does not exist)
    expect(result).toContain(nonexistentTarget);
  });
});

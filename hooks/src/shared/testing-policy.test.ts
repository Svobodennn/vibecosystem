import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  activeTestingPolicy,
  findTestingPolicy,
  withTddInsteadOfWorkflow,
  withoutTddGuide,
  withoutTestWritingInstincts,
} from './testing-policy.js';

describe('findTestingPolicy — walks up from the project dir', () => {
  let root: string;
  let workspace: string;
  let repo: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'testing-policy-'));
    workspace = join(root, 'workspace');
    repo = join(workspace, 'backend', 'src');
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(workspace, 'TESTING_POLICY.md'), '# policy');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds the workspace policy from a nested repo dir', () => {
    expect(findTestingPolicy(repo, root)).toBe(join(workspace, 'TESTING_POLICY.md'));
  });

  it('checks the stop dir itself', () => {
    expect(findTestingPolicy(workspace, workspace)).toBe(join(workspace, 'TESTING_POLICY.md'));
  });

  it('returns null when no policy exists up to the stop dir', () => {
    const other = join(root, 'other', 'project');
    mkdirSync(other, { recursive: true });
    expect(findTestingPolicy(other, root)).toBeNull();
  });

  it('does not look above the stop dir', () => {
    expect(findTestingPolicy(join(workspace, 'backend'), join(workspace, 'backend'))).toBeNull();
  });
});

describe('activeTestingPolicy — project file first, then the global rule', () => {
  let root: string;
  let globalPath: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'active-policy-'));
    mkdirSync(join(root, 'with-policy', 'repo'), { recursive: true });
    mkdirSync(join(root, 'plain', 'repo'), { recursive: true });
    writeFileSync(join(root, 'with-policy', 'TESTING_POLICY.md'), '# project');
    globalPath = join(root, 'testing-policy.md');
    writeFileSync(globalPath, '# global');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('prefers the project policy', () => {
    expect(activeTestingPolicy(join(root, 'with-policy', 'repo'), globalPath)).toBe(join(root, 'with-policy', 'TESTING_POLICY.md'));
  });

  it('falls back to the global rule', () => {
    expect(activeTestingPolicy(join(root, 'plain', 'repo'), globalPath)).toBe(globalPath);
  });

  it('is off when neither exists', () => {
    expect(activeTestingPolicy(join(root, 'plain', 'repo'), join(root, 'missing.md'))).toBeNull();
  });
});

describe('withTddInsteadOfWorkflow — policy projects get `tdd`', () => {
  const workflow = { name: 'tdd-workflow', config: { description: 'Test Driven Development workflow patterns' } };
  const other = { name: 'backend-patterns', config: { description: 'x' } };

  it('swaps tdd-workflow for tdd and keeps the rest', () => {
    const out = withTddInsteadOfWorkflow([other, workflow]);
    expect(out.map(s => s.name)).toEqual(['backend-patterns', 'tdd']);
    expect(out[0]).toBe(other);
  });

  it('drops tdd-workflow when tdd is already matched', () => {
    const tdd = { name: 'tdd', config: {} };
    expect(withTddInsteadOfWorkflow([workflow, tdd]).map(s => s.name)).toEqual(['tdd']);
  });

  it('returns the list unchanged when tdd-workflow is absent', () => {
    expect(withTddInsteadOfWorkflow([other])).toEqual([other]);
  });
});

describe('policy filters', () => {
  it('withoutTddGuide drops only tdd-guide', () => {
    expect(withoutTddGuide([{ name: 'tdd-guide' }, { name: 'kraken' }])).toEqual([{ name: 'kraken' }]);
  });

  it('withoutTestWritingInstincts drops test-file-creation only', () => {
    const items = [{ pattern: 'test-file-creation' }, { pattern: 'add-error-handling' }];
    expect(withoutTestWritingInstincts(items)).toEqual([{ pattern: 'add-error-handling' }]);
  });
});

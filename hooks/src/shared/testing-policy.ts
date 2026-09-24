import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';

// The global rule switches the scoped test behaviour on everywhere; deleting it restores the old defaults.
export const GLOBAL_TESTING_POLICY = join(homedir(), '.claude', 'rules', 'testing-policy.md');
export const TESTING_POLICY_FILE = 'TESTING_POLICY.md';

export const TEST_WRITING_PATTERNS = ['test-file-creation'];

export function findTestingPolicy(startDir: string, stopDir: string = homedir()): string | null {
  try {
    const stop = resolve(stopDir);
    let dir = resolve(startDir);
    for (;;) {
      const candidate = join(dir, TESTING_POLICY_FILE);
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (dir === stop || parent === dir) return null;
      dir = parent;
    }
  } catch {
    return null;
  }
}

export function activeTestingPolicy(projectDir: string, globalPath: string = GLOBAL_TESTING_POLICY): string | null {
  const projectPolicy = findTestingPolicy(projectDir);
  if (projectPolicy) return projectPolicy;
  try {
    return existsSync(globalPath) ? globalPath : null;
  } catch {
    return null;
  }
}

export function projectDirFrom(cwd?: string): string {
  return process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd();
}

export function withTddInsteadOfWorkflow<T extends { name: string; config: { description?: string } }>(
  skills: T[],
): T[] {
  const hasTdd = skills.some(s => s.name === 'tdd');
  return skills.flatMap(s => {
    if (s.name !== 'tdd-workflow') return [s];
    if (hasTdd) return [];
    return [{ ...s, name: 'tdd', config: { ...s.config, description: 'TDD within the project TESTING_POLICY.md scope' } }];
  });
}

export function withoutTddGuide<T extends { name: string }>(agents: T[]): T[] {
  return agents.filter(a => a.name !== 'tdd-guide');
}

export function withoutTestWritingInstincts<T extends { pattern: string }>(items: T[]): T[] {
  return items.filter(i => !TEST_WRITING_PATTERNS.includes(i.pattern));
}

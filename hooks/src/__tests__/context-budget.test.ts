import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  budgetContext,
  budgetHookOutput,
  getBudgetLimits,
  resetBudget,
} from '../shared/context-budget.js';

describe('context budget', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'vibeco-context-budget-'));
    process.env.VIBECO_CONTEXT_BUDGET_PATH = join(directory, 'budget.json');
    process.env.VIBECO_RUNTIME_PATH = join(directory, 'runtime.json');
  });

  afterEach(() => {
    delete process.env.VIBECO_CONTEXT_BUDGET_PATH;
    delete process.env.VIBECO_RUNTIME_PATH;
    rmSync(directory, { recursive: true, force: true });
  });

  it('enforces core event and session limits', () => {
    writeFileSync(process.env.VIBECO_RUNTIME_PATH!, JSON.stringify({
      contextBudget: { perEventChars: 4000, sessionChars: 12000 },
    }));
    resetBudget('core-session');

    expect(getBudgetLimits()).toEqual({ perEventChars: 4000, sessionChars: 12000 });
    expect(budgetContext('one', 'event:one', 'x'.repeat(4000)).length).toBe(4000);
    expect(budgetContext('one', 'event:one', 'x'.repeat(100))).toBe('');
    expect(budgetContext('two', 'event:two', 'x'.repeat(4000)).length).toBeLessThanOrEqual(4000);
    expect(budgetContext('three', 'event:three', 'x'.repeat(4000)).length).toBeLessThanOrEqual(4000);
    expect(budgetContext('four', 'event:four', 'x')).toBe('');
  });

  it('enforces full profile limits independently from core', () => {
    writeFileSync(process.env.VIBECO_RUNTIME_PATH!, JSON.stringify({
      contextBudget: { perEventChars: 8000, sessionChars: 50000 },
    }));
    resetBudget('full-session');

    expect(getBudgetLimits()).toEqual({ perEventChars: 8000, sessionChars: 50000 });
    expect(budgetContext('one', 'event:one', 'x'.repeat(8000)).length).toBe(8000);
    expect(budgetContext('one', 'event:one', 'x')).toBe('');
  });

  it('bounds additional context without changing hook metadata', () => {
    writeFileSync(process.env.VIBECO_RUNTIME_PATH!, JSON.stringify({
      contextBudget: { perEventChars: 20, sessionChars: 20 },
    }));
    resetBudget('output-session');

    const output = budgetHookOutput({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        permissionDecision: 'allow',
        additionalContext: 'x'.repeat(100),
      },
    }, 'test-hook', 'PostToolUse');

    expect(output.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(output.hookSpecificOutput?.additionalContext.length).toBeLessThanOrEqual(20);

    resetBudget('direct-output-session');
    const direct = budgetHookOutput({ additionalContext: 'x'.repeat(100) }, 'test-hook', 'PostToolUse');
    expect(direct.additionalContext.length).toBeLessThanOrEqual(20);
  });
});

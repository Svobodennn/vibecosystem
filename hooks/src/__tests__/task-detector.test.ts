/**
 * Tests for task-detector shared module.
 *
 * detectTask(prompt) is a pure function that analyzes a user prompt
 * and returns { isTask, taskType?, confidence, triggers }.
 */
import { describe, it, expect } from 'vitest';
import { detectTask } from '../shared/task-detector.js';

// ---------------------------------------------------------------------------
// Task type detection (8 tests)
// ---------------------------------------------------------------------------
describe('task type detection', () => {
  it('detects implementation task: "build a login page"', () => {
    const result = detectTask('build a login page');

    expect(result.isTask).toBe(true);
    expect(result.taskType).toBe('implementation');
  });

  it('detects debug task: "fix the broken test"', () => {
    const result = detectTask('fix the broken test');

    expect(result.isTask).toBe(true);
    expect(result.taskType).toBe('debug');
  });

  it('detects research task: "how do I set up Redis?"', () => {
    const result = detectTask('how do I set up Redis?');

    expect(result.isTask).toBe(true);
    expect(result.taskType).toBe('research');
  });

  it('detects planning task: "plan the architecture for the new system"', () => {
    const result = detectTask('plan the architecture for the new system');

    expect(result.isTask).toBe(true);
    expect(result.taskType).toBe('planning');
  });

  it('detects mixed task with highest weight winning: "fix the bug and add tests"', () => {
    const result = detectTask('fix the bug and add tests');

    expect(result.isTask).toBe(true);
    // "fix bug" (debug, weight 0.9) should beat other matches
    expect(result.taskType).toBeDefined();
    expect(['debug', 'implementation']).toContain(result.taskType);
  });

  it('returns isTask: false for empty string', () => {
    const result = detectTask('');

    expect(result.isTask).toBe(false);
    expect(result.taskType).toBeUndefined();
    expect(result.confidence).toBe(0);
    expect(result.triggers).toEqual([]);
  });

  it('returns isTask: false for conversational input: "hello"', () => {
    const result = detectTask('hello');

    expect(result.isTask).toBe(false);
  });

  it('detects task with a single keyword: "build"', () => {
    const result = detectTask('build');

    expect(result.isTask).toBe(true);
    expect(result.taskType).toBe('implementation');
  });
});

// ---------------------------------------------------------------------------
// Confidence scoring (8 tests)
// ---------------------------------------------------------------------------
describe('confidence scoring', () => {
  it('assigns positive confidence for a single implementation keyword', () => {
    const result = detectTask('implement the feature');

    expect(result.confidence).toBeGreaterThan(0);
  });

  it('calculates confidence from multiple same-type keywords', () => {
    const single = detectTask('build something');
    const multi = detectTask('build and implement a new module');

    // Both should be tasks, both should have positive confidence
    expect(single.isTask).toBe(true);
    expect(multi.isTask).toBe(true);
    expect(multi.confidence).toBeGreaterThan(0);
    expect(single.confidence).toBeGreaterThan(0);
  });

  it('boosts confidence when different task types mix', () => {
    // "fix" = debug, "build" = implementation -> uniqueTypes > 1 -> +0.1 boost
    const singleType = detectTask('build something');
    const mixedTypes = detectTask('fix the bug then build a new feature');

    expect(mixedTypes.isTask).toBe(true);
    // Mixed types get a 0.1 boost from uniqueTypes.size > 1
    expect(mixedTypes.confidence).toBeGreaterThan(singleType.confidence);
  });

  it('applies additional boost for 3+ matches', () => {
    // "plan the architecture, design the structure" -> plan + architect + design + structure = 4 matches
    const fewMatches = detectTask('plan something');
    const manyMatches = detectTask('plan the architecture, design the structure and outline the strategy');

    expect(manyMatches.isTask).toBe(true);
    expect(fewMatches.isTask).toBe(true);
    // 4+ matches should get the extra boost
    expect(manyMatches.confidence).toBeGreaterThan(fewMatches.confidence);
  });

  it('applies conversational penalty: "explain how things work" -> low confidence', () => {
    const result = detectTask('explain how things work');

    // "explain" is conversational, no task keywords -> isTask: false
    expect(result.isTask).toBe(false);
    expect(result.confidence).toBeLessThanOrEqual(0.4);
  });

  it('clamps confidence between 0 and 1', () => {
    // Many keywords to try pushing confidence high
    const result = detectTask(
      'build implement create develop refactor migrate configure set up'
    );

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns isTask based on 0.4 threshold: "create" alone', () => {
    const result = detectTask('create');

    // "create" weight is 0.8, no conversational penalty -> confidence 0.8 > 0.4
    expect(result.isTask).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('returns isTask: false for purely conversational input: "thanks great job"', () => {
    const result = detectTask('thanks great job');

    expect(result.isTask).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trigger extraction (5 tests)
// ---------------------------------------------------------------------------
describe('trigger extraction', () => {
  it('includes "build" in triggers for "build a login page"', () => {
    const result = detectTask('build a login page');

    expect(result.triggers).toContain('build');
  });

  it('extracts multiple triggers: "fix the bug and add new features"', () => {
    const result = detectTask('fix the bug and add feature');

    expect(result.triggers.length).toBeGreaterThanOrEqual(2);
    // "fix bug" (debug indicator) and "add feature" (implementation indicator)
    expect(result.triggers).toContain('fix bug');
    expect(result.triggers).toContain('add feature');
  });

  it('returns empty triggers for conversational: "hello world"', () => {
    const result = detectTask('hello world');

    expect(result.triggers).toEqual([]);
  });

  it('returns empty triggers for empty input', () => {
    const result = detectTask('');

    expect(result.triggers).toEqual([]);
  });

  it('captures all matching keywords from a long prompt', () => {
    const result = detectTask(
      'I need to build the API, debug the auth flow, and research caching strategies'
    );

    expect(result.isTask).toBe(true);
    expect(result.triggers).toContain('build');
    expect(result.triggers).toContain('debug');
    expect(result.triggers).toContain('research');
  });
});

// ---------------------------------------------------------------------------
// Edge cases (4 tests)
// ---------------------------------------------------------------------------
describe('edge cases', () => {
  it('handles a very long prompt (100+ words)', () => {
    const longPrompt = Array(25)
      .fill('please build a new feature and implement the module')
      .join(' ');

    const result = detectTask(longPrompt);

    expect(result.isTask).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('handles whitespace-only and newline-only input', () => {
    const spaces = detectTask('     ');
    const newlines = detectTask('\n\n\n');
    const mixed = detectTask('  \t\n  ');

    expect(spaces.isTask).toBe(false);
    expect(spaces.confidence).toBe(0);
    expect(spaces.triggers).toEqual([]);

    expect(newlines.isTask).toBe(false);
    expect(newlines.confidence).toBe(0);

    expect(mixed.isTask).toBe(false);
    expect(mixed.confidence).toBe(0);
  });

  it('handles mixed signals: "can you explain how to build?"', () => {
    const result = detectTask('can you explain how to build?');

    // "explain" is conversational (-0.3 penalty), "build" is implementation (0.9 weight)
    // 0.9 - 0.3 = 0.6 -> still above 0.4 threshold -> isTask could be true
    // But "can you explain" also matches -> additional penalty
    // The exact result depends on how many conversational patterns match
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    // Regardless of isTask outcome, confidence should reflect the mixed signals
    if (result.isTask) {
      expect(result.taskType).toBe('implementation');
    }
  });

  it('handles repeated keywords: "build build build"', () => {
    const result = detectTask('build build build');

    // The regex /\bbuild\b/i only matches once (test returns true/false, not count)
    // So this should behave the same as a single "build"
    expect(result.isTask).toBe(true);
    expect(result.taskType).toBe('implementation');
    expect(result.triggers).toContain('build');
    // Only one unique trigger since the same pattern matches
    expect(result.triggers).toHaveLength(1);
  });
});

/**
 * Achievement Tracker - PostToolUse hook
 * Steam-style achievement system for the development workflow.
 * Tracks XP, levels, streaks, and 25 achievements across 5 skill trees.
 * State stored in ~/.claude/achievements.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';

interface PostToolInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
}

interface UnlockedEntry {
  unlockedAt: string;
  xp: number;
}

interface AchievementProgress {
  'bugs-fixed': number;
  'commits-reviewed': number;
  'tests-passed': number;
  'learnings-stored': number;
  'session-bugs-fixed': number;
  'session-languages': string[];
  'session-start': string;
  'session-files-written': number;
  counters: Record<string, number>;
}

interface AchievementState {
  xp: number;
  level: number;
  streak: number;
  lastActive: string;
  unlocked: Record<string, UnlockedEntry>;
  progress: AchievementProgress;
}

// XP thresholds: [level, min_xp] sorted descending
const LEVEL_THRESHOLDS: Array<[number, number]> = [
  [50, 10000],
  [20, 3000],
  [10, 1000],
  [5, 500],
  [3, 300],
  [2, 100],
  [1, 0],
];

function calcLevel(xp: number): number {
  for (const [lvl, threshold] of LEVEL_THRESHOLDS) {
    if (xp >= threshold) return lvl;
  }
  return 1;
}

function streakMultiplier(streak: number): number {
  if (streak >= 30) return 3.0;
  if (streak >= 14) return 2.0;
  if (streak >= 7) return 1.5;
  if (streak >= 3) return 1.25;
  return 1.0;
}

const ACHIEVEMENTS_PATH = join(homedir(), '.claude', 'achievements.json');
const TODAY = new Date().toISOString().slice(0, 10);

function defaultState(): AchievementState {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    lastActive: '',
    unlocked: {},
    progress: {
      'bugs-fixed': 0,
      'commits-reviewed': 0,
      'tests-passed': 0,
      'learnings-stored': 0,
      'session-bugs-fixed': 0,
      'session-languages': [],
      'session-start': new Date().toISOString(),
      'session-files-written': 0,
      counters: {},
    },
  };
}

function loadState(): AchievementState {
  if (!existsSync(ACHIEVEMENTS_PATH)) return defaultState();
  try {
    const parsed = JSON.parse(readFileSync(ACHIEVEMENTS_PATH, 'utf-8')) as AchievementState;
    // Ensure counters bag exists for older state files
    if (!parsed.progress.counters) parsed.progress.counters = {};
    if (!parsed.progress['session-languages']) parsed.progress['session-languages'] = [];
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState(state: AchievementState): void {
  const dir = join(homedir(), '.claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ACHIEVEMENTS_PATH, JSON.stringify(state, null, 2));
}

function updateStreak(state: AchievementState): void {
  if (!state.lastActive) {
    state.streak = 1;
    state.lastActive = TODAY;
    return;
  }
  if (state.lastActive === TODAY) return; // already counted today

  const last = new Date(state.lastActive);
  const now = new Date(TODAY);
  const diffDays = Math.round((now.getTime() - last.getTime()) / 86400000);

  state.streak = diffDays === 1 ? state.streak + 1 : 1;
  state.lastActive = TODAY;
}

const ACHIEVEMENT_NAMES: Record<string, string> = {
  'first-blood': 'First Blood',
  'speed-demon': 'Speed Demon',
  'polyglot': 'Polyglot',
  'marathon-runner': 'Marathon Runner',
  'perfectionist': 'Perfectionist',
  'bug-whisperer': 'Bug Whisperer',
  'the-exterminator': 'The Exterminator',
  'regression-hunter': 'Regression Hunter',
  'flaky-tamer': 'Flaky Tamer',
  'zero-to-hero': 'Zero to Hero',
  'architects-vision': "Architect's Vision",
  'the-refactorer': 'The Refactorer',
  'dependency-auditor': 'Dependency Auditor',
  'api-architect': 'API Architect',
  'the-modularizer': 'The Modularizer',
  'security-hawk': 'Security Hawk',
  'secret-keeper': 'Secret Keeper',
  'input-validator': 'Input Validator',
  'dependency-guardian': 'Dependency Guardian',
  'the-auditor': 'The Auditor',
  'the-mentor': 'The Mentor',
  'night-owl': 'Night Owl',
  'the-reviewer': 'The Reviewer',
  'streak-master': 'Streak Master',
  'knowledge-hoarder': 'Knowledge Hoarder',
};

function unlockAchievement(
  state: AchievementState,
  id: string,
  baseXp: number,
  celebrations: string[]
): void {
  if (state.unlocked[id]) return; // already unlocked

  const multiplier = streakMultiplier(state.streak);
  const earnedXp = Math.round(baseXp * multiplier);

  state.unlocked[id] = { unlockedAt: new Date().toISOString(), xp: earnedXp };
  state.xp += earnedXp;
  state.level = calcLevel(state.xp);

  const name = ACHIEVEMENT_NAMES[id] ?? id;
  const bonusStr = multiplier > 1 ? ` (${multiplier}x streak bonus)` : '';
  celebrations.push(
    `ACHIEVEMENT UNLOCKED: "${name}" +${earnedXp} XP${bonusStr} | Total: ${state.xp} XP | Level ${state.level}`
  );
}

function detectLanguage(filePath: unknown): string | null {
  if (typeof filePath !== 'string') return null;
  const ext = extname(filePath).toLowerCase().replace('.', '');
  const known = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'cs', 'rb', 'swift', 'kt', 'cpp', 'c'];
  return known.includes(ext) ? ext : null;
}

function incCounter(state: AchievementState, key: string, by = 1): number {
  state.progress.counters[key] = (state.progress.counters[key] ?? 0) + by;
  return state.progress.counters[key];
}

function getCounter(state: AchievementState, key: string): number {
  return state.progress.counters[key] ?? 0;
}

function main(): void {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { /* stdin closed */ }
  if (!raw.trim()) { console.log('{}'); return; }

  let input: PostToolInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  const state = loadState();
  updateStreak(state);

  const tool = input.tool_name;
  const toolInput = input.tool_input ?? {};
  const celebrations: string[] = [];

  // Night Owl: active between midnight and 04:00
  const hour = new Date().getHours();
  if (hour < 4) {
    unlockAchievement(state, 'night-owl', 15, celebrations);
  }

  // Edit / Write events
  if (tool === 'Edit' || tool === 'Write') {
    const filePath = toolInput['file_path'] ?? toolInput['path'];
    const lang = detectLanguage(filePath);

    if (lang && !state.progress['session-languages'].includes(lang)) {
      state.progress['session-languages'].push(lang);
    }

    state.progress['session-files-written'] += 1;

    // Input Validator: Zod schema usage
    const content = String(toolInput['new_string'] ?? toolInput['content'] ?? '');
    if (/z\.(object|string|number|array|enum)\(/.test(content) || /schema\.parse\(/.test(content)) {
      unlockAchievement(state, 'input-validator', 25, celebrations);
    }

    // Dependency Auditor: editing manifest files
    const fp = String(filePath ?? '');
    if (fp.endsWith('package.json') || fp.endsWith('requirements.txt') || fp.endsWith('pyproject.toml')) {
      const edits = incCounter(state, 'dep-manifest-edits');
      if (edits >= 3) {
        unlockAchievement(state, 'dependency-auditor', 30, celebrations);
      }
    }

    // API Architect: route/resolver definitions
    if (/\b(app\.(get|post|put|patch|delete)|router\.(get|post|put)|@Resolver|addRoute)\b/.test(content)) {
      const routes = incCounter(state, 'routes-defined');
      if (routes >= 5) {
        unlockAchievement(state, 'api-architect', 55, celebrations);
      }
    }
  }

  // Polyglot: 3+ languages in one session
  if (state.progress['session-languages'].length >= 3) {
    unlockAchievement(state, 'polyglot', 50, celebrations);
  }

  // Bash events
  if (tool === 'Bash') {
    const cmd = String(toolInput['command'] ?? '');
    const response = String(
      typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response ?? '')
    );

    // Bug fix heuristic
    if (/\b(fix|patch|resolve|hotfix)\b/i.test(cmd)) {
      state.progress['session-bugs-fixed'] += 1;
      state.progress['bugs-fixed'] += 1;
    }

    // Test runner detection
    if (/\b(jest|vitest|pytest|go test|npm test|yarn test|pnpm test)\b/i.test(cmd)) {
      const passed = /\b(passed|ok|PASS)\b/.test(response) && !/\b(FAIL|failed|error)\b/.test(response);
      if (passed) {
        state.progress['tests-passed'] += 1;

        // Perfectionist: first try (few files written before running tests)
        if (state.progress['session-files-written'] <= 3 && getCounter(state, 'test-runs') === 0) {
          unlockAchievement(state, 'perfectionist', 50, celebrations);
        }

        // Flaky Tamer: test passes after a prior bug fix in session
        if (state.progress['session-bugs-fixed'] > 0) {
          unlockAchievement(state, 'flaky-tamer', 35, celebrations);
        }
      }
      incCounter(state, 'test-runs');
    }

    // Git review commands increment commits-reviewed
    if (/git\s+(diff|log|show)\b/.test(cmd)) {
      state.progress['commits-reviewed'] += 1;
    }

    // Memory store: Knowledge Hoarder
    if (/store_learning\.py/.test(cmd)) {
      state.progress['learnings-stored'] += 1;
    }

    // Security hawk: security-reviewer agent completes a sweep
    if (/security.reviewer|security-reviewer/.test(cmd) && /clean|no.*critical|PASS/i.test(response)) {
      unlockAchievement(state, 'security-hawk', 30, celebrations);
      unlockAchievement(state, 'the-auditor', 80, celebrations);
    }

    // Secret Keeper: credential-deny hook triggered
    if (/credential.deny|hardcoded.*secret|secret.*found/i.test(response)) {
      unlockAchievement(state, 'secret-keeper', 20, celebrations);
    }
  }

  // Lifetime threshold checks

  if (state.progress['commits-reviewed'] >= 1) {
    unlockAchievement(state, 'first-blood', 10, celebrations);
  }
  if (state.progress['commits-reviewed'] >= 10) {
    unlockAchievement(state, 'the-reviewer', 20, celebrations);
  }
  if (state.progress['session-bugs-fixed'] >= 5) {
    unlockAchievement(state, 'bug-whisperer', 25, celebrations);
  }
  if (state.progress['bugs-fixed'] >= 25) {
    unlockAchievement(state, 'the-exterminator', 75, celebrations);
  }
  if (state.progress['learnings-stored'] >= 20) {
    unlockAchievement(state, 'knowledge-hoarder', 65, celebrations);
  }
  if (state.streak >= 7) {
    unlockAchievement(state, 'streak-master', 50, celebrations);
  }

  saveState(state);

  if (celebrations.length === 0) {
    console.log('{}');
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: celebrations.join('\n'),
    },
  }));
}

main();

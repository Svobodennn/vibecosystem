/**
 * session-compressor.ts - ACDE Session Compression Hook
 *
 * PreCompact hook that generates a compressed session summary
 * in ACDE format (Actions, Context, Decisions, Entities)
 * before context window compression occurs.
 *
 * Saves to: ~/.claude/palace/{project}-sessions.jsonl
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { getSafeProjectName } from './shared/project-identity.js';

interface CompactEvent {
  type?: string;
  source?: string;
  session_id?: string;
}

interface SessionSummary {
  timestamp: string;
  session_id: string;
  project: string;
  acde: {
    actions: string[];
    context: string[];
    decisions: string[];
    entities: string[];
  };
}

const PALACE_DIR = join(homedir(), '.claude', 'palace');

function safePalacePath(filename: string): string | null {
  const candidate = resolve(join(PALACE_DIR, filename));
  const root = resolve(PALACE_DIR);
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  return candidate;
}

function getRecentChangedFiles(): string[] {
  try {
    const result = execSync('git diff --name-only HEAD~3 HEAD 2>/dev/null || git diff --name-only 2>/dev/null', {
      encoding: 'utf-8',
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      timeout: 5000,
    });
    return result.split('\n').filter(f => f.trim()).slice(0, 20);
  } catch {
    return [];
  }
}

function getRecentCommits(): string[] {
  try {
    const result = execSync('git log --oneline -5 2>/dev/null', {
      encoding: 'utf-8',
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      timeout: 5000,
    });
    return result.split('\n').filter(l => l.trim());
  } catch {
    return [];
  }
}

function getProjectContext(): string[] {
  const context: string[] = [];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (existsSync(join(projectDir, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
      if (deps.length) context.push(`Stack: Node.js, ${deps.join(', ')}`);
    } catch { /* skip */ }
  }

  try {
    const branch = execSync('git branch --show-current 2>/dev/null', {
      encoding: 'utf-8',
      cwd: projectDir,
      timeout: 3000,
    }).trim();
    if (branch) context.push(`Branch: ${branch}`);
  } catch { /* skip */ }

  return context;
}

function loadPalaceDecisions(project: string): string[] {
  const wingFile = safePalacePath(`${project}.jsonl`);
  if (!wingFile || !existsSync(wingFile)) return [];

  try {
    const lines = readFileSync(wingFile, 'utf-8').split('\n').filter(l => l.trim());
    const decisions: string[] = [];
    for (const line of lines.slice(-10)) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'decision' && typeof entry.content === 'string') {
          decisions.push(`${entry.room}: ${entry.content}`);
        }
      } catch { /* skip bad line */ }
    }
    return decisions;
  } catch {
    return [];
  }
}

function runHook(): void {
  let input: string;
  try {
    input = readFileSync(0, 'utf-8');
  } catch { return; }

  let event: CompactEvent;
  try {
    event = JSON.parse(input);
  } catch { return; }

  const project = getSafeProjectName();
  const files = getRecentChangedFiles();
  const commits = getRecentCommits();
  const context = getProjectContext();
  const decisions = loadPalaceDecisions(project);

  const summary: SessionSummary = {
    timestamp: new Date().toISOString(),
    session_id: event.session_id || 'unknown',
    project,
    acde: {
      actions: commits.map(c => `[x] ${c}`),
      context,
      decisions: decisions.slice(-5),
      entities: files.slice(0, 15),
    },
  };

  // Save to palace sessions log (path-safe)
  mkdirSync(PALACE_DIR, { recursive: true });
  const sessionsFile = safePalacePath(`${project}-sessions.jsonl`);
  if (sessionsFile) {
    try { appendFileSync(sessionsFile, JSON.stringify(summary) + '\n'); } catch { /* silent */ }
  }

  // Generate ACDE text for context injection
  const lines: string[] = [`[Session Compressed] Project: ${project}`, ''];

  if (summary.acde.actions.length) {
    lines.push('Actions:');
    summary.acde.actions.forEach(a => lines.push(`  ${a}`));
    lines.push('');
  }

  if (summary.acde.context.length) {
    lines.push('Context:');
    summary.acde.context.forEach(c => lines.push(`  ${c}`));
    lines.push('');
  }

  if (summary.acde.decisions.length) {
    lines.push('Decisions:');
    summary.acde.decisions.forEach(d => lines.push(`  ${d}`));
    lines.push('');
  }

  if (summary.acde.entities.length) {
    lines.push('Changed Files:');
    summary.acde.entities.forEach(e => lines.push(`  ${e}`));
  }

  console.log(JSON.stringify({ systemMessage: lines.join('\n') }));
}

try { runHook(); } catch { process.exit(0); }

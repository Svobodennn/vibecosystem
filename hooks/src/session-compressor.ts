/**
 * session-compressor.ts - ACDE Session Compression Hook
 *
 * PreCompact hook that generates a compressed session summary
 * in ACDE format (Actions, Context, Decisions, Entities)
 * before context window compression occurs.
 *
 * Saves to: ~/.claude/palace/{project}-sessions.jsonl
 * Also updates: thoughts/PROGRESS.md if exists
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

interface CompactEvent {
  type: string;
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

function getProjectName(): string {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, '');
    } catch {}
  }
  return basename(projectDir);
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

  // Detect tech stack
  if (existsSync(join(projectDir, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
      context.push(`Stack: Node.js, ${deps.join(', ')}`);
    } catch {}
  }

  // Current branch
  try {
    const branch = execSync('git branch --show-current 2>/dev/null', {
      encoding: 'utf-8',
      cwd: projectDir,
      timeout: 3000,
    }).trim();
    if (branch) context.push(`Branch: ${branch}`);
  } catch {}

  return context;
}

function loadPalaceDecisions(project: string): string[] {
  const wingFile = join(PALACE_DIR, `${project}.jsonl`);
  if (!existsSync(wingFile)) return [];

  try {
    const lines = readFileSync(wingFile, 'utf-8').split('\n').filter(l => l.trim());
    const decisions: string[] = [];
    for (const line of lines.slice(-10)) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'decision') {
          decisions.push(`${entry.room}: ${entry.content}`);
        }
      } catch {}
    }
    return decisions;
  } catch {
    return [];
  }
}

async function main() {
  let input: string;
  try {
    input = readFileSync('/dev/stdin', 'utf-8');
  } catch { process.exit(0); }

  let event: CompactEvent;
  try {
    event = JSON.parse(input);
  } catch { process.exit(0); }

  const project = getProjectName();
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

  // Save to palace sessions log
  mkdirSync(PALACE_DIR, { recursive: true });
  const sessionsFile = join(PALACE_DIR, `${project}-sessions.jsonl`);
  try {
    appendFileSync(sessionsFile, JSON.stringify(summary) + '\n');
  } catch {}

  // Generate human-readable ACDE for context injection
  const acdeText = [
    `[Session Compressed] Project: ${project}`,
    '',
    'Actions:',
    ...summary.acde.actions.map(a => `  ${a}`),
    '',
    'Context:',
    ...summary.acde.context.map(c => `  ${c}`),
    '',
    decisions.length ? 'Decisions:' : '',
    ...summary.acde.decisions.map(d => `  ${d}`),
    '',
    'Changed Files:',
    ...summary.acde.entities.map(e => `  ${e}`),
  ].filter(l => l !== undefined).join('\n');

  console.log(JSON.stringify({
    systemMessage: acdeText,
  }));
}

main().catch(() => process.exit(0));

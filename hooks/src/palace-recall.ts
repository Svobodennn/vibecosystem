/**
 * palace-recall.ts - Layered Memory Recall Hook
 *
 * SessionStart hook implementing 4-layer progressive memory recall.
 * Layer 1: Identity (always) ~200 tokens
 * Layer 2: Critical facts (per-project) ~500 tokens
 * Layer 3: Room recall (deferred to intent detection)
 * Layer 4: Deep search (on explicit request)
 *
 * Only Layers 1-2 are loaded at session start for token efficiency.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

interface SessionEvent {
  type: string;
  session_id?: string;
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

function loadLayer2(project: string): string[] {
  const wingFile = join(PALACE_DIR, `${project}.jsonl`);
  if (!existsSync(wingFile)) return [];

  try {
    const lines = readFileSync(wingFile, 'utf-8').split('\n').filter(l => l.trim());
    const facts: string[] = [];
    const seen = new Set<string>();

    // Read last 50 entries, deduplicate by content prefix
    for (const line of lines.slice(-50).reverse()) {
      try {
        const entry = JSON.parse(line);
        const key = `${entry.room}:${entry.content.slice(0, 50)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (entry.type === 'decision' || entry.type === 'constraint') {
          facts.push(`[${entry.room}] ${entry.content}`);
        }
      } catch {}
    }

    return facts.slice(0, 10); // Max 10 critical facts
  } catch {
    return [];
  }
}

function loadLastSession(project: string): string | null {
  const sessionsFile = join(PALACE_DIR, `${project}-sessions.jsonl`);
  if (!existsSync(sessionsFile)) return null;

  try {
    const lines = readFileSync(sessionsFile, 'utf-8').split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    const last = JSON.parse(lines[lines.length - 1]);
    const parts: string[] = [];

    if (last.acde?.actions?.length) {
      parts.push('Last session: ' + last.acde.actions.slice(0, 3).join(', '));
    }
    if (last.acde?.entities?.length) {
      parts.push('Files: ' + last.acde.entities.slice(0, 5).join(', '));
    }

    return parts.join(' | ');
  } catch {
    return null;
  }
}

function getRoomSummary(project: string): string {
  const indexPath = join(PALACE_DIR, 'index.json');
  if (!existsSync(indexPath)) return '';

  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    const wing = index[project];
    if (!wing?.rooms?.length) return '';
    return `Rooms: ${wing.rooms.join(', ')}`;
  } catch {
    return '';
  }
}

async function main() {
  let input: string;
  try {
    input = readFileSync('/dev/stdin', 'utf-8');
  } catch { process.exit(0); }

  let event: SessionEvent;
  try {
    event = JSON.parse(input);
  } catch { process.exit(0); }

  if (event.type !== 'startup' && event.type !== 'resume') {
    process.exit(0);
  }

  const project = getProjectName();

  // Check if palace exists for this project
  if (!existsSync(PALACE_DIR)) {
    process.exit(0);
  }

  const facts = loadLayer2(project);
  const lastSession = loadLastSession(project);
  const rooms = getRoomSummary(project);

  if (facts.length === 0 && !lastSession) {
    process.exit(0);
  }

  const parts: string[] = [`[Memory Palace] Project: ${project}`];

  if (rooms) parts.push(rooms);

  if (lastSession) {
    parts.push('');
    parts.push(lastSession);
  }

  if (facts.length > 0) {
    parts.push('');
    parts.push('Critical Facts:');
    for (const fact of facts) {
      parts.push(`  ${fact}`);
    }
  }

  parts.push('');
  parts.push('Use memory-palace skill for deeper recall. Layer 3-4 available on demand.');

  console.log(JSON.stringify({
    systemMessage: parts.join('\n'),
  }));
}

main().catch(() => process.exit(0));

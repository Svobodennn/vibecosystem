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

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { getSafeProjectName } from './shared/project-identity.js';

interface SessionEvent {
  type?: string;    // legacy field
  source?: string;  // canonical field
  session_id?: string;
}

const PALACE_DIR = join(homedir(), '.claude', 'palace');

/** Verify a path stays within PALACE_DIR. */
function safePalacePath(filename: string): string | null {
  const candidate = resolve(join(PALACE_DIR, filename));
  const root = resolve(PALACE_DIR);
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  return candidate;
}

function loadLayer2(project: string): string[] {
  const wingFile = safePalacePath(`${project}.jsonl`);
  if (!wingFile || !existsSync(wingFile)) return [];

  try {
    const lines = readFileSync(wingFile, 'utf-8').split('\n').filter(l => l.trim());
    const facts: string[] = [];
    const seen = new Set<string>();

    for (const line of lines.slice(-50).reverse()) {
      try {
        const entry = JSON.parse(line);
        if (typeof entry.content !== 'string' || typeof entry.room !== 'string') continue;
        const key = `${entry.room}:${entry.content.slice(0, 50)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (entry.type === 'decision' || entry.type === 'constraint') {
          facts.push(`[${entry.room}] ${entry.content}`);
        }
      } catch { /* skip bad line */ }
    }

    return facts.slice(0, 10);
  } catch {
    return [];
  }
}

function loadLastSession(project: string): string | null {
  const sessionsFile = safePalacePath(`${project}-sessions.jsonl`);
  if (!sessionsFile || !existsSync(sessionsFile)) return null;

  try {
    const lines = readFileSync(sessionsFile, 'utf-8').split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    const last = JSON.parse(lines[lines.length - 1]);
    const parts: string[] = [];

    if (Array.isArray(last.acde?.actions) && last.acde.actions.length) {
      parts.push('Last session: ' + last.acde.actions.slice(0, 3).join(', '));
    }
    if (Array.isArray(last.acde?.entities) && last.acde.entities.length) {
      parts.push('Files: ' + last.acde.entities.slice(0, 5).join(', '));
    }

    return parts.length ? parts.join(' | ') : null;
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

function runHook(): void {
  let input: string;
  try {
    input = readFileSync(0, 'utf-8');
  } catch { return; }

  let event: SessionEvent;
  try {
    event = JSON.parse(input);
  } catch { return; }

  // Support both canonical `source` and legacy `type` fields
  const phase = event.source ?? event.type;
  if (phase !== 'startup' && phase !== 'resume') return;

  if (!existsSync(PALACE_DIR)) return;

  const project = getSafeProjectName();
  const facts = loadLayer2(project);
  const lastSession = loadLastSession(project);
  const rooms = getRoomSummary(project);

  if (facts.length === 0 && !lastSession) return;

  const parts: string[] = [`[Memory Palace] Project: ${project}`];

  if (rooms) parts.push(rooms);
  if (lastSession) { parts.push(''); parts.push(lastSession); }

  if (facts.length > 0) {
    parts.push('');
    parts.push('Critical Facts:');
    for (const fact of facts) parts.push(`  ${fact}`);
  }

  parts.push('');
  parts.push('Use memory-palace skill for deeper recall. Layer 3-4 available on demand.');

  console.log(JSON.stringify({
    systemMessage: parts.join('\n'),
  }));
}

try { runHook(); } catch { process.exit(0); }

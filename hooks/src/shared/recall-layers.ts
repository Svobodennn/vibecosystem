/**
 * recall-layers.ts - Progressive Recall Depth Helpers
 *
 * Implements 3-depth fetch pattern for memory recall:
 *   Depth 1: IDs only (~10 tokens/match) - search index
 *   Depth 2: Summary (~50 tokens/match) - timeline view
 *   Depth 3: Full content (~500+ tokens/match) - complete entry
 *
 * Agents fetch Depth 1 first, then escalate to 2-3 only for
 * confirmed relevant matches. Saves 10-50x tokens vs eager loading.
 */

import { readFileSync, existsSync } from 'node:fs';

export interface RecallMatch {
  id: string;
  score?: number;
}

export interface RecallSummary extends RecallMatch {
  room?: string;
  type?: string;
  timestamp?: string;
  preview: string;  // First 80 chars
}

export interface RecallFull extends RecallSummary {
  content: string;
  tags?: string[];
  agent?: string;
  session_id?: string;
}

/**
 * Depth 1: Return only IDs matching a query.
 * Cheapest layer - useful for agent to decide which entries to inspect.
 */
export function recallDepth1(jsonlPath: string, query: string, limit = 20): RecallMatch[] {
  if (!existsSync(jsonlPath)) return [];

  const lowerQuery = query.toLowerCase();
  const matches: Array<{ id: string; score: number }> = [];

  try {
    const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (typeof entry.id !== 'string') continue;

        const text = [
          entry.content || '',
          entry.room || '',
          (entry.tags || []).join(' '),
        ].join(' ').toLowerCase();

        // Simple keyword scoring
        let score = 0;
        const terms = lowerQuery.split(/\s+/).filter(t => t.length > 2);
        for (const term of terms) {
          if (text.includes(term)) score += 1;
        }

        if (score > 0) {
          matches.push({ id: entry.id, score });
        }
      } catch { /* skip bad line */ }
    }
  } catch {
    return [];
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/**
 * Depth 2: Return summary info (room, type, preview) for specific IDs.
 * Middle layer - gives agent enough context to decide if full fetch is needed.
 */
export function recallDepth2(jsonlPath: string, ids: string[]): RecallSummary[] {
  if (!existsSync(jsonlPath) || ids.length === 0) return [];

  const idSet = new Set(ids);
  const results: RecallSummary[] = [];

  try {
    const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!idSet.has(entry.id)) continue;

        const content = String(entry.content || '');
        results.push({
          id: entry.id,
          room: entry.room,
          type: entry.type,
          timestamp: entry.timestamp,
          preview: content.slice(0, 80),
        });
      } catch { /* skip bad line */ }
    }
  } catch {
    return [];
  }

  return results;
}

/**
 * Depth 3: Return full entries for specific IDs.
 * Most expensive layer - only fetch after Depth 1-2 confirms relevance.
 */
export function recallDepth3(jsonlPath: string, ids: string[]): RecallFull[] {
  if (!existsSync(jsonlPath) || ids.length === 0) return [];

  const idSet = new Set(ids);
  const results: RecallFull[] = [];

  try {
    const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!idSet.has(entry.id)) continue;

        const content = String(entry.content || '');
        results.push({
          id: entry.id,
          room: entry.room,
          type: entry.type,
          timestamp: entry.timestamp,
          tags: entry.tags,
          agent: entry.agent,
          session_id: entry.session_id,
          preview: content.slice(0, 80),
          content,
        });
      } catch { /* skip bad line */ }
    }
  } catch {
    return [];
  }

  return results;
}

/**
 * Convenience: search for a query and return top N summaries in one call.
 * Wraps Depth 1 + Depth 2 for typical agent usage.
 */
export function searchSummaries(jsonlPath: string, query: string, limit = 10): RecallSummary[] {
  const matches = recallDepth1(jsonlPath, query, limit);
  const ids = matches.map(m => m.id);
  return recallDepth2(jsonlPath, ids);
}

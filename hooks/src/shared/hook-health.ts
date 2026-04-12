/**
 * Hook Health Reporter
 * Her hook'un basari/basarisizlik durumunu kaydeder.
 * ~/.claude/hook-health.jsonl'e append eder.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HEALTH_FILE = join(homedir(), '.claude', 'hook-health.jsonl');

export interface HealthEntry {
  ts: string;
  hook: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

export function reportHealth(
  hookName: string,
  success: boolean,
  durationMs: number,
  error?: string
): void {
  try {
    const entry: HealthEntry = {
      ts: new Date().toISOString(),
      hook: hookName,
      success,
      duration_ms: Math.round(durationMs),
    };
    if (error) entry.error = error.slice(0, 200);
    mkdirSync(join(homedir(), '.claude'), { recursive: true });
    appendFileSync(HEALTH_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Health reporting kendisi patlamamali
  }
}

/**
 * Wrap a hook's main function with health reporting.
 * Usage: wrapWithHealth('my-hook', () => { ... hook logic ... })
 */
export function wrapWithHealth(hookName: string, fn: () => void): void {
  const start = Date.now();
  try {
    fn();
    reportHealth(hookName, true, Date.now() - start);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth(hookName, false, Date.now() - start, msg);
    // Re-throw so hook still fails visibly
    throw err;
  }
}

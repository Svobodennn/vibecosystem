/**
 * Plan Tracker - PostToolUse + SessionStart hook
 *
 * Persistent planning system using 3 markdown files:
 * - thoughts/PLAN.md - Active plan (what to do, why, in what order)
 * - thoughts/PROGRESS.md - Completed work (auto-updated after commits)
 * - thoughts/CONTEXT.md - Project context (architectural decisions, constraints)
 *
 * On session start: injects PLAN.md into context if it exists.
 * After Bash (git commit): appends entry to PROGRESS.md.
 *
 * Based on the planning-with-files pattern (96.7% task completion vs 6.7% without).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function main(): void {
  let input: {
    session_id: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_response?: unknown;
  };

  try {
    input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  } catch {
    return;
  }

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const thoughtsDir = join(cwd, 'thoughts');
  const planPath = join(thoughtsDir, 'PLAN.md');
  const progressPath = join(thoughtsDir, 'PROGRESS.md');

  // SessionStart: inject plan if exists
  if (input.tool_name === 'SessionStart' || input.tool_name === 'session_start') {
    if (existsSync(planPath)) {
      try {
        const plan = readFileSync(planPath, 'utf-8');
        if (plan.trim()) {
          const output = {
            additionalContext: `[plan-tracker] Active plan found:\n\n${plan.slice(0, 3000)}`,
          };
          process.stdout.write(JSON.stringify(output));
          return;
        }
      } catch { /* ignore */ }
    }
    process.stdout.write('{}');
    return;
  }

  // PostToolUse: track commits in PROGRESS.md
  if (input.tool_name === 'Bash') {
    const command = String((input.tool_input as Record<string, string>).command || '');
    const response = String(input.tool_response || '');

    // Detect successful git commit
    if (command.includes('git commit') && response.includes('[') && !response.includes('error')) {
      // Extract commit message from response
      const commitMatch = response.match(/\[[\w/-]+\s+([a-f0-9]+)\]\s+(.+)/);
      if (commitMatch) {
        const hash = commitMatch[1];
        const message = commitMatch[2];
        const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const entry = `- [${timestamp}] \`${hash}\` ${message}\n`;

        try {
          mkdirSync(thoughtsDir, { recursive: true });

          // Append to PROGRESS.md
          let existing = '';
          if (existsSync(progressPath)) {
            existing = readFileSync(progressPath, 'utf-8');
          } else {
            existing = '# Progress\n\nAutomatically tracked commits:\n\n';
          }

          writeFileSync(progressPath, existing + entry, 'utf-8');
        } catch { /* ignore write errors */ }
      }
    }
  }

  // PostToolUse: track plan creation/updates
  if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
    const filePath = String((input.tool_input as Record<string, string>).file_path || '');
    if (filePath.endsWith('PLAN.md') || filePath.endsWith('CONTEXT.md')) {
      // Plan was created/updated - no action needed, just acknowledge
    }
  }

  process.stdout.write('{}');
}

main();

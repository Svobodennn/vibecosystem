/**
 * Prompt Auto-Improver - PreToolUse hook (UserPromptSubmit)
 *
 * Enriches vague/short prompts with additional context.
 * Does NOT modify the user's prompt - only adds additionalContext.
 *
 * Triggers when:
 * - Prompt is < 10 words with vague verbs ("fix", "do", "make", "update")
 * - No file paths mentioned
 * - Ambiguous references ("it", "this", "that")
 *
 * Provides: recently changed files, last error, helpful hints.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const CLAUDE_DIR = join(homedir(), '.claude');
const VAGUE_VERBS = ['fix', 'do', 'make', 'update', 'change', 'modify', 'handle', 'add', 'remove', 'check'];
const AMBIGUOUS_REFS = ['it', 'this', 'that', 'the thing', 'the issue', 'the problem', 'the bug'];

function main(): void {
  let input: {
    session_id: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
  };

  try {
    input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  } catch {
    return;
  }

  // Only process UserPromptSubmit events
  if (input.tool_name !== 'UserPromptSubmit') {
    process.stdout.write('{}');
    return;
  }

  const prompt = ((input.tool_input as Record<string, string>).user_message ||
                   (input.tool_input as Record<string, string>).content || '').trim();

  if (!prompt) {
    process.stdout.write('{}');
    return;
  }

  const words = prompt.split(/\s+/);
  const wordCount = words.length;
  const lowerPrompt = prompt.toLowerCase();

  // Check conditions
  const isShort = wordCount < 10;
  const hasVagueVerb = VAGUE_VERBS.some(v => lowerPrompt.includes(v));
  const hasAmbiguousRef = AMBIGUOUS_REFS.some(r => lowerPrompt.includes(r));
  const hasFilePath = /[a-zA-Z0-9_-]+\.[a-zA-Z]{1,5}/.test(prompt) ||
                      prompt.includes('/') || prompt.includes('\\');

  // Only trigger if prompt is genuinely vague
  if (!isShort || (!hasVagueVerb && !hasAmbiguousRef) || hasFilePath) {
    process.stdout.write('{}');
    return;
  }

  const hints: string[] = [];

  // Get recently changed files
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const recentFiles = execSync('git diff --name-only HEAD~3 2>/dev/null || git diff --name-only 2>/dev/null', {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (recentFiles) {
      const files = recentFiles.split('\n').slice(0, 8);
      hints.push(`Recently changed files:\n${files.map(f => `  - ${f}`).join('\n')}`);
    }
  } catch { /* no git or no changes */ }

  // Get last error from canavar
  try {
    const ledger = join(CLAUDE_DIR, 'canavar', 'error-ledger.jsonl');
    if (existsSync(ledger)) {
      const content = readFileSync(ledger, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const lastError = JSON.parse(lines[lines.length - 1]);
        if (lastError.pattern || lastError.error) {
          hints.push(`Last recorded error: ${lastError.pattern || lastError.error}`);
        }
      }
    }
  } catch { /* no ledger */ }

  // Get current intent
  try {
    const intentPath = join(CLAUDE_DIR, 'cache', 'current-intent.json');
    if (existsSync(intentPath)) {
      const intent = JSON.parse(readFileSync(intentPath, 'utf-8'));
      if (intent.taskType) {
        hints.push(`Detected intent: ${intent.taskType}`);
      }
    }
  } catch { /* no intent */ }

  if (hints.length === 0) {
    process.stdout.write('{}');
    return;
  }

  // Build context
  const context = `[prompt-improver] Your prompt is brief. Here's context that might help:\n\n${hints.join('\n\n')}`;

  const output = {
    additionalContext: context,
  };

  process.stdout.write(JSON.stringify(output));
}

main();

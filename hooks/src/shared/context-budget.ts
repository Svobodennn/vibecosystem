/**
 * Context Budget Manager
 * Hook'larin context window'a ne kadar veri enjekte edebilecegini kontrol eder.
 * Her event batch icin MAX_PER_EVENT_CHARS, session genelinde MAX_SESSION_CHARS limiti var.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

const DEFAULT_LIMITS = {
  perEventChars: 4000,
  sessionChars: 12000,
};

const FULL_LIMITS = {
  perEventChars: 8000,
  sessionChars: 50000,
};

function budgetPath(): string {
  return process.env.VIBECO_CONTEXT_BUDGET_PATH
    || join(homedir(), '.claude', 'cache', 'context-budget.json');
}

function runtimePath(): string {
  return process.env.VIBECO_RUNTIME_PATH
    || join(homedir(), '.claude', 'vibecosystem-runtime.json');
}

interface BudgetState {
  session_id: string;
  total_chars: number;
  per_hook: Record<string, number>;
  per_event: Record<string, number>;
  updated_at: string;
}

interface BudgetLimits {
  perEventChars: number;
  sessionChars: number;
}

function getBudgetLimits(): BudgetLimits {
  try {
    const path = runtimePath();
    if (existsSync(path)) {
      const runtime = JSON.parse(readFileSync(path, 'utf-8'));
      const perEventChars = Number(runtime.contextBudget?.perEventChars);
      const sessionChars = Number(runtime.contextBudget?.sessionChars);
      if (Number.isFinite(perEventChars) && Number.isFinite(sessionChars)) {
        return {
          perEventChars: Math.max(0, perEventChars),
          sessionChars: Math.max(0, sessionChars),
        };
      }
    }
  } catch { /* use core defaults */ }
  return DEFAULT_LIMITS;
}

function loadBudget(): BudgetState {
  try {
    const path = budgetPath();
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch { /* fresh start */ }
  return {
    session_id: 'unknown',
    total_chars: 0,
    per_hook: {},
    per_event: {},
    updated_at: new Date().toISOString(),
  };
}

function saveBudget(budget: BudgetState): void {
  try {
    const path = budgetPath();
    const cacheDir = dirname(path);
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path, JSON.stringify(budget, null, 2));
  } catch { /* skip */ }
}

/**
 * Belirtilen hook'un bu event icin enjeksiyon yapip yapamayacagini kontrol eder.
 */
export function canInject(hookName: string, eventKey: string, charCount: number): boolean {
  const budget = loadBudget();
  const limits = getBudgetLimits();
  if (budget.total_chars + charCount > limits.sessionChars) return false;
  const eventChars = budget.per_event[eventKey] || 0;
  if (eventChars + charCount > limits.perEventChars) return false;
  return true;
}

/**
 * Yapilan enjeksiyonu kaydet.
 */
export function recordInjection(hookName: string, eventKey: string, charCount: number): void {
  const budget = loadBudget();
  budget.total_chars += charCount;
  budget.per_hook[hookName] = (budget.per_hook[hookName] || 0) + charCount;
  budget.per_event[eventKey] = (budget.per_event[eventKey] || 0) + charCount;
  budget.updated_at = new Date().toISOString();
  saveBudget(budget);
}

/**
 * Atomik canInject + recordInjection: kontrol ve kaydi tek seferde yapar.
 * Race condition penceresi daraltilmis versiyon.
 */
export function tryInject(hookName: string, eventKey: string, charCount: number): boolean {
  const budget = loadBudget();
  const limits = getBudgetLimits();
  if (budget.total_chars + charCount > limits.sessionChars) return false;
  const eventChars = budget.per_event[eventKey] || 0;
  if (eventChars + charCount > limits.perEventChars) return false;

  budget.total_chars += charCount;
  budget.per_hook[hookName] = (budget.per_hook[hookName] || 0) + charCount;
  budget.per_event[eventKey] = (budget.per_event[eventKey] || 0) + charCount;
  budget.updated_at = new Date().toISOString();
  saveBudget(budget);
  return true;
}

/**
 * Reserve the available budget for a hook output and return a bounded value.
 * Hooks can use this at their final output boundary, which keeps the budget
 * enforcement consistent even when the context was assembled in several steps.
 */
export function budgetContext(hookName: string, eventKey: string, context: string): string {
  if (!context) return '';
  const budget = loadBudget();
  const limits = getBudgetLimits();
  const eventRemaining = Math.max(0, limits.perEventChars - (budget.per_event[eventKey] || 0));
  const sessionRemaining = Math.max(0, limits.sessionChars - budget.total_chars);
  const available = Math.min(eventRemaining, sessionRemaining);
  if (available <= 0) return '';

  const bounded = context.length > available
    ? `${context.slice(0, Math.max(0, available - 18))}\n[truncated]`
    : context;
  return tryInject(hookName, eventKey, bounded.length) ? bounded : '';
}

/** Apply the budget to a Claude hook result without changing its other fields. */
export function budgetHookOutput<T extends Record<string, any>>(
  output: T,
  hookName: string,
  eventKey: string,
): T {
  const root = output as Record<string, any>;
  if (root.additionalContext) {
    const context = budgetContext(hookName, eventKey, String(root.additionalContext));
    if (context) root.additionalContext = context;
    else delete root.additionalContext;
  }

  const hookOutput = output.hookSpecificOutput;
  if (hookOutput?.additionalContext) {
    const context = budgetContext(hookName, eventKey, String(hookOutput.additionalContext));
    if (context) {
      hookOutput.additionalContext = context;
    } else {
      delete hookOutput.additionalContext;
      if (Object.keys(hookOutput).length === 0) delete output.hookSpecificOutput;
    }
  }
  if (hookOutput?.permissionDecisionReason) {
    const reason = budgetContext(hookName, `${eventKey}:reason`, String(hookOutput.permissionDecisionReason));
    if (reason) hookOutput.permissionDecisionReason = reason;
    else delete hookOutput.permissionDecisionReason;
  }
  if (hookOutput?.updatedInput?.prompt) {
    const prompt = budgetContext(hookName, `${eventKey}:prompt`, String(hookOutput.updatedInput.prompt));
    if (prompt) hookOutput.updatedInput.prompt = prompt;
    else delete hookOutput.updatedInput.prompt;
  }

  for (const field of ['message', 'systemMessage']) {
    if (typeof root[field] !== 'string') continue;
    const message = budgetContext(hookName, `${eventKey}:${field}`, root[field]);
    if (message) root[field] = message;
    else delete root[field];
  }
  return output;
}

export { DEFAULT_LIMITS, FULL_LIMITS, getBudgetLimits };

/**
 * Session baslangicinda budget'i sifirla.
 */
export function resetBudget(sessionId: string): void {
  const budget: BudgetState = {
    session_id: sessionId,
    total_chars: 0,
    per_hook: {},
    per_event: {},
    updated_at: new Date().toISOString(),
  };
  saveBudget(budget);
}

/**
 * Hook'un mevcut intent icin relevant olup olmadigini kontrol eder.
 * current-intent.json'dan intent tipini okur.
 */
const HOOK_RELEVANCE: Record<string, string[]> = {
  'tldr-read-enforcer': ['implementation', 'debug', 'research'],
  'smart-search-router': ['implementation', 'debug', 'research'],
  'signature-helper': ['implementation'],
  'arch-context-inject': ['implementation', 'planning'],
  'compiler-in-the-loop': ['implementation', 'debug'],
  'edit-context-inject': ['implementation'],
  'impact-refactor': ['implementation'],
};

/**
 * Hook'un mevcut intent icin relevant olup olmadigini kontrol eder.
 * Intent bilinmiyorsa veya hook listede yoksa true doner (guvenli taraf).
 */
export function isRelevantForIntent(hookName: string): boolean {
  const relevantTypes = HOOK_RELEVANCE[hookName];
  if (!relevantTypes) return true; // Listede yoksa her zaman calistir

  try {
    const intentPath = join(homedir(), '.claude', 'cache', 'current-intent.json');
    if (!existsSync(intentPath)) return true; // Intent bilinmiyorsa calistir

    // Staleness kontrolu: 30dk'dan eski intent dosyasini yoksay (farkli session'dan kalmis olabilir)
    const fileStat = statSync(intentPath);
    const ageMs = Date.now() - fileStat.mtimeMs;
    if (ageMs > 30 * 60 * 1000) return true;

    const intent = JSON.parse(readFileSync(intentPath, 'utf-8'));
    const taskType = intent.task_type || 'conversational';

    return relevantTypes.includes(taskType);
  } catch {
    return true; // Hata durumunda guvenli taraf
  }
}

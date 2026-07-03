/**
 * Stop Policy - SubagentStop karar mantığı (saf, test edilebilir)
 *
 * Beyin fırtınası P1 paketi (2026-06-04):
 *
 *   B1. CLAIM-VS-EVIDENCE: Agent "testler geçti / build temiz" gibi KESİN bir
 *       iddia atıyor ama transcript'te bunu destekleyen başarılı komut yoksa
 *       → unverified_claim. Kullanıcının doğrulama disiplini ("agent GREEN
 *       beyanına güvenme") hook katmanına gömülmüş hali.
 *
 *   E1. ENFORCEMENT EVADED: Block'a rağmen ikinci geçişte de HATA RAPORU
 *       yazılmadıysa iz bırak (fail-open korunur ama görünür olur).
 *
 *   E2. RETRY STORM: Aynı komut ≥3 kez fail → kırılganlık sinyali; sonunda
 *       geçse bile yaklaşım sorunu var demektir.
 *
 * Bu modül I/O yapmaz — hook (subagent-stop-learner) I/O'yu üstlenir.
 */
import type { ToolErrorRecord, LedgerEntry, ScanContext } from './agent-error-scan.js';
import { hasErrorReport, buildErrorReportInstruction } from './agent-error-scan.js';

// ---------------------------------------------------------------------------
// B1: Claim tespiti
// ---------------------------------------------------------------------------

export type ClaimType = 'test' | 'build';

export interface ClaimFinding {
  type: ClaimType;
  /** Mesajda eşleşen iddia metni */
  claim: string;
}

interface ClaimPattern { regex: RegExp; type: ClaimType }

/** KESİN dil — hedge'li ifadeler (should/probably/muhtemelen) ayrıca elenir */
const CLAIM_PATTERNS: ClaimPattern[] = [
  // Test iddiaları (EN)
  { regex: /\b(?:all\s+)?tests?\s+(?:are\s+now\s+|are\s+|now\s+)?(?:pass(?:ing|ed)?|green)\b/gi, type: 'test' },
  { regex: /\b\d+\s*\/\s*\d+\s+tests?\s+pass(?:ing|ed)?\b/gi, type: 'test' },
  { regex: /\b\d+\s+tests?\s+passed\b/gi, type: 'test' },
  { regex: /\btest\s+suite\s+(?:is\s+)?(?:passing|green|clean)\b/gi, type: 'test' },
  // Test iddiaları (TR)
  { regex: /\b(?:tüm\s+)?testler\s+(?:geç(?:ti|iyor)|yeşil)\b/gi, type: 'test' },
  // Build iddiaları (EN)
  { regex: /\bbuild\s+(?:is\s+|was\s+)?(?:successful|succeeded|passing|passes|green|clean)\b/gi, type: 'build' },
  { regex: /\bcompil(?:es|ed)\s+(?:successfully|cleanly|without\s+errors)\b/gi, type: 'build' },
  { regex: /\btsc\s+(?:is\s+)?(?:clean|passes|passed)\b/gi, type: 'build' },
  { regex: /\btype\s*-?\s*check\s+(?:passed|passes|clean)\b/gi, type: 'build' },
  // Build iddiaları (TR)
  { regex: /\bbuild\s+(?:temiz|geçti|başarılı)\b/gi, type: 'build' },
  { regex: /\bderleme\s+(?:temiz|başarılı|geçti)\b/gi, type: 'build' },
];

/**
 * İddia çevresinde (±60 char) hedge/feragat varsa iddia sayılmaz:
 * "tests should pass", "tests pass (UNVERIFIED)", "muhtemelen testler geçer"
 */
const HEDGE_RE = /should|likely|probably|expect|assum|hopefully|appears?|seems?|might|muhtemelen|olmalı|geçmeli|beklenir|unverified|not\s+verified|didn'?t\s+run|haven'?t\s+run|could\s+not\s+run|doğrulanmadı|çalıştır(?:ı|a)?l?(?:a)?madı|koşulmadı|if\s+/i;

export function detectClaims(message: string): ClaimFinding[] {
  if (!message) return [];
  const findings: ClaimFinding[] = [];
  const seen = new Set<string>();

  for (const { regex, type } of CLAIM_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(message)) !== null) {
      const start = Math.max(0, m.index - 60);
      const end = Math.min(message.length, m.index + m[0].length + 60);
      const window = message.slice(start, end);
      if (HEDGE_RE.test(window)) continue;

      const key = `${type}:${m[0].toLowerCase().slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ type, claim: m[0].slice(0, 80) });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// B1: Evidence tespiti — transcript'teki BAŞARILI Bash komutları
// ---------------------------------------------------------------------------

const TEST_EVIDENCE_RE = /(?:^|[\s&;|(])(?:npx\s+|pnpm\s+(?:exec\s+)?|yarn\s+)?(?:vitest|jest|mocha|playwright\s+test|pytest|phpunit|rspec)\b|\bnpm\s+(?:run\s+)?test\b|\bpnpm\s+(?:run\s+)?test\b|\byarn\s+test\b|\bbun\s+test\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b|\bmvn\s+test\b|\bgradle\s+test\b|\bpython3?\s+-m\s+pytest\b/i;

const BUILD_EVIDENCE_RE = /\btsc\b|\bnpm\s+run\s+build\b|\bpnpm\s+(?:run\s+)?build\b|\byarn\s+build\b|\bgo\s+build\b|\bcargo\s+build\b|\bdotnet\s+build\b|\bmake\b|\bgradle\s+(?:build|assemble)\b|\bmvn\s+(?:package|compile|install)\b|\besbuild\b|\bvite\s+build\b|\bnext\s+build\b|\bgodot[^\n]*--export/i;

export function hasEvidence(type: ClaimType, successfulCommands: string[]): boolean {
  const re = type === 'test' ? TEST_EVIDENCE_RE : BUILD_EVIDENCE_RE;
  return successfulCommands.some((cmd) => re.test(cmd));
}

/** Kanıtsız iddiaları döndür */
export function detectUnverifiedClaims(message: string, successfulCommands: string[]): ClaimFinding[] {
  return detectClaims(message).filter((c) => !hasEvidence(c.type, successfulCommands));
}

// ---------------------------------------------------------------------------
// E2: Retry storm
// ---------------------------------------------------------------------------

export interface RetryStorm {
  command_head: string;
  count: number;
  classification: string;
}

export function detectRetryStorms(errors: ToolErrorRecord[], threshold: number = 3): RetryStorm[] {
  const counts = new Map<string, { count: number; classification: string }>();
  for (const e of errors) {
    const cur = counts.get(e.command_head);
    if (cur) {
      cur.count++;
      cur.classification = e.classification; // son sınıflandırma
    } else {
      counts.set(e.command_head, { count: 1, classification: e.classification });
    }
  }
  return [...counts.entries()]
    .filter(([, v]) => v.count >= threshold)
    .map(([command_head, v]) => ({ command_head, count: v.count, classification: v.classification }));
}

// ---------------------------------------------------------------------------
// Policy kararı
// ---------------------------------------------------------------------------

export interface StopPolicyInput {
  errors: ToolErrorRecord[];
  lastMessage: string;
  stopHookActive: boolean;
  successfulCommands: string[];
}

export interface StopPolicyResult {
  shouldBlock: boolean;
  blockReason: string;
  unverifiedClaims: ClaimFinding[];
  retryStorms: RetryStorm[];
  /** İkinci geçişte bile hata raporu yazılmadı (block'a rağmen) */
  evaded: boolean;
}

export function buildClaimInstruction(claims: ClaimFinding[]): string {
  const list = claims.map((c, i) => `${i + 1}. "${c.claim}" (${c.type})`).join('\n');
  return (
    `Your final message makes ${claims.length} verification claim(s) with NO supporting evidence in your transcript (no successful test/build command was run):\n` +
    `${list}\n\n` +
    `Do ONE of the following, then finish:\n` +
    `- Actually RUN the verification command now and report the real result, OR\n` +
    `- Amend your final message: mark the claim explicitly as UNVERIFIED and state that you did not run it.\n` +
    `Honest uncertainty beats false confidence — an unverified "green" claim means the parent ships a bug.`
  );
}

/**
 * SubagentStop karar mantığı:
 * - İlk geçiş + (raporlanmamış hata VEYA kanıtsız iddia) → block (birleşik reason)
 * - İkinci geçiş → asla block; hâlâ rapor yoksa evaded işaretle
 */
export function evaluateStopPolicy(input: StopPolicyInput): StopPolicyResult {
  const { errors, lastMessage, stopHookActive, successfulCommands } = input;

  const unverifiedClaims = detectUnverifiedClaims(lastMessage, successfulCommands);
  const retryStorms = detectRetryStorms(errors);
  const errorsUnreported = errors.length > 0 && !hasErrorReport(lastMessage);

  if (stopHookActive) {
    return {
      shouldBlock: false,
      blockReason: '',
      unverifiedClaims,
      retryStorms,
      evaded: errorsUnreported,
    };
  }

  const parts: string[] = [];
  if (errorsUnreported) parts.push(buildErrorReportInstruction(errors));
  if (unverifiedClaims.length > 0) parts.push(buildClaimInstruction(unverifiedClaims));

  return {
    shouldBlock: parts.length > 0,
    blockReason: parts.join('\n\n---\n\n'),
    unverifiedClaims,
    retryStorms,
    evaded: false,
  };
}

// ---------------------------------------------------------------------------
// Ledger entry builder'ları (I/O yok — hook append eder)
// ---------------------------------------------------------------------------

export function claimsToLedgerEntries(claims: ClaimFinding[], ctx: ScanContext): LedgerEntry[] {
  const now = new Date().toISOString();
  return claims.map((c) => ({
    ts: now,
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: 'unverified_claim',
    error_pattern: `claim-fail: ${c.type}`,
    detail: `Kanıtsız iddia: "${c.claim}" — transcript'te başarılı ${c.type} komutu yok`,
    file: 'unknown',
    lesson: `'${ctx.agentType}' kanıtsız ${c.type} iddiası attı — GREEN beyanını ana ağaçta doğrula`,
    tool: 'claim',
    command: c.claim,
    command_head: `claim:${c.type}`,
    source: 'stop-policy',
  }));
}

export function stormsToLedgerEntries(storms: RetryStorm[], ctx: ScanContext): LedgerEntry[] {
  const now = new Date().toISOString();
  return storms.map((s) => ({
    ts: now,
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: 'retry_storm',
    error_pattern: `retry-storm: ${s.command_head}`,
    detail: `'${s.command_head}' aynı task içinde ${s.count} kez fail etti (${s.classification})`,
    file: 'unknown',
    lesson: `'${s.command_head}' ${s.count}x fail — körlemesine retry yerine yaklaşım değiştir/parent'a bildir`,
    tool: 'retry',
    command: s.command_head,
    command_head: s.command_head,
    source: 'stop-policy',
  }));
}

/**
 * D2: Paralel agent kaynak çakışması korelasyonu.
 * Bu agent'ın resource_conflict hatası + son `windowMs` içinde FARKLI bir
 * agent'tan da resource_conflict varsa → parallel_conflict kaydı.
 */
export function detectParallelConflicts(
  newErrors: ToolErrorRecord[],
  ctx: ScanContext,
  recentLedger: LedgerEntry[],
  windowMs: number = 120000,
  now: number = Date.now()
): LedgerEntry[] {
  const mine = newErrors.filter((e) => e.classification === 'resource_conflict');
  if (mine.length === 0) return [];

  const others = recentLedger.filter((r) => {
    if (r.error_type !== 'resource_conflict') return false;
    if (r.agent_id === ctx.agentId) return false;
    const ts = Date.parse(r.ts);
    return Number.isFinite(ts) && now - ts < windowMs;
  });
  if (others.length === 0) return [];

  const nowIso = new Date(now).toISOString();
  const seen = new Set<string>();
  const out: LedgerEntry[] = [];

  for (const e of mine) {
    if (seen.has(e.command_head)) continue;
    seen.add(e.command_head);
    const otherAgents = [...new Set(others.map((o) => o.agent_type))].slice(0, 5);
    out.push({
      ts: nowIso,
      session: ctx.sessionId.slice(0, 8),
      agent_id: ctx.agentId,
      agent_type: ctx.agentType,
      error_type: 'parallel_conflict',
      error_pattern: `parallel-conflict: ${e.command_head}`,
      detail: `'${ctx.agentType}' ve [${otherAgents.join(', ')}] ${Math.round(windowMs / 60000)} dk içinde aynı kaynak sınıfında çakıştı: ${e.error_text.slice(0, 100)}`,
      file: 'unknown',
      lesson: `Paralel agent'lar aynı kaynağı (port/lock/db) paylaşıyor — işleri serialize et ya da kaynakları izole et (farklı port, worktree)`,
      tool: 'correlation',
      command: e.command.slice(0, 200),
      command_head: e.command_head,
      source: 'stop-policy',
    });
  }
  return out;
}

export function evadedLedgerEntry(errorCount: number, ctx: ScanContext): LedgerEntry {
  return {
    ts: new Date().toISOString(),
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: 'enforcement_evaded',
    error_pattern: 'hata-raporu-yazilmadi',
    detail: `Agent ${errorCount} hataya rağmen block sonrası da HATA RAPORU yazmadı`,
    file: 'unknown',
    lesson: `'${ctx.agentType}' enforcement'ı atlattı — bu agent'ın çıktılarına ekstra şüpheyle yaklaş`,
    tool: 'enforcement',
    command: '',
    command_head: 'enforcement:evaded',
    source: 'stop-policy',
  };
}

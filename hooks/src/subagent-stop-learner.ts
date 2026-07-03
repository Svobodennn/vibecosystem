/**
 * Subagent Stop Learner + Canavar Error Scan - SubagentStop hook
 *
 * Subagent durmadan önce üç iş yapar:
 *
 * 1. ERROR SCAN: Agent transcript'ini tarar (agent_transcript_path), tüm tool
 *    hatalarını çıkarır → Canavar error-ledger.jsonl (agent attribution'lı,
 *    dashboard'da görünür) + skill-matrix.json + dashboard'a agent_error event.
 *
 * 2. ENFORCEMENT: Agent hata aldıysa ama final mesajında "## HATA RAPORU" yoksa
 *    decision:block ile durmasını engeller — agent her hatayı, ne yaptığını ve
 *    task'ın COMPLETE/PARTIAL durumunu raporlamak zorunda kalır. Parent bu
 *    raporu final mesajda görür. (Sessiz fail = yarım ve buglı task.)
 *    stop_hook_active=true ikinci geçişte tekrar bloklamaz (sonsuz döngü koruması).
 *
 * 3. LEARNING: Final mesajdan öğrenimleri çıkarır → instincts.jsonl +
 *    agent-learnings.jsonl (mevcut instinct pipeline'ına beslenir).
 *
 * Gerçek SubagentStop input şeması (2026-06-04 probe ile doğrulandı):
 *   { session_id, transcript_path, cwd, permission_mode, agent_id, agent_type,
 *     hook_event_name, stop_hook_active, agent_transcript_path,
 *     last_assistant_message, background_tasks, session_crons }
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  scanTranscriptFull,
  resolveAgentType,
  toLedgerEntries,
  appendLedgerEntries,
  recordAgentStop,
  bumpAgentMetric,
  emitDashboardEvent,
  type ToolErrorRecord,
} from './shared/agent-error-scan.js';
import {
  evaluateStopPolicy,
  claimsToLedgerEntries,
  stormsToLedgerEntries,
  evadedLedgerEntry,
  detectParallelConflicts,
} from './shared/stop-policy.js';
import { clearRunningAgent, readLedgerTail } from './shared/canavar-store.js';

interface SubagentStopInput {
  session_id: string;
  hook_event_name: string;
  agent_id?: string;
  agent_type?: string;
  agent_transcript_path?: string;
  last_assistant_message?: string;
  stop_hook_active?: boolean;
}

interface AgentLearning {
  ts: string;
  session: string;
  type: 'agent_learning';
  agent_type: string;
  pattern: string;
  detail: string;
  confidence: number;
  task_description: string;
}

// --- Learning extraction (önceki sürümden, gerçek input ile artık çalışıyor) ---

const LEARNING_PATTERNS: Array<{ regex: RegExp; label: string; confidence: number }> = [
  // Error → Fix
  { regex: /(?:fixed|resolved|solved)\s+(?:by|with|using)\s+(.{10,120})/gi, label: 'error-fix', confidence: 0.8 },
  { regex: /(?:root\s+cause)[:\s]+(.{10,120})/gi, label: 'root-cause', confidence: 0.9 },
  { regex: /(?:caused\s+by)\s+(.{10,120})/gi, label: 'root-cause', confidence: 0.7 },
  // Başarılı yaklaşımlar
  { regex: /(?:solution|approach|fix)[:\s]+(.{10,120})/gi, label: 'working-solution', confidence: 0.7 },
  // Başarısız yaklaşımlar
  { regex: /(?:didn'?t\s+work|failed|doesn'?t\s+work|won'?t\s+work)[:\s]*(.{10,100})/gi, label: 'failed-approach', confidence: 0.7 },
  { regex: /(?:avoid|don'?t|never|careful\s+with)\s+(.{10,100})/gi, label: 'anti-pattern', confidence: 0.6 },
  // Kararlar
  { regex: /(?:decided|chose|chosen|selected)\s+(?:to\s+)?(.{10,100})\s+(?:because|since|as)/gi, label: 'decision', confidence: 0.7 },
  // Pattern keşfi
  { regex: /(?:pattern|convention|standard)[:\s]+(.{10,100})/gi, label: 'codebase-pattern', confidence: 0.7 },
  { regex: /(?:found\s+that|discovered\s+that|noticed\s+that)\s+(.{10,120})/gi, label: 'discovery', confidence: 0.7 },
  // Security
  { regex: /(?:vulnerabilit(?:y|ies)|security\s+(?:issue|risk|concern))[:\s]+(.{10,120})/gi, label: 'security-finding', confidence: 0.8 },
  // Performance
  { regex: /(?:bottleneck|memory\s+leak)[:\s]*(.{10,100})/gi, label: 'performance-finding', confidence: 0.6 },
];

const HIGH_VALUE_AGENTS = new Set([
  'sleuth', 'scout', 'kraken', 'spark', 'architect', 'phoenix',
  'code-reviewer', 'security-reviewer', 'profiler', 'build-error-resolver',
  'tdd-guide', 'database-reviewer', 'verifier', 'self-learner',
]);

function extractLearnings(output: string, agentType: string, sessionId: string): AgentLearning[] {
  if (!output || output.length < 20) return [];

  const learnings: AgentLearning[] = [];
  const seen = new Set<string>();
  const text = output.slice(0, 3000);

  for (const { regex, label, confidence } of LEARNING_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const detail = (match[1] || match[0]).trim();
      if (detail.length < 10 || detail.length > 150) continue;

      const key = `${label}:${detail.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      learnings.push({
        ts: new Date().toISOString(),
        session: sessionId.slice(0, 8),
        type: 'agent_learning',
        agent_type: agentType,
        pattern: `${agentType}:${label}`,
        detail: detail.slice(0, 150),
        confidence: HIGH_VALUE_AGENTS.has(agentType) ? confidence : confidence * 0.7,
        task_description: '',
      });

      if (learnings.filter((l) => l.pattern === `${agentType}:${label}`).length >= 3) break;
    }
  }

  return learnings.slice(0, 8);
}

function writeLearnings(learnings: AgentLearning[], agentType: string, sessionId: string): void {
  if (learnings.length === 0) return;
  try {
    const claudeDir = join(homedir(), '.claude');
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

    const instinctsPath = join(claudeDir, 'instincts.jsonl');
    for (const learning of learnings) {
      appendFileSync(instinctsPath, JSON.stringify(learning) + '\n');
    }

    const agentLogPath = join(claudeDir, 'agent-learnings.jsonl');
    appendFileSync(agentLogPath, JSON.stringify({
      ts: new Date().toISOString(),
      session: sessionId.slice(0, 8),
      agent_type: agentType,
      learnings_count: learnings.length,
      patterns: learnings.map((l) => l.pattern),
    }) + '\n');
  } catch { /* fail-silent */ }
}

// --- Main ---

async function main(): Promise<void> {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { return; }
  if (!raw) { console.log('{}'); return; }

  let input: SubagentStopInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  if (input.hook_event_name !== 'SubagentStop') {
    console.log('{}');
    return;
  }

  const sessionId = input.session_id || 'unknown';
  const agentId = input.agent_id || 'unknown';
  // P3: input'ta agent_type yoksa transcript yanındaki .meta.json'dan çöz;
  // o da yoksa null → matrix istatistiklerini KIRLETME (unknown-agent birikimi fix'i)
  const resolvedType = resolveAgentType(input.agent_type, input.agent_transcript_path);
  const agentType = resolvedType || 'unknown-agent';
  const lastMessage = input.last_assistant_message || '';
  const stopHookActive = input.stop_hook_active === true;

  // 1) SCAN — tool hataları + başarılı Bash komutları (claim-evidence için)
  let errors: ToolErrorRecord[] = [];
  let successfulCommands: string[] = [];
  let compactionCount = 0;
  if (input.agent_transcript_path) {
    const scan = scanTranscriptFull(input.agent_transcript_path);
    errors = scan.errors;
    successfulCommands = scan.successfulCommands;
    compactionCount = scan.compactionCount;
  }

  const ctx = { sessionId, agentId, agentType };

  // Policy: block kararı (hata raporu + kanıtsız iddia birleşik), storm/evasion tespiti
  const policy = evaluateStopPolicy({ errors, lastMessage, stopHookActive, successfulCommands });

  // 2) KAYIT — ilk geçişte (stop_hook_active=true ikinci geçiştir; çift sayma olmasın)
  if (!stopHookActive) {
    // D2: tail'i KENDİ kayıtlarımızı yazmadan önce oku (başka agent'ların izleri)
    const recentLedger = readLedgerTail(100);
    appendLedgerEntries([
      ...toLedgerEntries(errors, ctx),
      ...stormsToLedgerEntries(policy.retryStorms, ctx), // E2: aynı komut ≥3 fail
      ...claimsToLedgerEntries(policy.unverifiedClaims, ctx), // B1: kanıtsız GREEN iddiası
      ...detectParallelConflicts(errors, ctx, recentLedger), // D2: paralel kaynak çakışması
    ]);
    // Matrix istatistikleri SADECE kimliği çözülmüş agent'lara yazılır
    // (kimliksiz iç sidechain'ler unknown-agent olarak istatistik şişiriyordu)
    if (resolvedType) {
      recordAgentStop(resolvedType, errors);
      if (policy.retryStorms.length > 0) {
        bumpAgentMetric(resolvedType, 'retry_storms', policy.retryStorms.length);
      }
      if (policy.unverifiedClaims.length > 0) {
        bumpAgentMetric(resolvedType, 'unverified_claims', policy.unverifiedClaims.length);
      }
      if (compactionCount > 0) {
        bumpAgentMetric(resolvedType, 'compactions', compactionCount); // E5: kalite riski sinyali
      }
    }

    if (errors.length > 0 || policy.unverifiedClaims.length > 0) {
      await emitDashboardEvent({
        type: 'agent_error',
        timestamp: new Date().toISOString(),
        sessionId: sessionId.slice(0, 8),
        agentType,
        agentId,
        status: 'error',
        metadata: {
          errorCount: errors.length,
          commands: [...new Set(errors.map((e) => e.command_head))].slice(0, 10),
          classifications: [...new Set(errors.map((e) => e.classification))],
          unverifiedClaims: policy.unverifiedClaims.length,
          retryStorms: policy.retryStorms.map((s) => s.command_head),
          source: 'subagent-scan',
        },
      });
    }
  }

  // 3) ENFORCEMENT — tek dürtme; ikinci geçişte policy ASLA block döndürmez
  // (bu fail-open davranış bilinçli — kaldırılırsa sonsuz döngü olur!)
  if (policy.shouldBlock) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: policy.blockReason,
    }));
    return; // agent devam ediyor → running-agents kaydı KALIR (watchdog doğru sayar)
  }

  // Agent gerçekten duruyor → watchdog kaydını düş
  clearRunningAgent(agentId);

  // 3b) E1 — block'a rağmen ikinci geçişte de rapor yok → iz bırak (görünür fail-open)
  if (policy.evaded) {
    appendLedgerEntries([evadedLedgerEntry(errors.length, ctx)]);
    if (resolvedType) bumpAgentMetric(resolvedType, 'enforcement_evasions');
  }

  // 3) LEARNING — sadece nihai mesajdan (block edilmeyecekse) çıkar
  const learnings = extractLearnings(lastMessage, agentType, sessionId);
  writeLearnings(learnings, agentType, sessionId);

  if (learnings.length > 0) {
    console.log(JSON.stringify({
      result: `Extracted ${learnings.length} learnings from ${agentType} agent`,
    }));
  } else {
    console.log('{}');
  }
}

main();

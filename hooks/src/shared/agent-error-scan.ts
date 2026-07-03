/**
 * Agent Error Scan - Ortak kütüphane
 *
 * Subagent transcript'lerini (agent-<id>.jsonl) tarayıp tool hatalarını çıkarır.
 * SubagentStop hook'u bu kütüphaneyle:
 *   1. Agent'ın aldığı TÜM tool hatalarını tespit eder (PostToolUse fail'lerde ateşlenmez,
 *      tek güvenilir kaynak transcript'tir — probe ile doğrulandı, 2026-06-04)
 *   2. Canavar error-ledger.jsonl'e agent attribution'lı kayıt yazar
 *   3. Agent final mesajında HATA RAPORU yoksa decision:block ile rapor yazmaya zorlar
 *
 * Doğrulanmış transcript formatı:
 *   assistant satırı: message.content[] içinde {type:'tool_use', id, name, input}
 *   user satırı:      message.content[] içinde {type:'tool_result', tool_use_id, is_error, content}
 *   hata içeriği:     "Exit code 7\n<output>" gibi string ya da [{type:'text',text}] dizisi
 */
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import http from 'http';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type ErrorClass =
  | 'command_not_found'
  | 'permission_denied'
  | 'sandbox_block'
  | 'resource_conflict'
  | 'timeout'
  | 'command_fail'
  | 'tool_error';

export interface ToolErrorRecord {
  tool: string;
  /** Tool input özeti: Bash → komut, Read/Edit → dosya yolu, vs. */
  command: string;
  /** Aggregation için normalize edilmiş komut başı: "git push", "npm test", "godot-mono" */
  command_head: string;
  error_text: string;
  classification: ErrorClass;
  exit_code: number | null;
  tool_use_id: string;
}

/** Canavar error-ledger.jsonl satır şeması (mevcut alanlar + yeni opsiyonel alanlar) */
export interface LedgerEntry {
  ts: string;
  session: string;
  agent_id: string;
  agent_type: string;
  error_type: string;
  error_pattern: string;
  detail: string;
  file: string;
  lesson: string;
  // Yeni alanlar (dashboard ve eski tüketiciler için opsiyonel, geriye uyumlu)
  tool?: string;
  command?: string;
  command_head?: string;
  source?: string;
}

export interface ScanContext {
  sessionId: string;
  agentId: string;
  agentType: string;
}

// ---------------------------------------------------------------------------
// Transcript parse
// ---------------------------------------------------------------------------

interface ToolUseInfo {
  name: string;
  input: Record<string, unknown>;
}

/** tool_result content'i string ya da [{type:'text',text}] olabilir */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string') {
          return (c as Record<string, string>).text;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

/**
 * Agent kimliğini çöz (unknown-agent kirliliğine karşı):
 * 1) Hook input'undaki agent_type
 * 2) Agent transcript'inin yanındaki agent-<id>.meta.json → {agentType}
 * 3) null → çağıran matrix istatistiklerini KIRLETMEMELI (ledger 'unknown-agent' olabilir)
 */
export function resolveAgentType(
  inputAgentType: string | undefined,
  agentTranscriptPath: string | undefined
): string | null {
  if (inputAgentType && inputAgentType !== 'unknown-agent') return inputAgentType;
  if (agentTranscriptPath && agentTranscriptPath.endsWith('.jsonl')) {
    try {
      const metaPath = agentTranscriptPath.replace(/\.jsonl$/, '.meta.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      if (typeof meta.agentType === 'string' && meta.agentType) return meta.agentType;
    } catch { /* meta yok/bozuk → null */ }
  }
  return inputAgentType || null;
}

/** Tool input'tan insan-okur özet çıkar */
export function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (name) {
    case 'Bash':
      return str(input.command).slice(0, 300);
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return str(input.file_path).slice(0, 200);
    case 'Grep':
      return `pattern: ${str(input.pattern).slice(0, 100)}`;
    case 'Glob':
      return `glob: ${str(input.pattern).slice(0, 100)}`;
    case 'WebFetch':
      return str(input.url).slice(0, 200);
    case 'Agent':
    case 'Task':
      return `subagent: ${str(input.subagent_type) || 'unknown'}`;
    default:
      try {
        return JSON.stringify(input).slice(0, 150);
      } catch {
        return '';
      }
  }
}

/** Bilinen çok-kelimeli CLI'lar: ilk token + subcommand birlikte anlamlı */
const SUBCOMMAND_TOOLS = new Set([
  'git', 'npm', 'pnpm', 'yarn', 'npx', 'bun', 'go', 'cargo', 'docker',
  'kubectl', 'dotnet', 'pip', 'pip3', 'python', 'python3', 'node', 'deno',
  'gh', 'terraform', 'helm', 'make', 'gradle', 'mvn', 'composer', 'bundle',
]);

/**
 * Komutu aggregation anahtarına indirger.
 * "cd /x && FOO=1 git push origin main" → "git push"
 * "/usr/local/bin/godot-mono --headless ..." → "godot-mono"
 */
export function normalizeCommandHead(command: string): string {
  if (!command) return 'unknown';
  let cmd = command.trim();

  // İlk ANLAMLI chain segmentini seç: cd/pushd prefix'leri ve asla-fail-etmez
  // builtin'ler (echo/printf/true/exit) atlanır — "echo hi && npm test" → "npm test"
  const segments = cmd.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
  const NEVER_FAIL = /^(?:echo|printf|true|:|exit)\b/;
  let seg = '';
  let firstNonCd = '';
  for (const s of segments) {
    if (/^(?:cd|pushd)\s/.test(s)) continue;
    if (!firstNonCd) firstNonCd = s;
    if (!NEVER_FAIL.test(s)) { seg = s; break; }
  }
  seg = seg || firstNonCd || segments[0] || cmd;

  // ENV=val prefix'lerini ve sudo'yu at
  const tokens = seg.split(/\s+/).filter((t) => !/^[A-Z_][A-Z0-9_]*=/.test(t) && t !== 'sudo');
  if (tokens.length === 0) return 'unknown';

  // İlk token'ı basename'e indir ("/usr/bin/python3" → "python3")
  const head = (tokens[0].split('/').pop() || tokens[0]).toLowerCase();

  if (SUBCOMMAND_TOOLS.has(head) && tokens[1] && !tokens[1].startsWith('-')) {
    const sub = (tokens[1].split('/').pop() || tokens[1]).slice(0, 40);
    return `${head} ${sub}`;
  }
  return head.slice(0, 50);
}

const EXIT_CODE_RE = /(?:^Error:\s*)?Exit code:?\s+(\d+)/im;

export function extractExitCode(text: string): number | null {
  const m = EXIT_CODE_RE.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Kullanıcı iptali — agent hatası değil, taranmaz */
const USER_ABORT_RE = /request interrupted by user|tool use was rejected/i;

export function classifyError(text: string, exitCode: number | null): ErrorClass {
  const t = text.toLowerCase();
  if (exitCode === 127 || /command not found|not recognized as an internal/.test(t)) {
    return 'command_not_found';
  }
  if (/sandbox|seatbelt|operation not permitted/.test(t)) return 'sandbox_block';
  if (/permission denied|not allowed|requires approval|denied by|user doesn'?t want|blocked by hook|haven'?t granted/.test(t)) {
    return 'permission_denied';
  }
  // Paralel agent'ların kaynak çakışması sinyalleri (port/lock/db)
  if (/eaddrinuse|address already in use|resource busy|database is locked|could not acquire lock|lock(?:file)?\s+(?:exists|held|timeout)|file is locked|port\s+\d+\s+is\s+(?:already\s+)?in use/.test(t)) {
    return 'resource_conflict';
  }
  if (/timed? out|etimedout|command timed/.test(t)) return 'timeout';
  if (exitCode !== null && exitCode !== 0) return 'command_fail';
  return 'tool_error';
}

/**
 * Transcript metnindeki satırları işler: tool_use'ları haritaya ekler,
 * is_error tool_result'ları errors'a yazar (errors=null → sadece tool_use topla),
 * successCommands verilirse BAŞARILI Bash komutlarını da toplar (claim-evidence için).
 */
function processTranscriptText(
  text: string,
  toolUses: Map<string, ToolUseInfo>,
  errors: ToolErrorRecord[] | null,
  successCommands: string[] | null = null
): void {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const message = entry.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;

      if (b.type === 'tool_use' && typeof b.id === 'string') {
        toolUses.set(b.id, {
          name: typeof b.name === 'string' ? b.name : 'unknown',
          input: (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>,
        });
      }

      if (b.type === 'tool_result' && b.is_error !== true) {
        const okUseId = typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
        const okUse = toolUses.get(okUseId);

        // Başarılı sonuç: claim-evidence için Bash komutunu topla
        if (successCommands !== null && okUse?.name === 'Bash' && typeof okUse.input.command === 'string') {
          successCommands.push(okUse.input.command.slice(0, 300));
        }

        // C1: MCP tool'ları protokol hatası vermeden gövde-içi error dönebilir
        // ({"error": "...", ...} ama is_error:false) — JSON alan kontrolü, kelime değil
        if (errors !== null && okUse?.name.startsWith('mcp__')) {
          const bodyText = extractText(b.content).trim();
          if (bodyText.startsWith('{')) {
            try {
              const body = JSON.parse(bodyText.slice(0, 20000));
              const bodyError =
                (typeof body.error === 'string' && body.error) ||
                (body.isError === true ? 'isError: true' : '');
              if (bodyError) {
                errors.push({
                  tool: okUse.name,
                  command: summarizeToolInput(okUse.name, okUse.input),
                  command_head: okUse.name.toLowerCase().slice(0, 50),
                  error_text: String(bodyError).slice(0, 600),
                  classification: 'tool_error',
                  exit_code: null,
                  tool_use_id: okUseId,
                });
              }
            } catch { /* JSON değil → gövde hatası yok say */ }
          }
        }
        continue;
      }

      if (b.type === 'tool_result' && b.is_error === true) {
        if (errors === null) continue; // lookback modu: sadece tool_use topluyoruz

        // Sınıflandırma geniş pencerede (gömülü keyword kaçmasın),
        // depolama 600 char ile sınırlı (ledger şişmesin)
        const fullText = extractText(b.content).slice(0, 20000);
        if (USER_ABORT_RE.test(fullText)) continue;
        const errorText = fullText.slice(0, 600);

        const toolUseId = typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
        const use = toolUses.get(toolUseId);
        const toolName = use?.name || 'unknown';
        const command = use ? summarizeToolInput(toolName, use.input) : '';
        const exitCode = extractExitCode(fullText);

        errors.push({
          tool: toolName,
          command,
          // Orphan tool_result (tool_use eşleşmedi) ayrı bucket'a: cmdfail kirlenmesin
          command_head: toolName === 'Bash'
            ? normalizeCommandHead(command)
            : toolName === 'unknown' ? 'unknown-tool' : toolName.toLowerCase(),
          error_text: errorText,
          classification: classifyError(fullText, exitCode),
          exit_code: exitCode,
          tool_use_id: toolUseId,
        });
      }
    }
  }
}

/**
 * Agent transcript'ini tara, tüm tool hatalarını çıkar.
 * Dosya yoksa/parse edilemiyorsa boş dizi döner (fail-silent — hook'lar asla patlamamalı).
 */
export function scanTranscriptForErrors(transcriptPath: string): ToolErrorRecord[] {
  let raw = '';
  try {
    raw = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return [];
  }
  const toolUses = new Map<string, ToolUseInfo>();
  const errors: ToolErrorRecord[] = [];
  processTranscriptText(raw, toolUses, errors);
  return errors;
}

export interface FullScanResult {
  errors: ToolErrorRecord[];
  /** Başarıyla biten Bash komutları (claim-vs-evidence kontrolü için) */
  successfulCommands: string[];
  /** E5: Agent çalışırken context compaction yaşandıysa kalite riski sinyali */
  compactionCount: number;
}

/** Transcript'i tek geçişte tara: hatalar + başarılı Bash komutları + compaction */
export function scanTranscriptFull(transcriptPath: string): FullScanResult {
  let raw = '';
  try {
    raw = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return { errors: [], successfulCommands: [], compactionCount: 0 };
  }
  const toolUses = new Map<string, ToolUseInfo>();
  const errors: ToolErrorRecord[] = [];
  const successfulCommands: string[] = [];
  processTranscriptText(raw, toolUses, errors, successfulCommands);
  const compactionCount = (raw.match(/"subtype":"compact_boundary"/g) || []).length;
  return { errors, successfulCommands, compactionCount };
}

export interface IncrementalScanResult {
  errors: ToolErrorRecord[];
  /** Bir sonraki taramada kullanılacak byte offset (son TAM satırın sonu) */
  offset: number;
}

/** tool_use → tool_result eşleşmesi için geriye bakış penceresi (byte) */
const LOOKBACK_BYTES = 256 * 1024;

/**
 * Transcript'i verilen BYTE offset'inden itibaren tarar.
 * Stop hook'u her turda çalıştığı için tüm dosyayı yeniden taramamak ve
 * ledger'a çift kayıt düşmemek için cursor mekanizması.
 *
 * - Offset'ler byte cinsindendir; \n (0x0A) UTF-8 multi-byte sequence içinde
 *   geçemeyeceği için satır sınırları byte düzeyinde güvenlidir.
 * - Yeni bölgedeki tool_result'un tool_use'u önceki turda kalmış olabilir:
 *   LOOKBACK penceresi yalnızca tool_use haritası için taranır (hata üretmez).
 * - Sondaki newline'sız parçalı satır işlenmez; offset son tam satırda durur,
 *   satır tamamlanınca bir sonraki çağrıda işlenir.
 */
export function scanTranscriptIncremental(transcriptPath: string, fromOffset: number): IncrementalScanResult {
  let size: number;
  try {
    size = statSync(transcriptPath).size;
  } catch {
    return { errors: [], offset: Math.max(0, fromOffset) };
  }

  const safeFrom = Math.max(0, Math.min(fromOffset, size));
  if (size <= safeFrom) return { errors: [], offset: safeFrom };

  const start = Math.max(0, safeFrom - LOOKBACK_BYTES);
  let buf: Buffer;
  try {
    const fd = openSync(transcriptPath, 'r');
    try {
      buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
    } finally {
      closeSync(fd);
    }
  } catch {
    return { errors: [], offset: safeFrom };
  }

  const newRegionStart = safeFrom - start; // buffer içi byte index
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < newRegionStart) {
    // Yeni bölgede tamamlanmış satır yok
    return { errors: [], offset: safeFrom };
  }

  const toolUses = new Map<string, ToolUseInfo>();
  if (newRegionStart > 0) {
    // Lookback: hatalar önceki turlarda zaten kaydedildi, sadece tool_use topla
    processTranscriptText(buf.subarray(0, newRegionStart).toString('utf-8'), toolUses, null);
  }

  const errors: ToolErrorRecord[] = [];
  processTranscriptText(buf.subarray(newRegionStart, lastNl + 1).toString('utf-8'), toolUses, errors);

  return { errors, offset: start + lastNl + 1 };
}

// ---------------------------------------------------------------------------
// HATA RAPORU sözleşmesi
// ---------------------------------------------------------------------------

const ERROR_REPORT_RE = /#{1,4}\s*(hata raporu|error report)/i;

/** Agent final mesajında hata raporu bölümü var mı? */
export function hasErrorReport(message: string): boolean {
  return ERROR_REPORT_RE.test(message || '');
}

/** decision:block reason metni — agent bunu okuyup raporu ekler */
export function buildErrorReportInstruction(errors: ToolErrorRecord[]): string {
  const list = errors
    .slice(0, 10)
    .map((e, i) => `${i + 1}. [${e.tool}] ${e.command.slice(0, 120) || '(no input)'} → ${e.classification}${e.exit_code !== null ? ` (exit ${e.exit_code})` : ''}`)
    .join('\n');
  const more = errors.length > 10 ? `\n...and ${errors.length - 10} more.` : '';

  return (
    `You encountered ${errors.length} tool error(s) during this task but your final message does not report them:\n` +
    `${list}${more}\n\n` +
    `Append a section titled "## HATA RAPORU" to your final message. For EACH error state:\n` +
    `- the command/tool that failed and the error\n` +
    `- what you did about it (fixed / workaround / skipped)\n` +
    `- whether this leaves the task INCOMPLETE or affects correctness\n` +
    `End with one line: "TASK STATUS: COMPLETE" or "TASK STATUS: PARTIAL — <what remains>". Be honest; a silent failure means the task is considered half-done and buggy.`
  );
}

// ---------------------------------------------------------------------------
// Ledger + skill-matrix + dashboard
// ---------------------------------------------------------------------------

const CANAVAR_DIR = join(homedir(), '.claude', 'canavar');
const LEDGER_PATH = join(CANAVAR_DIR, 'error-ledger.jsonl');
const MATRIX_PATH = join(CANAVAR_DIR, 'skill-matrix.json');

export function toLedgerEntries(
  errors: ToolErrorRecord[],
  ctx: ScanContext,
  source: string = 'subagent-scan'
): LedgerEntry[] {
  const now = new Date().toISOString();
  return errors.map((e) => ({
    ts: now,
    session: ctx.sessionId.slice(0, 8),
    agent_id: ctx.agentId,
    agent_type: ctx.agentType,
    error_type: e.classification,
    // Dashboard kartında görünen satır — komut başı buraya
    error_pattern: `${e.tool.toLowerCase()}-fail: ${e.command_head}`,
    detail: `[${e.tool}] ${e.command.slice(0, 160)} → ${e.error_text.slice(0, 200)}`,
    file: extractFilePath(e.error_text, e.command),
    lesson: lessonFor(e),
    tool: e.tool,
    command: e.command.slice(0, 200),
    command_head: e.command_head,
    source,
  }));
}

function extractFilePath(output: string, command: string): string {
  const m = (output + ' ' + command).match(/(?:\/|[A-Z]:\\)[\w\/.\\-]+\.\w+/);
  return m ? m[0].replace(/\\/g, '/') : 'unknown';
}

function lessonFor(e: ToolErrorRecord): string {
  switch (e.classification) {
    case 'command_not_found':
      return `'${e.command_head}' agent ortamında yok — spawn öncesi varlığını doğrula ya da alternatif kullan`;
    case 'permission_denied':
    case 'sandbox_block':
      return `'${e.command_head}' subagent sandbox'ında engelli — bu komutu parent'ta çalıştır`;
    case 'resource_conflict':
      return `'${e.command_head}' kaynak çakışması (port/lock) — paralel agent'lar aynı kaynağı kullanıyor olabilir`;
    case 'timeout':
      return `'${e.command_head}' timeout — uzun işler için run_in_background veya timeout artır`;
    case 'command_fail':
      return `'${e.command_head}' exit ${e.exit_code} ile fail — ${e.error_text.slice(0, 80)}`;
    default:
      return `${e.tool} hatası: ${e.error_text.slice(0, 80)}`;
  }
}

export function appendLedgerEntries(entries: LedgerEntry[], ledgerPath: string = LEDGER_PATH): void {
  if (entries.length === 0) return;
  try {
    const dir = dirname(ledgerPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const lines = entries.map((e) => JSON.stringify(e) + '\n').join('');
    appendFileSync(ledgerPath, lines);
  } catch {
    /* fail-silent */
  }
}

// --- skill-matrix ---

interface SkillStats { attempts: number; successes: number; rate: number }
interface AgentProfile {
  total_tasks: number;
  successes: number;
  failures: number;
  success_rate: number;
  skills: Record<string, SkillStats>;
  common_errors: string[];
  last_active: string;
  tool_errors?: number;
  failing_commands?: Record<string, number>;
  /** P1/P3 davranış metrikleri (stop-policy) */
  unverified_claims?: number;
  enforcement_evasions?: number;
  retry_storms?: number;
  compactions?: number;
}

export type AgentMetric = 'unverified_claims' | 'enforcement_evasions' | 'retry_storms' | 'compactions';
interface SkillMatrix { agents: Record<string, AgentProfile>; updated_at: string }

function loadMatrix(matrixPath: string): SkillMatrix {
  try {
    if (existsSync(matrixPath)) return JSON.parse(readFileSync(matrixPath, 'utf-8'));
  } catch { /* corrupt → reset */ }
  return { agents: {}, updated_at: '' };
}

function ensureProfile(matrix: SkillMatrix, agentType: string): AgentProfile {
  if (!matrix.agents[agentType]) {
    matrix.agents[agentType] = {
      total_tasks: 0, successes: 0, failures: 0, success_rate: 0,
      skills: {}, common_errors: [], last_active: '',
    };
  }
  return matrix.agents[agentType];
}

/** SubagentStart: spawn kaydı */
export function recordAgentStart(agentType: string, matrixPath: string = MATRIX_PATH): void {
  try {
    if (!existsSync(CANAVAR_DIR)) mkdirSync(CANAVAR_DIR, { recursive: true });
    const matrix = loadMatrix(matrixPath);
    const profile = ensureProfile(matrix, agentType);
    profile.last_active = new Date().toISOString();
    matrix.updated_at = profile.last_active;
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  } catch { /* fail-silent */ }
}

/**
 * SubagentStop: sonuç kaydı — hata varsa failure, yoksa success.
 *
 * OWNERSHIP: total_tasks/successes/failures sayaçlarının TEK sahibi bu fonksiyondur
 * (subagent-stop-learner üzerinden). canavar-skill-tracker.ts de aynı sayaçları
 * yazabilen recompute mantığı içerir ama Stop'a KAYITLI DEĞİL — yeniden aktive
 * edilecekse önce çift sayma çözülmeli (code review H1, 2026-06-04).
 */
export function recordAgentStop(
  agentType: string,
  errors: ToolErrorRecord[],
  matrixPath: string = MATRIX_PATH
): void {
  try {
    if (!existsSync(CANAVAR_DIR)) mkdirSync(CANAVAR_DIR, { recursive: true });
    const matrix = loadMatrix(matrixPath);
    const profile = ensureProfile(matrix, agentType);

    profile.total_tasks++;
    if (errors.length > 0) profile.failures++;
    else profile.successes++;
    profile.success_rate = Number((profile.successes / profile.total_tasks).toFixed(2));
    profile.last_active = new Date().toISOString();
    profile.tool_errors = (profile.tool_errors || 0) + errors.length;

    if (errors.length > 0) {
      profile.failing_commands = profile.failing_commands || {};
      for (const e of errors) {
        profile.failing_commands[e.command_head] = (profile.failing_commands[e.command_head] || 0) + 1;
      }
      for (const e of errors.slice(0, 3)) {
        const summary = `${e.command_head}: ${e.classification}`;
        if (!profile.common_errors.includes(summary)) {
          profile.common_errors.unshift(summary);
        }
      }
      profile.common_errors = profile.common_errors.slice(0, 10);
    }

    matrix.updated_at = new Date().toISOString();
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  } catch { /* fail-silent */ }
}

/** P1 davranış metriği artır (unverified_claims / enforcement_evasions / retry_storms) */
export function bumpAgentMetric(
  agentType: string,
  metric: AgentMetric,
  n: number = 1,
  matrixPath: string = MATRIX_PATH
): void {
  try {
    if (!existsSync(dirname(matrixPath))) mkdirSync(dirname(matrixPath), { recursive: true });
    const matrix = loadMatrix(matrixPath);
    const profile = ensureProfile(matrix, agentType);
    profile[metric] = (profile[metric] || 0) + n;
    matrix.updated_at = new Date().toISOString();
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  } catch { /* fail-silent */ }
}

// --- dashboard emit ---

export interface AgentErrorEvent {
  type: 'agent_error' | 'agent_complete' | 'agent_spawn';
  timestamp: string;
  sessionId: string;
  agentType: string;
  agentId: string;
  status: 'error' | 'done' | 'running';
  metadata: Record<string, unknown>;
}

/** Dashboard'a fire-and-forget event (dashboard kapalıysa sessizce geçer) */
export function emitDashboardEvent(event: AgentErrorEvent): Promise<void> {
  return new Promise((resolve) => {
    try {
      const postData = Buffer.from(JSON.stringify(event));
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 3847,
          path: '/event',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length },
          timeout: 400,
        },
        () => resolve()
      );
      req.on('error', () => resolve());
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.write(postData);
      req.end();
    } catch {
      resolve();
    }
  });
}

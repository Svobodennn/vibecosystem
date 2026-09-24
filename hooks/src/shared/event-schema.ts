/**
 * agent-events.jsonl iki farkli sema tasiyor:
 *   yeni (dashboard-ws-emitter): type / timestamp / sessionId / agentType / metadata{tool,...}
 *   eski (agent-observer):       event / ts / session / agent_type / tool / detail
 *
 * Tuketiciler (canavar-skill-tracker, session-analytics) yalniz eski semayi
 * okuyordu; yeni semadaki her satiri sessizce disladilar ve bu yuzden
 * session-analytics aylarca duration_ms=0 / tool_counts={} uretti.
 * Esleme tek yerde durur ki bir alan adi degisikligi tuketicileri bir daha kirmasin.
 */

export interface NormalizedEvent {
  ts: string;
  session: string;
  event: string;
  tool: string;
  detail: string;
  agentType: string;
  agentId: string;
}

const LIFECYCLE_EVENTS = new Set(['agent_spawn', 'agent_complete', 'agent_error']);

interface RawEventShape {
  ts?: unknown;
  timestamp?: unknown;
  session?: unknown;
  sessionId?: unknown;
  event?: unknown;
  type?: unknown;
  tool?: unknown;
  detail?: unknown;
  agent_type?: unknown;
  agentType?: unknown;
  agent_id?: unknown;
  agentId?: unknown;
  metadata?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Tek bir ham satiri normalize eder; taninmayan sekil icin null doner. */
export function normalizeEvent(raw: unknown): NormalizedEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as RawEventShape;
  const meta = (r.metadata && typeof r.metadata === 'object')
    ? r.metadata as Record<string, unknown>
    : {};

  const ts = asString(r.ts) || asString(r.timestamp);
  const session = asString(r.session) || asString(r.sessionId);
  const event = asString(r.event) || asString(r.type);

  // Ucunun de bos olmasi = bu satir bir event degil
  if (!ts && !session && !event) {
    return null;
  }

  return {
    ts,
    // Yazanlar zaten 8 karaktere kirpiyor; idempotent, tuketici filtresiyle hizali
    session: session.slice(0, 8),
    event,
    tool: asString(r.tool) || asString(meta.tool),
    detail: asString(r.detail)
      || asString(meta.command)
      || asString(meta.promptSummary)
      || asString(meta.source),
    agentType: asString(r.agent_type) || asString(r.agentType),
    agentId: asString(r.agent_id) || asString(r.agentId),
  };
}

export function normalizeEvents(rawList: unknown[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const raw of rawList) {
    const normalized = normalizeEvent(raw);
    if (normalized) {
      out.push(normalized);
    }
  }
  return out;
}

/**
 * Agent yasam dongusu event'i mi? Bunlar tool alani tasimaz, ama bir
 * subagent'in is yaptiginin tek kanitidir (tool_call satirlari agentType tasimaz).
 */
export function isLifecycleEvent(event: string): boolean {
  return LIFECYCLE_EVENTS.has(event);
}

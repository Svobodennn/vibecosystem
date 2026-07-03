/**
 * vibecosystem Dashboard Server
 * - WebSocket server (port 3847): Event broadcast + hook event alimi
 * - HTTP server (port 3848): Dashboard UI serve + REST API
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const WS_PORT = parseInt(process.env.DASHBOARD_WS_PORT, 10) || 3847;
const HTTP_PORT = parseInt(process.env.DASHBOARD_HTTP_PORT, 10) || 3848;
const CANAVAR_DIR = path.join(require('os').homedir(), '.claude', 'canavar');
const EVENTS_LOG = process.env.DASHBOARD_EVENTS_LOG || path.join(require('os').homedir(), '.claude', 'agent-events.jsonl');
const LEDGER_PATH = path.join(CANAVAR_DIR, 'error-ledger.jsonl');
const MATRIX_PATH = path.join(CANAVAR_DIR, 'skill-matrix.json');
const TOKEN_LOG = path.join(require('os').homedir(), '.claude', 'token-usage.jsonl');
const HOOK_PERF_LOG = path.join(require('os').homedir(), '.claude', 'cache', 'hook-perf.jsonl');

// In-memory event store (son 1000 event)
const eventStore = [];
const MAX_EVENTS = 1000;

// H9: Retry tracking — correlationId -> spawn count. Same correlationId across spawns
// means the same agent + session + prompt was retried. Only incremented for agent_spawn
// events (not complete/error) so retryCount = how many times this exact task was started.
// Map keys are sha256-truncated 16-char hex strings produced by dashboard-ws-emitter hook.
// Cap kept bounded: trimmed alongside eventStore.shift() to avoid unbounded growth in
// long-running processes. Counts are best-effort, not authoritative — server restarts
// reset them (acceptable: retry decisions are runtime-only signals).
const correlationCounts = {};

// Session stats
const sessionStats = {
  startTime: new Date().toISOString(),
  totalEvents: 0,
  agentSpawns: 0,
  agentCompletes: 0,
  agentErrors: 0,
  toolCalls: 0,
  hookFires: 0,
  agentDurations: [],
  byAgentType: {},
};

function addEvent(event) {
  // H9: Retry tracking BEFORE persistence so retryCount lands in eventStore + disk + WS broadcast
  // consistently. Only spawn events count as retries — complete/error of a single spawn are not
  // re-runs. Defensive: metadata may be missing or non-object on malformed events.
  if (event && event.type === 'agent_spawn' && event.metadata && typeof event.metadata === 'object') {
    const corrId = event.metadata.correlationId;
    if (typeof corrId === 'string' && corrId.length > 0) {
      correlationCounts[corrId] = (correlationCounts[corrId] || 0) + 1;
      event.metadata.retryCount = correlationCounts[corrId];
    }
  }

  eventStore.push(event);
  if (eventStore.length > MAX_EVENTS) {
    eventStore.shift();
  }

  // Persist to disk (fail-silent: disk error must not break WS broadcast)
  try {
    fs.appendFileSync(EVENTS_LOG, JSON.stringify(event) + '\n');
  } catch (err) {
    console.error(`[persist] Failed to append event to ${EVENTS_LOG}:`, err.message);
  }

  sessionStats.totalEvents++;

  switch (event.type) {
    case 'agent_spawn':
      sessionStats.agentSpawns++;
      break;
    case 'agent_complete':
      sessionStats.agentCompletes++;
      break;
    case 'agent_error':
      sessionStats.agentErrors++;
      break;
    case 'tool_call':
      sessionStats.toolCalls++;
      break;
    case 'hook_fire':
      sessionStats.hookFires++;
      break;
  }

  if (event.agentType) {
    if (!sessionStats.byAgentType[event.agentType]) {
      sessionStats.byAgentType[event.agentType] = {
        spawns: 0,
        completes: 0,
        errors: 0,
        totalDuration: 0,
      };
    }
    const agentStats = sessionStats.byAgentType[event.agentType];
    if (event.type === 'agent_spawn') agentStats.spawns++;
    if (event.type === 'agent_complete') agentStats.completes++;
    if (event.type === 'agent_error') agentStats.errors++;
    if (event.duration) {
      agentStats.totalDuration += event.duration;
      sessionStats.agentDurations.push(event.duration);
      if (sessionStats.agentDurations.length > 5000) {
        sessionStats.agentDurations = sessionStats.agentDurations.slice(-2500);
      }
    }
  }
}

function loadCanavarErrors() {
  try {
    if (!fs.existsSync(LEDGER_PATH)) return [];
    const lines = fs.readFileSync(LEDGER_PATH, 'utf-8').split('\n').filter(l => l.trim());
    const errors = [];
    for (const line of lines) {
      try { errors.push(JSON.parse(line)); } catch { /* skip */ }
    }
    // Son 50 hata
    return errors.slice(-50).reverse();
  } catch {
    return [];
  }
}

function loadSkillMatrix() {
  try {
    if (!fs.existsSync(MATRIX_PATH)) return { agents: {} };
    return JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf-8'));
  } catch {
    return { agents: {} };
  }
}

function loadRecentAgentEvents(limit = 100) {
  try {
    if (!fs.existsSync(EVENTS_LOG)) return [];
    const content = fs.readFileSync(EVENTS_LOG, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const events = [];
    for (const line of lines.slice(-limit)) {
      try { events.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return events.reverse();
  } catch {
    return [];
  }
}

function loadTokenUsage(limit = 200) {
  try {
    if (!fs.existsSync(TOKEN_LOG)) return { entries: [], summary: { total: 0, byTool: {}, byAgent: {} } };
    const lines = fs.readFileSync(TOKEN_LOG, 'utf-8').split('\n').filter(l => l.trim());
    const entries = [];
    const byTool = {};
    const byAgent = {};
    let total = 0;

    for (const line of lines.slice(-limit)) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
        total += entry.total_est || 0;
        byTool[entry.tool] = (byTool[entry.tool] || 0) + (entry.total_est || 0);
        if (entry.agent) {
          byAgent[entry.agent] = (byAgent[entry.agent] || 0) + (entry.total_est || 0);
        }
      } catch { /* skip */ }
    }

    return { entries: entries.slice(-50).reverse(), summary: { total, byTool, byAgent } };
  } catch {
    return { entries: [], summary: { total: 0, byTool: {}, byAgent: {} } };
  }
}

function estimateCosts() {
  // Rough cost estimates per 1K tokens (USD)
  const COSTS = {
    haiku: { input: 0.00025, output: 0.00125 },
    sonnet: { input: 0.003, output: 0.015 },
    opus: { input: 0.015, output: 0.075 },
  };

  const usage = loadTokenUsage(1000);
  const totalTokens = usage.summary.total;

  return {
    totalTokens,
    estimatedCost: {
      asHaiku: ((totalTokens / 1000) * COSTS.haiku.output).toFixed(4),
      asSonnet: ((totalTokens / 1000) * COSTS.sonnet.output).toFixed(4),
      asOpus: ((totalTokens / 1000) * COSTS.opus.output).toFixed(4),
    },
    byTool: usage.summary.byTool,
    byAgent: usage.summary.byAgent,
  };
}

/**
 * H3: Hook performance aggregator.
 * Reads last N entries from ~/.claude/cache/hook-perf.jsonl, computes
 * count/total/avg/p50/p95/p99 per hook, and returns a top-10 list sorted
 * by p95 latency. Fail-silent: returns empty struct if file missing or
 * unreadable so the endpoint never 500s.
 *
 * Performance target: <50ms for 500 entries (sync I/O acceptable).
 */
function loadHookPerf(limit = 500) {
  try {
    if (!fs.existsSync(HOOK_PERF_LOG)) {
      return { totalEntries: 0, byHook: {}, topSlow: [] };
    }
    const lines = fs.readFileSync(HOOK_PERF_LOG, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .slice(-limit);

    const byHookRaw = {};
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (!e.hook || typeof e.duration_ms !== 'number') continue;
        if (!byHookRaw[e.hook]) byHookRaw[e.hook] = { count: 0, durations: [] };
        byHookRaw[e.hook].count++;
        byHookRaw[e.hook].durations.push(e.duration_ms);
      } catch { /* skip malformed */ }
    }

    const byHook = {};
    for (const [hook, data] of Object.entries(byHookRaw)) {
      const sorted = data.durations.slice().sort((a, b) => a - b);
      const total = sorted.reduce((s, v) => s + v, 0);
      const len = sorted.length;
      byHook[hook] = {
        count: data.count,
        totalMs: +total.toFixed(2),
        avgMs: +(total / data.count).toFixed(2),
        // Percentile index: clamp to last element when ceil/floor would overflow
        p50Ms: sorted[Math.min(Math.floor(len * 0.5), len - 1)] || 0,
        p95Ms: sorted[Math.min(Math.floor(len * 0.95), len - 1)] || 0,
        p99Ms: sorted[Math.min(Math.floor(len * 0.99), len - 1)] || 0,
      };
    }

    const topSlow = Object.entries(byHook)
      .map(([hook, s]) => ({ hook, p95Ms: s.p95Ms, count: s.count }))
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, 10);

    return { totalEntries: lines.length, byHook, topSlow };
  } catch (err) {
    console.error('[hook-perf] load failed:', err.message);
    return { totalEntries: 0, byHook: {}, topSlow: [], error: err.message };
  }
}

function getStats() {
  const avgDuration = sessionStats.agentDurations.length > 0
    ? sessionStats.agentDurations.reduce((a, b) => a + b, 0) / sessionStats.agentDurations.length
    : 0;

  const errorRate = sessionStats.agentSpawns > 0
    ? ((sessionStats.agentErrors / sessionStats.agentSpawns) * 100).toFixed(1)
    : '0.0';

  // C2: Unique session count — eventStore'daki distinct sessionId'ler
  const activeSessions = new Set(
    eventStore.map(e => e.sessionId).filter(Boolean)
  ).size;

  return {
    ...sessionStats,
    avgDuration: Math.round(avgDuration),
    errorRate,
    activeSessions,
    uptime: Math.round((Date.now() - new Date(sessionStats.startTime).getTime()) / 1000),
  };
}

// P6: Rotate agent-events.jsonl if >= 10MB (startup-only — avoids race conditions at runtime)
function rotateEventsLog() {
  try {
    if (!fs.existsSync(EVENTS_LOG)) return;
    const stats = fs.statSync(EVENTS_LOG);
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (stats.size < MAX_SIZE) return;

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archive = `${EVENTS_LOG}.${ts}.bak`;
    fs.renameSync(EVENTS_LOG, archive);
    console.log(`[rotation] Archived ${EVENTS_LOG} → ${archive} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

    // Keep only the 3 most recent archives
    const dir = path.dirname(EVENTS_LOG);
    const base = path.basename(EVENTS_LOG);
    const archives = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '.') && f.endsWith('.bak'))
      .sort()
      .reverse();

    const toDelete = archives.slice(3);
    for (const old of toDelete) {
      try {
        fs.unlinkSync(path.join(dir, old));
        console.log(`[rotation] Deleted old archive: ${old}`);
      } catch (err) {
        console.error(`[rotation] Failed to delete ${old}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[rotation] Failed:', err.message);
  }
}

rotateEventsLog();

// Hydrate eventStore from disk (last MAX_EVENTS) — survives restarts
// loadRecentAgentEvents returns newest-first; reverse to chronological for eventStore order
try {
  const hydrated = loadRecentAgentEvents(MAX_EVENTS);
  if (hydrated.length > 0) {
    eventStore.push(...hydrated.slice().reverse());
    // H9: Rebuild correlationCounts from hydrated spawns so post-restart retry numbering
    // continues from the highest observed retryCount per correlationId. Without this, a
    // 3rd-retry spawn after restart would report retryCount=1 (wrong, escalation hidden).
    for (const e of eventStore) {
      if (e && e.type === 'agent_spawn' && e.metadata && typeof e.metadata === 'object') {
        const corrId = e.metadata.correlationId;
        if (typeof corrId === 'string' && corrId.length > 0) {
          // Prefer persisted retryCount if present (set by previous server addEvent); fall back to
          // counting occurrences which also yields the right number after a full replay.
          const persisted = typeof e.metadata.retryCount === 'number' ? e.metadata.retryCount : null;
          if (persisted !== null) {
            if (persisted > (correlationCounts[corrId] || 0)) correlationCounts[corrId] = persisted;
          } else {
            correlationCounts[corrId] = (correlationCounts[corrId] || 0) + 1;
          }
        }
      }
    }
    console.log(`[persist] Hydrated ${hydrated.length} event(s) from ${EVENTS_LOG}`);
  } else {
    console.log(`[persist] No prior events to hydrate (${EVENTS_LOG} empty or missing)`);
  }
} catch (err) {
  console.error(`[persist] Hydration failed:`, err.message);
}

// === WebSocket Server (port 3847) ===
// Hem WS client'lari dinler, hem HTTP POST ile event alir
const wsHttpServer = http.createServer((req, res) => {
  // Hook'lardan gelen event'leri al
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    let bodySize = 0;
    const MAX_BODY = 64 * 1024; // 64KB limit
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end('{"error":"payload too large"}');
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        addEvent(event);
        // Tum WS client'lara broadcast et
        wss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify(event));
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400);
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server: wsHttpServer });

wss.on('connection', (ws) => {
  console.log(`[WS] Client connected (total: ${wss.clients.size})`);

  // Baglanan client'a mevcut event'leri gonder
  ws.send(JSON.stringify({
    type: 'init',
    timestamp: new Date().toISOString(),
    events: eventStore.slice(-50),
    stats: getStats(),
  }));

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (total: ${wss.clients.size})`);
  });
});

wsHttpServer.listen(WS_PORT, '127.0.0.1', () => {
  console.log(`[WS] WebSocket + Event receiver on ws://127.0.0.1:${WS_PORT}`);
});

// === HTTP Server (port 3848) ===
const httpServer = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3848');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // REST API
  if (req.url === '/api/errors') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadCanavarErrors()));
    return;
  }

  if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStats()));
    return;
  }

  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(eventStore.slice(-100)));
    return;
  }

  if (req.url === '/api/matrix') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadSkillMatrix()));
    return;
  }

  if (req.url === '/api/agent-events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadRecentAgentEvents()));
    return;
  }

  if (req.url === '/api/tokens') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadTokenUsage()));
    return;
  }

  if (req.url === '/api/costs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(estimateCosts()));
    return;
  }

  // H3: Hook performance metrics — aggregated p50/p95/p99 per hook from cache file.
  if (req.url === '/api/hook-perf') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadHookPerf()));
    return;
  }

  // P4: Self-stats — dashboard process health (memory, uptime, WS clients, store sizes)
  if (req.url === '/api/self-stats') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      uptime: Math.round(process.uptime()),
      wsClients: wss.clients.size,
      heapUsedMb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
      eventStoreSize: eventStore.length,
      correlationCacheSize: Object.keys(correlationCounts || {}).length,
    }));
    return;
  }

  // H6: Session export — returns all events for a given session as downloadable JSON.
  if (req.url.startsWith('/api/export')) {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const sessionId = u.searchParams.get('session');

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'session parameter required' }));
      return;
    }

    const events = eventStore.filter(e =>
      e.sessionId && e.sessionId.startsWith(sessionId.slice(0, 8))
    );

    if (events.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'session not found' }));
      return;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${sessionId.slice(0, 8)}-${ts}.json`;

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(JSON.stringify({
      session: sessionId.slice(0, 8),
      count: events.length,
      exportedAt: new Date().toISOString(),
      events,
    }, null, 2));
    return;
  }

  // Static files
  if (req.url === '/' || req.url === '/index.html') {
    const htmlPath = path.join(__dirname, 'index.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end('index.html not found');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[HTTP] Dashboard UI on http://127.0.0.1:${HTTP_PORT}`);
  console.log(`[vibecosystem] Agent Monitoring Dashboard v2.0 ready`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[vibecosystem] Shutting down...');
  wss.close();
  wsHttpServer.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  wss.close();
  wsHttpServer.close();
  httpServer.close();
  process.exit(0);
});

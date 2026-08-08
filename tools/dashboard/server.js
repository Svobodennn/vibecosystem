/**
 * vibecosystem Dashboard Server
 * - WebSocket server (port 3847): Event broadcast + hook event alimi
 * - HTTP server (port 3848): Dashboard UI serve + REST API
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const WS_PORT = 3847;
const HTTP_PORT = 3848;
const CANAVAR_DIR = path.join(require('os').homedir(), '.claude', 'canavar');
const EVENTS_LOG = path.join(require('os').homedir(), '.claude', 'agent-events.jsonl');
const LEDGER_PATH = path.join(CANAVAR_DIR, 'error-ledger.jsonl');
const MATRIX_PATH = path.join(CANAVAR_DIR, 'skill-matrix.json');
const TOKEN_LOG = path.join(require('os').homedir(), '.claude', 'token-usage.jsonl');

// In-memory event store (son 1000 event)
const eventStore = [];
const MAX_EVENTS = 1000;

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
  eventStore.push(event);
  if (eventStore.length > MAX_EVENTS) {
    eventStore.shift();
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
    if (!fs.existsSync(TOKEN_LOG)) return { entries: [], summary: { total: 0, byTool: {}, byAgent: {}, sources: {} } };
    const lines = fs.readFileSync(TOKEN_LOG, 'utf-8').split('\n').filter(l => l.trim());
    const entries = [];
    const byTool = {};
    const byAgent = {};
    const sources = {};
    let total = 0;

    for (const line of lines.slice(-limit)) {
      try {
        const entry = JSON.parse(line);
        const legacyChars = Number(entry.total_chars);
        const totalTokens = Number.isFinite(Number(entry.total_tokens_est))
          ? Number(entry.total_tokens_est)
          : Number.isFinite(Number(entry.total_est))
            ? Number(entry.total_est)
            : Number.isFinite(legacyChars)
              ? Math.ceil(legacyChars / 4)
              : 0;
        const source = entry.token_source || (entry.total_est != null ? 'legacy-estimate' : 'legacy-chars-estimate');
        const normalized = { ...entry, total_tokens_est: totalTokens, token_source: source };
        entries.push(normalized);
        total += totalTokens;
        byTool[entry.tool] = (byTool[entry.tool] || 0) + totalTokens;
        if (entry.agent) {
          byAgent[entry.agent] = (byAgent[entry.agent] || 0) + totalTokens;
        }
        sources[source] = (sources[source] || 0) + 1;
      } catch { /* skip */ }
    }

    return { entries: entries.slice(-50).reverse(), summary: { total, byTool, byAgent, sources } };
  } catch {
    return { entries: [], summary: { total: 0, byTool: {}, byAgent: {}, sources: {} } };
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

function getStats() {
  const avgDuration = sessionStats.agentDurations.length > 0
    ? sessionStats.agentDurations.reduce((a, b) => a + b, 0) / sessionStats.agentDurations.length
    : 0;

  const errorRate = sessionStats.agentSpawns > 0
    ? ((sessionStats.agentErrors / sessionStats.agentSpawns) * 100).toFixed(1)
    : '0.0';

  return {
    ...sessionStats,
    avgDuration: Math.round(avgDuration),
    errorRate,
    uptime: Math.round((Date.now() - new Date(sessionStats.startTime).getTime()) / 1000),
  };
}

// === WebSocket Server (port 3847) ===
// Hem WS client'lari dinler, hem HTTP POST ile event alir
const wsHttpServer = http.createServer((req, res) => {
  // Hook'lardan gelen event'leri al
  if (req.method === 'POST' && req.url === '/event') {
    // DNS rebinding korumasi: sadece localhost Host header'i kabul et,
    // tarayici kaynakli (Origin'li) istekleri reddet - hook'lar Origin gondermez
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (!allowedHosts.has(host) || req.headers.origin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"forbidden"}');
      return;
    }
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

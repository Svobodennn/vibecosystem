# vibecosystem Agent Monitoring Dashboard v2.1.0

Real-time agent monitoring dashboard for vibecosystem. Tracks agent spawns/completes/errors, tool calls, hook performance, token usage, and Canavar error ledger across parallel Claude Code sessions.

## Setup

```bash
cd ~/.claude/tools/dashboard
npm install
npm start
```

Optional env overrides (for testing or custom deployments):
```bash
DASHBOARD_WS_PORT=3847       # WebSocket + event ingestion port
DASHBOARD_HTTP_PORT=3848     # Dashboard UI + REST API port
DASHBOARD_EVENTS_LOG=path    # Persistence path (default: ~/.claude/agent-events.jsonl)
```

## Access

- Dashboard UI: http://localhost:3848
- WebSocket + Event API: ws://localhost:3847

## Architecture

```
Claude Code Hooks (PostToolUse)
  ├── dashboard-ws-emitter.mjs   → POST /event  (fire-and-forget)
  └── token-logger.mjs           → ~/.claude/token-usage.jsonl
       │
       v
dashboard server.js (port 3847 WS + ingestion, 3848 UI + REST)
       │
       ├── eventStore (in-memory ring, 1000 cap)
       ├── ~/.claude/agent-events.jsonl (persistent, 10MB rotation, 3-archive limit)
       ├── correlationCounts (synthetic retry tracking)
       └── WebSocket broadcast
       │
       v
index.html (vanilla JS + Tailwind CDN, zero deps)
       │
       └── fetch /api/* + WebSocket subscribe

Data sources read by server:
  ~/.claude/canavar/error-ledger.jsonl
  ~/.claude/canavar/skill-matrix.json   (optional, empty state if missing)
  ~/.claude/cache/hook-perf.jsonl
  ~/.claude/token-usage.jsonl
```

## Hook Integration

Two PostToolUse hooks feed the dashboard:

**1. `dashboard-ws-emitter`** — emits spawn/complete/error events per Agent/Task/Bash invocation. Fire-and-forget HTTP POST to localhost:3847. Silent skip if dashboard down.

**2. `token-logger`** — appends per-tool-call token estimates (char/4 heuristic) to `~/.claude/token-usage.jsonl`.

Sources: `~/.claude/hooks/src/{dashboard-ws-emitter,token-logger}.ts`
Compiled: `~/.claude/hooks/dist/{dashboard-ws-emitter,token-logger}.mjs`

Register in `~/.claude/settings.json` under `hooks.PostToolUse`:

```json
{
  "matcher": "",
  "hooks": [
    { "type": "command", "command": "node ~/.claude/hooks/dist/dashboard-ws-emitter.mjs" },
    { "type": "command", "command": "node ~/.claude/hooks/dist/token-logger.mjs" }
  ]
}
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/errors` | Last 50 Canavar error ledger entries |
| `GET /api/stats` | Session stats + `activeSessions` count |
| `GET /api/events` | Last 100 in-memory events (hydrated from disk on startup) |
| `GET /api/matrix` | Canavar skill matrix (success rates per agent) |
| `GET /api/agent-events` | `agent-events.jsonl` last 100 entries |
| `GET /api/tokens` | Token usage by tool/agent + total |
| `GET /api/costs` | USD cost estimate (haiku/sonnet/opus pricing) |
| `GET /api/hook-perf` | Hook latency stats — p50/p95/p99 per hook + top 10 slow |
| `GET /api/export?session=<id>` | Download session events as JSON (Content-Disposition) |
| `GET /api/self-stats` | Dashboard self health — uptime, WS clients, heap, eventStore size |
| `POST /event` (port 3847) | Hook event ingestion |

## Features

### Event Tracking
- **Agent Timeline** — chronological per-agent spawn/complete/error bars
- **Live Feed** — real-time event stream with All/Agents/Errors tabs
- **Click-to-expand** — feed item shows full metadata + error context (XSS-safe `textContent`)
- **Search** — substring filter across agent type, prompt summary, tool name
- **Session filter** — isolate events from a specific Claude session (8-char prefix)
- **Agent filter** — filter by agent type
- **Pause/Resume** — freeze live feed updates

### Analytics
- **Stats bar** — SPAWNS, COMPLETE, ERRORS, TOOLS, AVG DURATION, ERROR RATE, TOKENS, SESSIONS
- **Sparklines** — inline SVG trends (60-bucket per-minute): spawn rate, error rate, token burn
- **Token Burn panel** — total tokens + top 5 agents + USD cost estimate
- **Agent Health panel** — success rate % from Canavar skill-matrix (color-coded: >90% green, 70-90% yellow, <70% red)
- **Hook Performance panel** — top 10 slowest hooks by p95Ms
- **Canavar Error panel** — recent error ledger entries

### Reliability
- **Auto-reconnect** — exponential backoff WebSocket reconnect (1s → 30s cap)
- **Connection status** — header badge: `CONNECTED` / `Disconnected (retry Xs)`
- **Stuck agent detection** — alerts when an agent exceeds p95 × 2 (yellow) or p95 × 4 (red); browser notification with permission gate
- **Retry tracking** — synthetic correlation (sha256 of agentType+session+promptHash) detects retries; badge `↻N` (yellow at 2, red+pulse at 3+)
- **Sub-agent hierarchy** — future-proof tree timeline (activates when Claude Code propagates `CLAUDE_PARENT_AGENT_ID`)

### Persistence
- **Event log** — all events appended to `~/.claude/agent-events.jsonl`
- **Restart hydration** — eventStore restored from disk on server startup
- **Log rotation** — automatic archive at 10MB, last 3 `.bak` files kept

### UX
- **Mobile responsive** — Tailwind `md:`/`lg:` breakpoints, single-column stack on phones
- **Accessibility** — ARIA labels, `role="log"` + `aria-live="polite"` on feed, keyboard navigation (Tab + Enter/Space), `:focus-visible` outlines
- **Background notification** — tab title `(N)` counter + canvas favicon red badge when errors arrive while tab hidden
- **Self-stats footer** — live dashboard health (uptime, WS clients, heap, event count)
- **Export** — download a session's full event history as JSON

## Version History

- **v2.1.0** (2026-05-15) — IMPROVEMENT_PLAN sprint complete (18 items, 9 commits). Added persistence, session/search/agent filtering, 6 new panels, hook-perf/token tracking, sparklines, retry detection, accessibility, mobile, jsonl rotation.
- **v2.0** — Initial agent monitor with timeline, live feed, basic stats.

## Plan & Documentation

- `docs/IMPROVEMENT_PLAN.completed.md` — completed improvement plan (18 items shipped)
- `SPRINT_*_HANDOFF.md` — per-sprint handoff docs with line refs, smoke results, rollback
- `test-*-smoke.sh` — per-feature smoke test scripts

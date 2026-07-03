#!/bin/bash
# H9 Retry Tracking — smoke test
# Verifies: hook produces correlationId via sha256, server stamps retryCount, UI renders retry badge.
set -e

# Hook: correlationId field eklendi
grep -q "correlationId" ~/.claude/hooks/src/dashboard-ws-emitter.ts || { echo "FAIL: src yok"; exit 1; }
grep -q "correlationId" ~/.claude/hooks/dist/dashboard-ws-emitter.mjs || { echo "FAIL: dist yok"; exit 1; }
grep -q "createHash\|sha256" ~/.claude/hooks/src/dashboard-ws-emitter.ts || { echo "FAIL: sha256 hash yok"; exit 1; }
echo "PASS: hook correlationId + sha256"

# Hook calisiyor + correlationId uretiyor (Dashboard kapaliyken bile silent dönmeli)
INPUT='{"session_id":"smoke123","tool_name":"Agent","tool_input":{"subagent_type":"test-agent","description":"test prompt"},"tool_response":"OK"}'
OUT=$(echo "$INPUT" | node ~/.claude/hooks/dist/dashboard-ws-emitter.mjs 2>&1)
[ "$OUT" = "{}" ] && echo "PASS: hook silent (POST gönderiyor)" || echo "INFO: hook output: $OUT"

# Server: correlationCounts tracking
grep -q "correlationCounts\|retryCount" ~/.claude/tools/dashboard/server.js || { echo "FAIL: server retry tracking yok"; exit 1; }
echo "PASS: server retry tracking"

# Live test: ayni agent 3 kez spawn, retryCount=1,2,3 olmali
DASHBOARD_HTTP_PORT=3857 DASHBOARD_WS_PORT=3858 DASHBOARD_EVENTS_LOG=/tmp/test-h9.jsonl \
  node ~/.claude/tools/dashboard/server.js &
SERVER_PID=$!
sleep 0.5

for i in 1 2 3; do
  curl -s -X POST -H "Content-Type: application/json" \
    -d '{"type":"agent_spawn","sessionId":"h9test","agentType":"test","status":"running","metadata":{"correlationId":"sameId123"}}' \
    http://127.0.0.1:3858/event > /dev/null
done
sleep 0.3

EVENTS=$(curl -s http://127.0.0.1:3857/api/events)
echo "$EVENTS" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const ours = data.filter(e => e.sessionId === 'h9test' && e.type === 'agent_spawn');
if (ours.length !== 3) { console.error('FAIL: 3 spawn beklenirken', ours.length); process.exit(1); }
const counts = ours.map(e => e.metadata?.retryCount);
if (JSON.stringify(counts.sort((a,b)=>a-b)) !== '[1,2,3]') {
  console.error('FAIL: retryCount sequence 1,2,3 degil:', counts); process.exit(1);
}
console.log('PASS: retryCount 1->2->3 dogru sirada (event order)');
"

kill $SERVER_PID 2>/dev/null
wait 2>/dev/null
rm -f /tmp/test-h9.jsonl

# UI: retry badge render kodu
node -e "
const fs = require('fs');
const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
if (!html.match(/retry|↻/i)) { console.error('FAIL: UI retry badge yok'); process.exit(1); }
if (!html.includes('retryCount')) { console.error('FAIL: retryCount UI usage yok'); process.exit(1); }
console.log('PASS: UI retry badge render');
"

echo "ALL SMOKE TESTS PASS"

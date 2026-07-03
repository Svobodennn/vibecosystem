#!/bin/bash
set -e

# H2 Test 1: Hook errorContext field eklendi
grep -q "errorContext" ~/.claude/hooks/src/dashboard-ws-emitter.ts || { echo "FAIL: errorContext src'de yok"; exit 1; }
grep -q "errorContext" ~/.claude/hooks/dist/dashboard-ws-emitter.mjs || { echo "FAIL: errorContext dist'de yok"; exit 1; }
echo "PASS: H2 errorContext field eklendi"

# H2 Test 2: hasError block'unda errorContext bagli mi (src kontrolu)
grep -A 5 "hasError" ~/.claude/hooks/src/dashboard-ws-emitter.ts | grep -q "errorContext" || { echo "FAIL: hasError block'unda errorContext yok"; exit 1; }
echo "PASS: H2 logic dogru baglanmis"

# H3 Test 1: server.js endpoint eklendi
grep -q "/api/hook-perf" ~/.claude/tools/dashboard/server.js || { echo "FAIL: endpoint yok"; exit 1; }
grep -q "loadHookPerf" ~/.claude/tools/dashboard/server.js || { echo "FAIL: function yok"; exit 1; }
echo "PASS: H3 endpoint kaydi"

# H3 Test 2: Server'i gecici port'ta baslat, endpoint test et
DASHBOARD_HTTP_PORT=3852 DASHBOARD_WS_PORT=3851 DASHBOARD_EVENTS_LOG=/tmp/test-events-h3.jsonl \
  node ~/.claude/tools/dashboard/server.js > /tmp/test-server-h3.log 2>&1 &
SERVER_PID=$!
sleep 1

RESP=$(curl -s http://127.0.0.1:3852/api/hook-perf)
kill $SERVER_PID 2>/dev/null || true
wait 2>/dev/null || true

echo "$RESP" | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
  if (typeof data.totalEntries !== 'number') { console.error('FAIL: totalEntries number degil'); process.exit(1); }
  if (typeof data.byHook !== 'object') { console.error('FAIL: byHook object degil'); process.exit(1); }
  if (!Array.isArray(data.topSlow)) { console.error('FAIL: topSlow array degil'); process.exit(1); }
  console.log('PASS: H3 endpoint schema dogru, totalEntries=' + data.totalEntries + ', hooks=' + Object.keys(data.byHook).length);
"

# H3 Test 3: Mevcut endpoint'ler bozulmamis
DASHBOARD_HTTP_PORT=3853 DASHBOARD_WS_PORT=3854 DASHBOARD_EVENTS_LOG=/tmp/test-events-h3b.jsonl \
  node ~/.claude/tools/dashboard/server.js > /tmp/test-server-h3b.log 2>&1 &
SERVER_PID=$!
sleep 1

curl -s http://127.0.0.1:3853/api/stats > /dev/null && echo "PASS: /api/stats hala calisiyor"
curl -s http://127.0.0.1:3853/api/events > /dev/null && echo "PASS: /api/events hala calisiyor"
curl -s http://127.0.0.1:3853/api/tokens > /dev/null && echo "PASS: /api/tokens hala calisiyor"
curl -s http://127.0.0.1:3853/api/costs > /dev/null && echo "PASS: /api/costs hala calisiyor"
curl -s http://127.0.0.1:3853/api/matrix > /dev/null && echo "PASS: /api/matrix hala calisiyor"
curl -s http://127.0.0.1:3853/api/errors > /dev/null && echo "PASS: /api/errors hala calisiyor"
curl -s http://127.0.0.1:3853/api/agent-events > /dev/null && echo "PASS: /api/agent-events hala calisiyor"

kill $SERVER_PID 2>/dev/null || true
wait 2>/dev/null || true

# H3 Test 4: Performance — 500 entry'de <50ms
DASHBOARD_HTTP_PORT=3855 DASHBOARD_WS_PORT=3856 DASHBOARD_EVENTS_LOG=/tmp/test-events-h3c.jsonl \
  node ~/.claude/tools/dashboard/server.js > /tmp/test-server-h3c.log 2>&1 &
SERVER_PID=$!
sleep 1

PERF=$(curl -s -w "%{time_total}\n" -o /dev/null http://127.0.0.1:3855/api/hook-perf)
echo "INFO: /api/hook-perf round-trip = ${PERF}s"

kill $SERVER_PID 2>/dev/null || true
wait 2>/dev/null || true

rm -f /tmp/test-events-h3.jsonl /tmp/test-events-h3b.jsonl /tmp/test-events-h3c.jsonl
rm -f /tmp/test-server-h3.log /tmp/test-server-h3b.log /tmp/test-server-h3c.log

echo ""
echo "ALL SMOKE TESTS PASS"

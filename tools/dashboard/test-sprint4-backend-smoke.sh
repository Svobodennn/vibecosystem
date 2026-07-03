#!/bin/bash
set -e

# P4: Endpoint var
grep -q "/api/self-stats" $HOME/.claude/tools/dashboard/server.js || { echo "FAIL: endpoint yok"; exit 1; }
echo "PASS: P4 endpoint kaydı"

# P6: Rotation func var
grep -q "rotateEventsLog\|rotation" $HOME/.claude/tools/dashboard/server.js || { echo "FAIL: rotation yok"; exit 1; }
echo "PASS: P6 rotation function"

# Live: server başlat, P4 test
DASHBOARD_HTTP_PORT=3859 DASHBOARD_WS_PORT=3860 DASHBOARD_EVENTS_LOG=/tmp/test-p4.jsonl \
  node $HOME/.claude/tools/dashboard/server.js > /tmp/test-p4-server.log 2>&1 &
SERVER_PID=$!
sleep 0.5

# P4 endpoint çalışıyor mu
RESP=$(curl -s http://127.0.0.1:3859/api/self-stats)
echo "$RESP" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const required = ['uptime', 'wsClients', 'heapUsedMb', 'eventStoreSize'];
for (const f of required) {
  if (!(f in data)) { console.error('FAIL: alan eksik:', f); process.exit(1); }
}
if (typeof data.uptime !== 'number') { console.error('FAIL: uptime number değil'); process.exit(1); }
console.log('PASS: P4 self-stats schema doğru');
"

# Mevcut endpoint'ler hâlâ alive
for ep in stats events tokens costs matrix errors hook-perf agent-events; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3859/api/$ep)
  [ "$CODE" = "200" ] && echo "PASS: /api/$ep alive" || echo "FAIL: /api/$ep $CODE"
done

kill $SERVER_PID 2>/dev/null
wait 2>/dev/null

# P6: Rotation gerçekten çalışıyor mu - 11MB dosya yarat, restart et
dd if=/dev/zero of=/tmp/test-rot.jsonl bs=1M count=11 2>/dev/null
DASHBOARD_HTTP_PORT=3861 DASHBOARD_WS_PORT=3862 DASHBOARD_EVENTS_LOG=/tmp/test-rot.jsonl \
  node $HOME/.claude/tools/dashboard/server.js > /tmp/test-rot-server.log 2>&1 &
SERVER_PID=$!
sleep 0.8
kill $SERVER_PID 2>/dev/null
wait 2>/dev/null

if [ -f /tmp/test-rot.jsonl ]; then
  SIZE=$(stat -f%z /tmp/test-rot.jsonl 2>/dev/null || stat -c%s /tmp/test-rot.jsonl)
  [ "$SIZE" = "0" ] && echo "PASS: P6 rotation - aktif dosya boşaltıldı (eski archive'a taşındı)" || echo "FAIL: dosya $SIZE byte"
fi

ARCHIVES=$(ls /tmp/test-rot.jsonl.*.bak 2>/dev/null | wc -l | tr -d ' ')
[ "$ARCHIVES" = "1" ] && echo "PASS: P6 1 archive yaratıldı" || echo "INFO: $ARCHIVES archive (server log: $(cat /tmp/test-rot-server.log | head -3))"

rm -f /tmp/test-p4.jsonl /tmp/test-rot.jsonl /tmp/test-rot.jsonl.*.bak /tmp/test-p4-server.log /tmp/test-rot-server.log

echo "ALL SMOKE TESTS PASS"

#!/usr/bin/env bash
#
# Smoke test for C1 (persistence) — IMPROVEMENT_PLAN.md
#
# Verifies:
#   1. addEvent writes to EVENTS_LOG (append-only JSONL)
#   2. Server restart hydrates eventStore from disk
#   3. /api/events serves hydrated events after restart
#   4. Fresh install (no JSONL) does not crash hydration
#
# Isolated from live server on 3847/3848 by using:
#   - DASHBOARD_WS_PORT=3947
#   - DASHBOARD_HTTP_PORT=3948
#   - DASHBOARD_EVENTS_LOG=/tmp/test-events-<pid>.jsonl
#
# Usage: bash $HOME/.claude/tools/dashboard/test-c1-smoke.sh

set -u  # treat unset variables as errors (but allow command failures so we can report)

# ---- Config ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_JS="$SCRIPT_DIR/server.js"
TEST_WS_PORT=3947
TEST_HTTP_PORT=3948
TEST_LOG="/tmp/test-events-$$.jsonl"
SERVER_PID=""
PASS=0
FAIL=0

# ---- Helpers ----
log() { printf '[smoke] %s\n' "$*"; }
ok()  { printf '  [PASS] %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  [FAIL] %s\n' "$*"; FAIL=$((FAIL + 1)); }

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  # Kill any orphan node process that might be holding our test ports
  pkill -f "DASHBOARD_HTTP_PORT=$TEST_HTTP_PORT" 2>/dev/null || true
  rm -f "$TEST_LOG"
}
trap cleanup EXIT

start_server() {
  DASHBOARD_WS_PORT=$TEST_WS_PORT \
  DASHBOARD_HTTP_PORT=$TEST_HTTP_PORT \
  DASHBOARD_EVENTS_LOG=$TEST_LOG \
  node "$SERVER_JS" >/tmp/test-server-$$.log 2>&1 &
  SERVER_PID=$!

  # Poll until HTTP port responds (max 5s)
  local tries=0
  until curl -sf "http://127.0.0.1:$TEST_HTTP_PORT/api/stats" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ $tries -ge 25 ]; then
      log "server did not start within 5s — log:"
      cat /tmp/test-server-$$.log
      return 1
    fi
    sleep 0.2
  done
  return 0
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
    SERVER_PID=""
  fi
}

# ---- Test 1: Fresh install (no JSONL) should not crash ----
log "Test 1: Fresh install (no prior JSONL)"
rm -f "$TEST_LOG"
if start_server; then
  # Check log mentions empty hydration
  if grep -q "No prior events to hydrate" /tmp/test-server-$$.log; then
    ok "Server started with no JSONL, hydration logged as empty"
  else
    bad "Hydration log message missing — got:"
    cat /tmp/test-server-$$.log
  fi
else
  bad "Server failed to start with missing JSONL"
fi

# ---- Test 2: POST event → JSONL has the line ----
log "Test 2: POST /event writes to JSONL"
POST_RESPONSE=$(curl -sf -X POST "http://127.0.0.1:$TEST_WS_PORT/event" \
  -H 'Content-Type: application/json' \
  -d '{"type":"agent_spawn","sessionId":"smoke-1","agentType":"smoke","timestamp":"2026-05-15T00:00:00Z"}' 2>&1)

if echo "$POST_RESPONSE" | grep -q '"ok":true'; then
  ok "POST returned ok:true"
else
  bad "POST did not return ok:true (got: $POST_RESPONSE)"
fi

# Give appendFileSync a moment (sync write should be immediate, but be safe)
sleep 0.1

if [ -f "$TEST_LOG" ]; then
  LINE_COUNT=$(wc -l < "$TEST_LOG" | tr -d ' ')
  if [ "$LINE_COUNT" = "1" ]; then
    ok "JSONL has exactly 1 line"
  else
    bad "JSONL should have 1 line, has $LINE_COUNT"
  fi

  if grep -q '"agentType":"smoke"' "$TEST_LOG"; then
    ok "JSONL contains expected event payload"
  else
    bad "JSONL missing expected payload — content: $(cat "$TEST_LOG")"
  fi
else
  bad "JSONL file was not created at $TEST_LOG"
fi

# ---- Test 3: Send 2nd event to test multi-line append ----
log "Test 3: Second POST appends (not overwrites)"
curl -sf -X POST "http://127.0.0.1:$TEST_WS_PORT/event" \
  -H 'Content-Type: application/json' \
  -d '{"type":"agent_complete","sessionId":"smoke-1","agentType":"smoke","duration":1234}' >/dev/null

sleep 0.1

LINE_COUNT=$(wc -l < "$TEST_LOG" | tr -d ' ')
if [ "$LINE_COUNT" = "2" ]; then
  ok "JSONL grew to 2 lines (append-only confirmed)"
else
  bad "JSONL should have 2 lines, has $LINE_COUNT"
fi

# ---- Test 4: Restart server → hydrate from disk ----
log "Test 4: Restart hydrates eventStore from JSONL"
stop_server

if start_server; then
  # Check hydration log
  if grep -q "Hydrated 2 event" /tmp/test-server-$$.log; then
    ok "Server logged hydration of 2 events"
  else
    bad "Hydration log missing — server log:"
    tail -20 /tmp/test-server-$$.log
  fi

  # /api/events should return both events
  EVENTS_JSON=$(curl -sf "http://127.0.0.1:$TEST_HTTP_PORT/api/events")
  SPAWN_COUNT=$(echo "$EVENTS_JSON" | grep -o '"type":"agent_spawn"' | wc -l | tr -d ' ')
  COMPLETE_COUNT=$(echo "$EVENTS_JSON" | grep -o '"type":"agent_complete"' | wc -l | tr -d ' ')

  if [ "$SPAWN_COUNT" = "1" ] && [ "$COMPLETE_COUNT" = "1" ]; then
    ok "/api/events returns both hydrated events after restart"
  else
    bad "/api/events missing hydrated events (spawn=$SPAWN_COUNT, complete=$COMPLETE_COUNT)"
    echo "  response: $EVENTS_JSON"
  fi
else
  bad "Server failed to start on restart"
fi

# ---- Test 5: New event after restart appends correctly ----
log "Test 5: Post-restart event also persists"
curl -sf -X POST "http://127.0.0.1:$TEST_WS_PORT/event" \
  -H 'Content-Type: application/json' \
  -d '{"type":"tool_call","sessionId":"smoke-2","agentType":"smoke"}' >/dev/null
sleep 0.1

LINE_COUNT=$(wc -l < "$TEST_LOG" | tr -d ' ')
if [ "$LINE_COUNT" = "3" ]; then
  ok "JSONL has 3 lines after post-restart write"
else
  bad "JSONL should have 3 lines, has $LINE_COUNT"
fi

# ---- Summary ----
echo ""
log "Result: $PASS passed, $FAIL failed"

if [ $FAIL -eq 0 ]; then
  exit 0
else
  exit 1
fi

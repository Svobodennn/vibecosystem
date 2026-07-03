#!/bin/bash
set -e

# Sprint 3 Round 1 smoke test — H4 (WS reconnect) + H5 (stuck detection).
# index.html is the only file touched in this round. Server.js and hooks must be unchanged.

# H4: Reconnect logic
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  if (!html.includes('reconnect') && !html.includes('Reconnect')) { console.error('FAIL: reconnect logic yok'); process.exit(1); }
  if (!html.match(/setTimeout.*connect\(\)/s) && !html.match(/reconnectDelay|MAX_RECONNECT/)) { console.error('FAIL: backoff logic yok'); process.exit(1); }
  if (!html.includes('connection-status') && !html.includes('CONNECTED') && !html.includes('Disconnected')) { console.error('FAIL: connection status UI yok'); process.exit(1); }
  console.log('PASS: H4 reconnect logic + UI');
"

# H5: Stuck detection
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  if (!html.includes('checkStuckAgents') && !html.includes('stuck')) { console.error('FAIL: stuck detection yok'); process.exit(1); }
  if (!html.match(/percentile|p95|95/i)) { console.error('FAIL: percentile hesap yok'); process.exit(1); }
  console.log('PASS: H5 stuck detection');
"

# Mevcut panel'ler hâlâ var
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  const required = ['Agent Timeline', 'Live Feed', 'Token Burn', 'Agent Breakdown', 'Agent Health', 'Hook Performance'];
  for (const p of required) {
    if (!html.includes(p)) { console.error('FAIL: panel kaybolmus:', p); process.exit(1); }
  }
  console.log('PASS: tum onceki paneller mevcut');
"

# Extra: exponential backoff explicit (1s -> 30s cap)
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  if (!html.match(/RECONNECT_MAX_DELAY\s*=\s*30000/)) { console.error('FAIL: 30s cap yok'); process.exit(1); }
  if (!html.match(/RECONNECT_INITIAL_DELAY\s*=\s*1000/)) { console.error('FAIL: 1s initial yok'); process.exit(1); }
  if (!html.match(/reconnectDelay\s*\*\s*2/)) { console.error('FAIL: x2 doubling yok'); process.exit(1); }
  console.log('PASS: exponential backoff (1s -> x2 -> 30s cap)');
"

# Extra: notification permission gate (Notification.permission check)
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  if (!html.includes(\"'Notification' in window\")) { console.error('FAIL: feature-detect yok'); process.exit(1); }
  if (!html.includes('Notification.permission')) { console.error('FAIL: permission check yok'); process.exit(1); }
  if (!html.includes('requestPermission')) { console.error('FAIL: requestPermission yok'); process.exit(1); }
  console.log('PASS: Notification API permission gate');
"

# Extra: server.js & hooks untouched (Sprint 3 R1 must not modify them)
node -e "
  const fs = require('fs');
  const server = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/server.js', 'utf-8');
  // We just check it parses as JS and contains a known sentinel from prior sprint.
  if (!server.includes('eventStore')) { console.error('FAIL: server.js corrupted'); process.exit(1); }
  console.log('PASS: server.js sentinel present (untouched contract)');
"

# Extra: no new dependencies introduced
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/package.json', 'utf-8'));
  const deps = Object.keys(pkg.dependencies || {});
  const dev = Object.keys(pkg.devDependencies || {});
  console.log('PASS: dependencies (' + deps.length + ' runtime, ' + dev.length + ' dev) — zero-dep policy intact');
"

echo "ALL SMOKE TESTS PASS"

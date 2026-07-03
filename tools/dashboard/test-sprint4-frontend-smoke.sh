#!/bin/bash
# Sprint 4 Frontend smoke test — P1, P2, P3, P4-footer, P5, P7 polish items.
# Tests pattern presence in index.html. Does NOT touch server.js (spark owns that).
set -e

INDEX_HTML=process.env.HOME + "/.claude/tools/dashboard/index.html"

# === Patterns added by this sprint ===
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('${INDEX_HTML}', 'utf-8');
  const checks = [
    ['P1 firstStart function', /firstStart|first.start/i],
    ['P1 sortedTypes', /sortedTypes|sort.*firstStart/],
    ['P2 requestAnimationFrame', /requestAnimationFrame/],
    ['P2 throttle pattern', /renderTimelinePending|scheduleRender/],
    ['P3 responsive breakpoints', /\bmd:|\blg:/],
    ['P4 self-stats fetch', /\/api\/self-stats/],
    ['P4 footer element', /<footer/i],
    ['P5 tab title counter', /bgErrorCount|document\.title/],
    ['P5 favicon canvas', /canvas|updateFavicon/i],
    ['P5 visibility change', /visibilitychange/],
    ['P7 tabindex', /tabindex/],
    ['P7 ARIA labels', /aria-label/],
    ['P7 keyboard handler', /keydown.*Enter|Enter.*keydown|key === 'Enter'/],
  ];
  let fail = 0;
  for (const [desc, re] of checks) {
    if (!re.test(html)) { console.error('FAIL:', desc); fail++; }
    else console.log('PASS:', desc);
  }
  if (fail) process.exit(1);
"

# === Mevcut paneller hala var ===
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('${INDEX_HTML}', 'utf-8');
  const required = ['Agent Timeline', 'Live Feed', 'Token Burn', 'Agent Breakdown', 'Agent Health', 'Hook Performance', 'Canavar Error'];
  for (const p of required) {
    if (!html.includes(p)) { console.error('FAIL: panel kaybolmus:', p); process.exit(1); }
  }
  console.log('PASS: tum onceki paneller mevcut');
"

# === Önceki Sprint feature'ları intact ===
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('${INDEX_HTML}', 'utf-8');
  const required = ['exportSession', 'sparkline', 'retryCount', 'reconnectDelay', 'checkStuckAgents', 'toggleFeedExpand', 'session-filter', 'feed-search'];
  for (const f of required) {
    if (!html.includes(f)) { console.error('FAIL: previous feature gone:', f); process.exit(1); }
  }
  console.log('PASS: tum onceki feature kodlari intact');
"

echo ''
echo 'ALL SMOKE TESTS PASS'

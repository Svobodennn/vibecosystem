#!/bin/bash
set -e

# Test 1: HTML elemanlari
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  const checks = [
    ['session filter element', 'session-filter'],
    ['SESSIONS stat label', 'SESSIONS'],
  ];
  for (const [desc, needle] of checks) {
    if (!html.includes(needle)) { console.error('FAIL:', desc, '->', needle); process.exit(1); }
  }
  console.log('PASS: HTML elements');
"

# Test 2: server.js getStats backward compat
node -e "
  const fs = require('fs');
  const code = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/server.js', 'utf-8');
  // getStats return'unde activeSessions var mi
  if (!code.includes('activeSessions')) { console.error('FAIL: activeSessions field yok'); process.exit(1); }
  // Eski field'lar duruyor mu
  const required = ['totalEvents','agentSpawns','agentCompletes','agentErrors','toolCalls','avgDuration','errorRate'];
  for (const f of required) {
    if (!code.includes(f)) { console.error('FAIL: eski field eksik:', f); process.exit(1); }
  }
  console.log('PASS: stats backward compat');
"

echo "ALL SMOKE TESTS PASS"

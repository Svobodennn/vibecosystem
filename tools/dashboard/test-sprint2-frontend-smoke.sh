#!/bin/bash
# Sprint 2 Frontend smoke test — H1 + H2 + H3 (Agent Health, Feed Expand, Hook Performance)
# Pure static checks on index.html. No server required.
set -e

HTML=process.env.HOME + "/.claude/tools/dashboard/index.html"

# Test 1: HTML/JS elements present
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$HTML', 'utf-8');
  const checks = [
    ['H1 Agent Health panel',           /agent.health|Agent.Health|agent-health/i],
    ['H1 fetchAgentHealth function',    /fetchAgentHealth/],
    ['H1 polls every 10s',              /setInterval\(\s*fetchAgentHealth\s*,\s*10000\s*\)/],
    ['H2 expand handler',               /toggleFeedExpand|event-expand/],
    ['H2 errorContext usage',           /errorContext/],
    ['H2 cursor-pointer on feed item',  /cursor-pointer/],
    ['H3 Hook Performance panel',       /hook.performance|Hook.Performance|hook-perf/i],
    ['H3 fetchHookPerf function',       /fetchHookPerf/],
    ['H3 polls every 30s',              /setInterval\(\s*fetchHookPerf\s*,\s*30000\s*\)/],
  ];
  let fail = 0;
  for (const [desc, re] of checks) {
    if (!re.test(html)) { console.error('FAIL:', desc); fail++; }
    else console.log('PASS:', desc);
  }
  if (fail) process.exit(1);
"

# Test 2: XSS guard — textContent used for dynamic content rendering
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$HTML', 'utf-8');
  if (!html.includes('textContent')) {
    console.error('FAIL: XSS guard yok (textContent kullanilmali)');
    process.exit(1);
  }
  // errorContext especially must be rendered via textContent (not innerHTML)
  // Anchor on the FUNCTION DEFINITION, not the first call site: P7 keyboard
  // handler added a second call before the definition, which made split()[1]
  // a tiny call-to-call slice that never contained errorContext.
  const expandBlock = html.split('function toggleFeedExpand')[1] || '';
  if (!/errorContext[\s\S]{0,400}textContent/.test(expandBlock)) {
    console.error('FAIL: errorContext textContent ile render edilmiyor olabilir');
    process.exit(1);
  }
  console.log('PASS: XSS guard mevcut (textContent kullaniliyor)');
  console.log('PASS: errorContext textContent ile render ediliyor');
"

# Test 3: Existing panels survived (behavior preservation)
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$HTML', 'utf-8');
  const required = ['Agent Timeline', 'Live Feed', 'Token Burn', 'Agent Breakdown', 'Canavar Error'];
  let fail = 0;
  for (const p of required) {
    if (!html.includes(p)) { console.error('FAIL: panel kaybolmus:', p); fail++; }
    else console.log('PASS: panel mevcut:', p);
  }
  if (fail) process.exit(1);
"

# Test 4: API contracts preserved (existing fetch calls still there)
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$HTML', 'utf-8');
  const required = ['/api/errors', '/api/tokens', '/api/costs', '/api/matrix'];
  let fail = 0;
  for (const p of required) {
    if (!html.includes(p)) { console.error('FAIL: API endpoint cagrisi kaybolmus:', p); fail++; }
    else console.log('PASS: API endpoint cagrisi mevcut:', p);
  }
  // New endpoint (H3)
  if (!html.includes('/api/hook-perf')) {
    console.error('FAIL: /api/hook-perf cagrisi eksik (H3)'); process.exit(1);
  }
  console.log('PASS: API endpoint cagrisi mevcut: /api/hook-perf');
  if (fail) process.exit(1);
"

# Test 5: No new external dependencies (zero-dep rule)
node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$HTML', 'utf-8');
  // Only allowed external script: tailwindcss CDN + Google Fonts CSS
  const scriptSrcs = [...html.matchAll(/<script\s+src=\"([^\"]+)\"/g)].map(m => m[1]);
  const allowed = ['https://cdn.tailwindcss.com'];
  for (const src of scriptSrcs) {
    if (!allowed.includes(src)) {
      console.error('FAIL: yeni script dependency:', src);
      process.exit(1);
    }
  }
  console.log('PASS: zero new dependencies (only Tailwind CDN)');
"

echo ""
echo "ALL SMOKE TESTS PASS"

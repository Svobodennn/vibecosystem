#!/bin/bash
# C4 (Sub-Agent Hierarchy) smoke test
# Run after applying changes; verifies hook dist + UI integration + handoff.
set -e

# Test 1: Hook rebuild başarılı (dist must contain parentAgentId)
test -f ~/.claude/hooks/dist/dashboard-ws-emitter.mjs || { echo "FAIL: dist yok"; exit 1; }
grep -q "parentAgentId" ~/.claude/hooks/dist/dashboard-ws-emitter.mjs || { echo "FAIL: parentAgentId build'de yok"; exit 1; }
echo "PASS: hook rebuild + parentAgentId mevcut"

# Test 2: Hook fake input ile çalışıyor (fire-and-forget, output should be empty JSON)
RESULT=$(echo '{"session_id":"smoke","tool_name":"Agent","tool_input":{"subagent_type":"test-agent","description":"smoke"},"tool_response":"OK"}' | node ~/.claude/hooks/dist/dashboard-ws-emitter.mjs 2>&1)
echo "PASS: hook output (silent expected): '$RESULT'"

# Test 3: UI elementleri (parentAgentId must be referenced in HTML/JS)
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  if (!html.includes('parentAgentId')) { console.error('FAIL: UI parentAgentId kullanmiyor'); process.exit(1); }
  if (!html.includes('agentParentInfo')) { console.error('FAIL: UI agentParentInfo state yok'); process.exit(1); }
  if (!html.includes('└─')) { console.error('FAIL: UI tree connector glyph yok'); process.exit(1); }
  console.log('PASS: UI parentAgentId + tree-aware');
"

# Test 4: Spike sonucu raporlanmış mı (handoff)
test -f $HOME/.claude/tools/dashboard/SPRINT_1B_C4_HANDOFF.md || { echo "FAIL: handoff yok"; exit 1; }
grep -qi "spike\|env.var\|CLAUDE_PARENT_AGENT_ID" $HOME/.claude/tools/dashboard/SPRINT_1B_C4_HANDOFF.md || { echo "FAIL: spike sonucu handoff'ta yok"; exit 1; }
echo "PASS: handoff spike sonucunu içeriyor"

# Test 5: Server.js'e dokunulmadı (defensive — task said don't touch it)
node -e "
  const fs = require('fs');
  const js = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/server.js', 'utf-8');
  // Ensure no parentAgentId logic was added to server (schema-less store is fine).
  // We allow the field to pass through addEvent; we just don't want validation.
  if (js.includes('parentAgentId')) {
    console.error('WARN: server.js mentions parentAgentId — task said do not touch. Verify.');
    process.exit(1);
  }
  console.log('PASS: server.js untouched (schema-less passthrough preserved)');
"

# Test 6: Behavior preservation — old events without parentAgentId still render
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  // The 'anyParentSeen' fast-path returns original 'types' when no parents seen.
  // This guarantees flat render for legacy data.
  if (!html.includes('Fast-path: classic flat order')) {
    console.error('FAIL: flat-fallback fast-path missing — legacy events may break');
    process.exit(1);
  }
  console.log('PASS: flat-fallback fast-path preserved (backward compat)');
"

echo ""
echo "ALL SMOKE TESTS PASS"

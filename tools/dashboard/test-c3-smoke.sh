#!/bin/bash
# C3 Smoke Test — Token Usage Logger
# Tests: build presence, hook execution, JSONL output, settings.json validity, UI elements

set -e

JSONL=~/.claude/token-usage.jsonl

# Test 1: Hook build basarili mi
test -f ~/.claude/hooks/dist/token-logger.mjs || { echo "FAIL: dist file yok"; exit 1; }
echo "PASS: token-logger.mjs build edildi"

# Test 2: Hook sahte input ile calisiyor mu
RESULT=$(echo '{"session_id":"smoke123","tool_name":"Bash","tool_input":{"command":"ls"},"tool_response":"file1\nfile2\nfile3"}' | node ~/.claude/hooks/dist/token-logger.mjs 2>&1)
if [ -z "$RESULT" ] || [ "$RESULT" = "{}" ]; then
  echo "PASS: hook silent (expected for token-logger)"
else
  echo "INFO: hook output: $RESULT"
fi

# Test 3: token-usage.jsonl'a yazildi mi
test -f $JSONL || { echo "FAIL: jsonl yazilmadi"; exit 1; }
LAST=$(tail -1 $JSONL)
echo "$LAST" | node -e "
  const e = JSON.parse(require('fs').readFileSync(0,'utf-8'));
  const required = ['ts','session','tool','total_est'];
  for (const f of required) {
    if (!(f in e)) { console.error('FAIL: alan eksik:', f); process.exit(1); }
  }
  if (e.session !== 'smoke123' || e.tool !== 'Bash') { console.error('FAIL: yanlis deger'); process.exit(1); }
  console.log('PASS: jsonl entry dogru formatli');
"

# Test 4: settings.json hala valid JSON
node -e "JSON.parse(require('fs').readFileSync('$HOME/.claude/settings.json','utf-8'))" && echo "PASS: settings.json valid"

# Test 5: HTML elemanlari
node -e "
  const fs = require('fs');
  const html = fs.readFileSync(process.env.HOME + '/.claude/tools/dashboard/index.html', 'utf-8');
  if (!html.includes('TOKENS')) { console.error('FAIL: TOKENS metric yok'); process.exit(1); }
  if (!html.includes('Token Burn') && !html.includes('token-burn')) { console.error('FAIL: Token Burn panel yok'); process.exit(1); }
  console.log('PASS: UI elementleri eklendi');
"

# Test 6: Performance — hook execution time
echo "--- Performance test (10 runs) ---"
TOTAL_MS=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  START=$(node -e "console.log(Date.now())")
  echo '{"session_id":"perftest","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"tool_response":"x"}' | node ~/.claude/hooks/dist/token-logger.mjs > /dev/null 2>&1
  END=$(node -e "console.log(Date.now())")
  DIFF=$((END - START))
  TOTAL_MS=$((TOTAL_MS + DIFF))
  echo "  run $i: ${DIFF}ms"
done
AVG=$((TOTAL_MS / 10))
echo "AVG: ${AVG}ms (target: <30ms hook logic, <100ms total incl. node startup)"

echo ""
echo "ALL SMOKE TESTS PASS"

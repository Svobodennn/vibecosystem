#!/bin/bash
# Validate the one-handler Codex hook allowlist and fail-closed safety gates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTRAS="$REPO_DIR/tools/codex-extras.mjs"
HANDLER_FIXTURE="$SCRIPT_DIR/fixtures/codex-credential-deny.mjs"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/vibecosystem-codex-hooks.XXXXXX")"
SETTINGS="$TEST_ROOT/settings.json"
CODEX_HOME_DIR="$TEST_ROOT/.codex"
TEST_HANDLER="$TEST_ROOT/credential-deny.mjs"

cleanup() {
  find "$TEST_ROOT" -type f -delete 2>/dev/null || true
  find "$TEST_ROOT" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT

cp "$HANDLER_FIXTURE" "$TEST_HANDLER"

node --input-type=module - "$SETTINGS" "$TEST_HANDLER" <<'NODE'
import { writeFileSync } from 'node:fs';
const [settingsPath, handlerPath] = process.argv.slice(2);
const settings = {
  hooks: {
    PreToolUse: [{
      matcher: '',
      hooks: [{ type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(handlerPath)}` }],
    }],
  },
};
writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE

output="$(node "$EXTRAS" --hooks --claude-settings "$SETTINGS" --codex-home "$CODEX_HOME_DIR")"
case "$output" in
  *"1 across 1 event"*"trust pending"*) ;;
  *) echo "$output" >&2; exit 1 ;;
esac

test -f "$CODEX_HOME_DIR/hooks.json"
test -f "$CODEX_HOME_DIR/hooks/credential-deny.mjs"
python3 - "$CODEX_HOME_DIR/hooks.json" <<'PY'
import json
from pathlib import Path
import sys

document = json.loads(Path(sys.argv[1]).read_text())
assert list(document["hooks"]) == ["PreToolUse"]
matchers = document["hooks"]["PreToolUse"]
assert len(matchers) == 1 and matchers[0]["matcher"] == "^Bash$"
handlers = matchers[0]["hooks"]
assert len(handlers) == 1 and handlers[0]["type"] == "command"
serialized = json.dumps(document)
assert "PermissionRequest" not in serialized
assert "trusted_hash" not in serialized
assert "rtk hook claude" not in serialized
print("HOOK_SCHEMA_OK=1")
PY

benign="$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"pwd"}}' | node "$CODEX_HOME_DIR/hooks/credential-deny.mjs")"
blocked="$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"cat ~/.ssh/id_rsa"}}' | node "$CODEX_HOME_DIR/hooks/credential-deny.mjs")"
malformed="$(printf '%s' '{broken' | node "$CODEX_HOME_DIR/hooks/credential-deny.mjs")"
test "$benign" = "{}"
case "$blocked" in *'"decision":"block"'*) ;; *) exit 1 ;; esac
case "$malformed" in *'"decision":"block"'*) ;; *) exit 1 ;; esac

node --input-type=module - "$SETTINGS" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2];
const settings = JSON.parse(readFileSync(path, 'utf8'));
settings.hooks.PermissionRequest = [{ matcher: '', hooks: [{ type: 'command', command: 'deny-only' }] }];
writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
NODE
if node "$EXTRAS" --hooks --dry-run --claude-settings "$SETTINGS" --codex-home "$TEST_ROOT/rejected" >"$TEST_ROOT/rejected.out" 2>&1; then
  echo "PermissionRequest matcher was not hard-refused" >&2
  exit 1
fi
grep -q 'PermissionRequest matchers are hard-refused' "$TEST_ROOT/rejected.out"

echo "CODEX_HOOK_ALLOWLIST_VALIDATION_OK=1"

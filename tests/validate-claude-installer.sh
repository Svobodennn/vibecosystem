#!/bin/bash
# Focused validation for the Claude runtime installer. Uses an isolated HOME.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$REPO_DIR/install.sh"
TEST_HOME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vibecosystem-claude-test.XXXXXX")"

cleanup() {
  find "$TEST_HOME_DIR" -type l -delete 2>/dev/null || true
  find "$TEST_HOME_DIR" -type f -delete 2>/dev/null || true
  find "$TEST_HOME_DIR" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  case "$haystack" in
    *"$needle"*) ;;
    *) echo "ASSERTION FAILED: expected output to contain: $needle" >&2; exit 1 ;;
  esac
}

run_installer() {
  HOME="$TEST_HOME_DIR" bash "$INSTALLER" "$@"
}

test -x "$INSTALLER"
bash -n "$INSTALLER"

dry_run_output="$(run_installer --profile core --dry-run --non-interactive)"
assert_contains "$dry_run_output" "vibecosystem profile: core"
test ! -e "$TEST_HOME_DIR/.claude"

run_installer --profile core --non-interactive >/dev/null
run_installer --profile core --non-interactive >/dev/null

TEST_HOME_DIR="$TEST_HOME_DIR" node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const home = process.env.TEST_HOME_DIR;
const claude = path.join(home, '.claude');
const count = (dir, predicate) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(predicate).length : 0;
const settings = JSON.parse(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(claude, 'vibecosystem-runtime.json'), 'utf8'));
const commands = Object.values(settings.hooks || {}).flatMap((groups) =>
  groups.flatMap((group) => (group.hooks || []).map((hook) => hook.command))
);
const registered = commands.length;
if (count(path.join(claude, 'agents'), (x) => x.endsWith('.md')) !== 12) throw new Error('core agents');
if (count(path.join(claude, 'skills'), () => true) !== 32) throw new Error('core skills');
if (count(path.join(claude, 'hooks', 'dist'), (x) => x.endsWith('.mjs')) !== 6) throw new Error('core hook bundles');
if (count(path.join(claude, 'rules'), (x) => x.endsWith('.md')) !== 0) throw new Error('core rules');
if (registered !== 6 || state.registeredHookCommands !== 6) throw new Error('core registered hooks');
if (state.activeProfile !== 'core') throw new Error('core profile');
if (state.contextBudget.perEventChars !== 4000 || state.contextBudget.sessionChars !== 12000) throw new Error('core budget');
if (new Set(commands).size !== commands.length) throw new Error('duplicate hook registration');
if (fs.existsSync(path.join(home, 'AGENTS.md'))) throw new Error('global AGENTS copied');
NODE

run_installer --profile full --non-interactive >/dev/null
run_installer --profile core --prune --non-interactive >/dev/null

TEST_HOME_DIR="$TEST_HOME_DIR" node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const home = process.env.TEST_HOME_DIR;
const claude = path.join(home, '.claude');
const count = (dir, predicate) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(predicate).length : 0;
const settings = JSON.parse(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(claude, 'vibecosystem-runtime.json'), 'utf8'));
const registered = Object.values(settings.hooks || {}).flat().reduce((n, group) => n + (group.hooks || []).length, 0);
if (count(path.join(claude, 'agents'), (x) => x.endsWith('.md')) !== 12) throw new Error('pruned agents');
if (count(path.join(claude, 'skills'), () => true) !== 32) throw new Error('pruned skills');
if (count(path.join(claude, 'hooks', 'dist'), (x) => x.endsWith('.mjs')) !== 6) throw new Error('pruned hook bundles');
if (count(path.join(claude, 'rules'), (x) => x.endsWith('.md')) !== 0) throw new Error('pruned rules');
if (registered !== 6 || state.registeredHookCommands !== 6) throw new Error('pruned hooks');
if (state.contextBudget.perEventChars !== 4000 || state.contextBudget.sessionChars !== 12000) throw new Error('pruned budget');
if (count(path.join(claude, 'backups'), () => true) === 0) throw new Error('backup missing');
console.log('CLAUDE_INSTALLER_VALIDATION_OK=1');
NODE

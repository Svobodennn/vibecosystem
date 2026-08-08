#!/bin/bash
# Focused validation for the Codex installer slice. Uses an isolated HOME.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$REPO_DIR/install-codex.sh"
TEST_HOME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vibecosystem-codex-test.XXXXXX")"

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
  HOME="$TEST_HOME_DIR" PYTHONDONTWRITEBYTECODE=1 "$INSTALLER" "$@"
}

test -x "$INSTALLER"
bash -n "$INSTALLER"

toml_python=""
for candidate in python3.13 python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && \
     "$candidate" -c 'import tomllib' >/dev/null 2>&1; then
    toml_python="$candidate"
    break
  fi
done
[ -n "$toml_python" ] || { echo "A Python with tomllib is required for this validation." >&2; exit 1; }

"$toml_python" - "$REPO_DIR/.codex/agents/luna-worker.toml" "$REPO_DIR/.codex/config.toml" <<'PY'
from pathlib import Path
import sys
import tomllib

worker_path = Path(sys.argv[1])
config_path = Path(sys.argv[2])
expected_worker = {
    "name": "luna_worker",
    "description": "Bounded repository worker for implementation and verification.",
    "developer_instructions": (
        "Work only within the assigned repository and task scope.\n"
        "Inspect the relevant files before changing anything.\n"
        "Do not spawn subagents or background workers unless the user explicitly requests it.\n"
        "Do not run unrelated automation, broad skill scans, or automatic memory recall.\n"
        "Make the smallest complete change, then run focused verification.\n"
        "Stop and ask when the task requires destructive action, external authority, credentials, or an unclear product decision.\n"
        "Return a concise report with result, changed paths, verification performed, and caveats.\n"
    ),
    "model": "gpt-5.6-luna",
    "model_reasoning_effort": "max",
}

with worker_path.open("rb") as handle:
    worker = tomllib.load(handle)
assert worker == expected_worker, worker

with config_path.open("rb") as handle:
    config = tomllib.load(handle)
assert config == {"project_doc_fallback_filenames": ["AGENTS.md", "CLAUDE.md"]}, config
print("TOML_CONTRACTS_OK=1")
PY

validation_output="$(run_installer --validate-luna-worker)"
assert_contains "$validation_output" "LUNA_WORKER_VALID=1"
test ! -e "$TEST_HOME_DIR/.agents"
test ! -e "$TEST_HOME_DIR/.codex"

dry_run_output="$(run_installer --profile=core --install-luna-worker --dry-run --non-interactive)"
assert_contains "$dry_run_output" "Installing profile 'core' (32 skills)"
assert_contains "$dry_run_output" "Global AGENTS.md copy: disabled"
test ! -e "$TEST_HOME_DIR/.agents"
test ! -e "$TEST_HOME_DIR/.codex"

run_installer --profile core --install-luna-worker --non-interactive >/dev/null
skill_count="$(find "$TEST_HOME_DIR/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
manifest_count="$(awk -F '\t' '!/^#/ && NF {count++} END {print count+0}' "$TEST_HOME_DIR/.agents/.vibecosystem-codex-skills")"
[ "$skill_count" = "32" ]
[ "$manifest_count" = "32" ]
test -f "$TEST_HOME_DIR/.codex/agents/luna-worker.toml"
test ! -e "$TEST_HOME_DIR/.codex/AGENTS.md"

mkdir -p "$TEST_HOME_DIR/.agents/skills/user-owned-skill"
printf 'user-owned\n' > "$TEST_HOME_DIR/.agents/skills/user-owned-skill/SKILL.md"
run_installer --profile full --non-interactive >/dev/null
full_count="$(find "$TEST_HOME_DIR/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
[ "$full_count" = "297" ]
run_installer --profile core --prune --non-interactive >/dev/null
skill_count="$(find "$TEST_HOME_DIR/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
[ "$skill_count" = "33" ]
test -d "$TEST_HOME_DIR/.agents/skills/user-owned-skill"
test ! -d "$TEST_HOME_DIR/.agents/skills/accessibility-patterns"
backup_skill_count="$(find "$TEST_HOME_DIR/.agents/vibecosystem-backups" -type d -path '*/skills/*' | wc -l | tr -d ' ')"
[ "$backup_skill_count" -gt 0 ]

echo "CODEX_INSTALLER_VALIDATION_OK=1"

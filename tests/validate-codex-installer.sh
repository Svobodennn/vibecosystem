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

source_description_failures=()
while IFS= read -r skill_file; do
  frontmatter="$(sed -n '2,/^---$/p' "$skill_file")"
  description_line="$(printf '%s\n' "$frontmatter" | grep -nE '^description:[[:space:]]*[^[:space:]]' | head -n 1 || true)"
  metadata_line="$(printf '%s\n' "$frontmatter" | grep -nE '^metadata:[[:space:]]*$' | head -n 1 || true)"
  if [ -z "$description_line" ] || \
     { [ -n "$metadata_line" ] && [ "${description_line%%:*}" -gt "${metadata_line%%:*}" ]; }; then
    source_description_failures+=("$(basename "$(dirname "$skill_file")")")
  fi
done < <(find "$REPO_DIR/skills" -mindepth 2 -maxdepth 2 -type f -name SKILL.md -print | LC_ALL=C sort)
if [ "${#source_description_failures[@]}" -ne 0 ]; then
  printf 'Repo skill source is missing frontmatter description: %s\n' \
    "${source_description_failures[@]}" >&2
  exit 1
fi

hyphenated_consolidated_skills=(
  continuity-ledger create-handoff implement-plan resume-handoff
  system-overview describe-pr implement-plan-micro implement-task
)
removed_underscore_duplicates=(
  continuity_ledger create_handoff implement_plan resume_handoff
  system_overview describe_pr implement_plan_micro implement_task
)
for skill_name in "${hyphenated_consolidated_skills[@]}"; do
  skill_file="$REPO_DIR/skills/$skill_name/SKILL.md"
  test -f "$skill_file"
  sed -n '2,/^---$/p' "$skill_file" \
    | grep -qE "^name:[[:space:]]*$skill_name[[:space:]]*$"
done
for skill_name in "${removed_underscore_duplicates[@]}"; do
  test ! -e "$REPO_DIR/skills/$skill_name"
done

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

codex_dry_run_output="$(run_installer --profile codex --dry-run --non-interactive)"
assert_contains "$codex_dry_run_output" "Installing profile 'codex' (282 skills)"
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
[ "$full_count" = "308" ]
run_installer --profile core --prune --non-interactive >/dev/null
skill_count="$(find "$TEST_HOME_DIR/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
[ "$skill_count" = "33" ]
test -d "$TEST_HOME_DIR/.agents/skills/user-owned-skill"
test ! -d "$TEST_HOME_DIR/.agents/skills/accessibility-patterns"
backup_skill_count="$(find "$TEST_HOME_DIR/.agents/vibecosystem-backups" -type d -path '*/skills/*' | wc -l | tr -d ' ')"
[ "$backup_skill_count" -gt 0 ]

run_installer --profile codex --non-interactive >/dev/null
codex_count="$(find "$TEST_HOME_DIR/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
manifest_count="$(awk -F '\t' '!/^#/ && NF {count++} END {print count+0}' "$TEST_HOME_DIR/.agents/.vibecosystem-codex-skills")"
[ "$codex_count" = "283" ]
[ "$manifest_count" = "282" ]
test -d "$TEST_HOME_DIR/.agents/skills/user-owned-skill"
excluded_codex_skills=(
  sub-agents parallel-agents parallel-agent-contracts swarm
  swarm-optimization-patterns council background-agent-pings
  no-task-output no-polling-agents hook-developer hooks debug-hooks
  slash-commands smart-model-routing braintrust-analyze braintrust-tracing
  agent-benchmark agent-context-isolation agent-linter agent-orchestration
  agent-qa-testing agent-tamagotchi agentic-workflow validate-agent
  workflow-router
)
for skill_name in "${excluded_codex_skills[@]}"; do
  test ! -e "$TEST_HOME_DIR/.agents/skills/$skill_name"
done
test -d "$TEST_HOME_DIR/.agents/skills/frontend-patterns"
test -d "$TEST_HOME_DIR/.agents/skills/server-components"
test -d "$TEST_HOME_DIR/.agents/skills/plan-agent"

adapted_count=0
for directory in "$TEST_HOME_DIR"/.agents/skills/*; do
  if [ -d "$directory" ] && grep -rqE 'codex-adapted-skill' "$directory"; then
    adapted_count=$((adapted_count + 1))
    claude_runtime_matches="$({
      grep -rnE --include='*.md' \
        'AskUserQuestion|subagent_type|run_in_background|\.claude/hooks' \
        "$directory" || true
      grep -rnE --include='*.md' '(^|[^[:alnum:]_])Task\(' "$directory" \
        | grep -vE 'Tasks\(|Task\(s\)' || true
    })"
    if [ -n "$claude_runtime_matches" ]; then
      printf '%s\n' "$claude_runtime_matches"
      echo "Claude-only skill instruction survived in $directory" >&2
      exit 1
    fi
  fi
done
[ "$adapted_count" = "36" ]

while IFS=$'\t' read -r skill_name _skill_hash; do
  [ -n "$skill_name" ] || continue
  case "$skill_name" in \#*) continue ;; esac
  skill_file="$TEST_HOME_DIR/.agents/skills/$skill_name/SKILL.md"
  test -f "$skill_file"
  frontmatter="$(sed -n '2,/^---$/p' "$skill_file")"
  if ! printf '%s\n' "$frontmatter" | grep -qE '^description:[[:space:]]*[^[:space:]]'; then
    echo "Codex-discoverable skill is missing frontmatter description: $skill_name" >&2
    exit 1
  fi
done < "$TEST_HOME_DIR/.agents/.vibecosystem-codex-skills"
grep -q '^description: Scan Codex configuration for security misconfigurations, exposed secrets, unsafe permissions$' \
  "$TEST_HOME_DIR/.agents/skills/config-security-scan/SKILL.md"

grep -q 'inspect runtime inventory' "$TEST_HOME_DIR/.agents/skills/help/SKILL.md"
grep -q 'Sabit agent/skill/hook sayısı verme' "$TEST_HOME_DIR/.agents/skills/hizir/SKILL.md"
grep -q 'Build the overview from runtime evidence' "$TEST_HOME_DIR/.agents/skills/system-overview/SKILL.md"
if grep -rnE 'CONTINUOUS CLAUDE|51 agent|/swarm|~/.claude|\.claude/' \
  "$TEST_HOME_DIR/.agents/skills/help" \
  "$TEST_HOME_DIR/.agents/skills/hizir" \
  "$TEST_HOME_DIR/.agents/skills/system-overview"; then
  echo "stale Claude inventory survived a Codex-native discovery skill" >&2
  exit 1
fi
if grep -rnE --include='*.md' \
  "agent_type[[:space:]]*[=:][[:space:]]*['\"](aegis|atlas|critic|discovery-interview|general-purpose|implement_task|onboard|plan-agent|premortem|research-codebase|scribe)['\"]" \
  "$TEST_HOME_DIR/.agents/skills"; then
  echo "an unavailable Claude agent name survived skill adaptation" >&2
  exit 1
fi

bash "$SCRIPT_DIR/validate-codex-rule-overlays.sh" >/dev/null

echo "CODEX_INSTALLER_VALIDATION_OK=1"

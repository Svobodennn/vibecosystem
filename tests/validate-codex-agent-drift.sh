#!/bin/bash
# Validate the live-agent mirror, Codex overlays, transforms, and role registry.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTRAS="$REPO_DIR/tools/codex-extras.mjs"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/vibecosystem-codex-agents.XXXXXX")"
TEST_ROOT="$(cd "$TEST_ROOT" && pwd)"
LIVE_FIXTURE="$TEST_ROOT/.claude/agents"
CODEX_HOME_DIR="$TEST_ROOT/.codex"
SKILLS_HOME_DIR="$TEST_ROOT/.agents/skills"
USER_LUNA_FIXTURE="$SCRIPT_DIR/fixtures/codex-user-luna-worker.toml"

cleanup() {
  find "$TEST_ROOT" -type f -delete 2>/dev/null || true
  find "$TEST_ROOT" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$LIVE_FIXTURE" "$CODEX_HOME_DIR/agents"

legacy_agents=(
  incident-commander release-engineer test-architect refactor-cleaner
  api-doc-generator commander herald nitro pathfinder dependency-auditor
  dependency-tracker documentation-architect migration-planner
  resource-manager validate-agent
)

is_legacy() {
  local needle="$1"
  local slug
  for slug in "${legacy_agents[@]}"; do
    [ "$slug" = "$needle" ] && return 0
  done
  return 1
}

for source in "$REPO_DIR"/agents/*.md; do
  slug="$(basename "$source" .md)"
  is_legacy "$slug" || cp "$source" "$LIVE_FIXTURE/$slug.md"
done
test "$(find "$LIVE_FIXTURE" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "131"

python3 - "$REPO_DIR" <<'PY'
from hashlib import sha256
import json
from pathlib import Path
import sys

repo = Path(sys.argv[1])
root = repo / "agents"
overlay_dir = root / "codex"
baseline = json.loads((root / "codex-baseline.json").read_text())
files = sorted(overlay_dir.iterdir())
assert all(path.is_file() and path.suffix == ".md" for path in files), files
slugs = {path.stem for path in files}
assert len(slugs) == 5
assert slugs == set(baseline["overrides"])
for slug, expected in baseline["overrides"].items():
    canonical = root / f"{slug}.md"
    assert canonical.is_file(), f"orphan override: {slug}"
    assert sha256(canonical.read_bytes()).hexdigest() == expected, f"canonical {slug} drifted"
print("AGENT_BASELINE_OK=1")
PY

COLLISION_ROOT="$TEST_ROOT/collision"
COLLISION_CODEX_HOME="$COLLISION_ROOT/.codex"
COLLISION_SKILLS_HOME="$COLLISION_ROOT/.agents/skills"
mkdir -p "$COLLISION_CODEX_HOME/agents"
cp "$USER_LUNA_FIXTURE" "$COLLISION_CODEX_HOME/agents/browser-agent.toml"
if node "$EXTRAS" --agents \
  --claude-agents "$LIVE_FIXTURE" \
  --codex-home "$COLLISION_CODEX_HOME" \
  --skills-home "$COLLISION_SKILLS_HOME" \
  >"$COLLISION_ROOT/no-force.out" 2>&1; then
  echo "unmanaged agent TOML was overwritten without --force" >&2
  exit 1
fi
grep -q -- '--force' "$COLLISION_ROOT/no-force.out"
grep -qF "$COLLISION_CODEX_HOME/agents/browser-agent.toml" "$COLLISION_ROOT/no-force.out"
cmp "$USER_LUNA_FIXTURE" "$COLLISION_CODEX_HOME/agents/browser-agent.toml"
test "$(find "$COLLISION_CODEX_HOME/agents" -maxdepth 1 -type f -name '*.toml' | wc -l | tr -d ' ')" = "1"

cp "$USER_LUNA_FIXTURE" "$CODEX_HOME_DIR/agents/luna-worker.toml"
output="$(node "$EXTRAS" --agents \
  --claude-agents "$LIVE_FIXTURE" \
  --codex-home "$CODEX_HOME_DIR" \
  --skills-home "$SKILLS_HOME_DIR")"
case "$output" in
  *"115 mirror TOML, 5 overrides, 16 excluded; luna_worker reserved"*) ;;
  *) echo "$output" >&2; exit 1 ;;
esac

test "$(find "$CODEX_HOME_DIR/agents" -maxdepth 1 -type f -name '*.toml' ! -name 'luna-worker.toml' | wc -l | tr -d ' ')" = "115"
cmp "$USER_LUNA_FIXTURE" "$CODEX_HOME_DIR/agents/luna-worker.toml"
test ! -e "$CODEX_HOME_DIR/agents/maestro.toml"
test ! -e "$CODEX_HOME_DIR/agents/council-chair.toml"
test ! -e "$CODEX_HOME_DIR/agents/cost-tracker.toml"
test -e "$CODEX_HOME_DIR/agents/bannerlord-expert.toml"
test -e "$CODEX_HOME_DIR/agents/browser-agent.toml"
test -e "$CODEX_HOME_DIR/agents/liaison.toml"
grep -q 'Return the review directly to the parent context' "$CODEX_HOME_DIR/agents/liaison.toml"

if grep -rnE '\.claude/|<project-slug>|isolation:[[:space:]]*worktree' "$CODEX_HOME_DIR/agents"; then
  echo "Claude-only agent runtime claim survived transformation" >&2
  exit 1
fi
test "$(grep -rlE '## Codex leaf-agent contract' "$CODEX_HOME_DIR/agents" | wc -l | tr -d ' ')" = "115"
grep -q 'technical-writer.*Dokumantasyon' "$CODEX_HOME_DIR/agents/api-designer.toml"
grep -q 'parent context (plan execution coordination)' "$CODEX_HOME_DIR/agents/planner.toml"
grep -q 'Not an automatic session-start daemon' "$CODEX_HOME_DIR/agents/strategist.toml"

python3 - "$CODEX_HOME_DIR" "$LIVE_FIXTURE" <<'PY'
from pathlib import Path
import sys
import tomllib

home = Path(sys.argv[1])
live = Path(sys.argv[2])
with (home / "config.toml").open("rb") as handle:
    config = tomllib.load(handle)
agents = config["agents"]
assert agents["max_concurrent_threads_per_session"] == 4
assert agents["max_depth"] == 1
roles = {key: value for key, value in agents.items() if isinstance(value, dict)}
assert len(roles) == 115, len(roles)
assert "luna_worker" not in roles

expected_excluded = {
    "compass",
    "cost-tracker",
    "council-blast-radius",
    "council-chair",
    "council-empiricist",
    "council-inventory",
    "council-refuter",
    "council-simplifier",
    "maestro",
    "memory-extractor",
    "psyche",
    "reputation-engine",
    "scribe",
    "self-learner",
    "session-replay-analyzer",
    "swarm-optimizer",
}
live_slugs = {path.stem for path in live.glob("*.md")}
generated_slugs = {
    path.stem for path in (home / "agents").glob("*.toml")
    if path.name != "luna-worker.toml"
}
actual_excluded = live_slugs - generated_slugs

expected_nicknames = {
    "ai_engineer": "Reza Tehrani",
    "backend_dev": "Dmitri Volkov",
    "business_analyst": "Amara Nwosu",
    "copywriter": "Ellie Marchetti",
    "data_analyst": "Yuna Park",
    "designer": "Marcus Webb",
    "devops": "Kai Nakamura",
    "frontend_dev": "Aria Chen",
    "growth": "Camille Dubois",
    "janitor": "Sam Calloway",
    "migrator": "Tomas Kowalski",
    "project_manager": "Sofia Andrade",
    "qa_engineer": "Priya Sharma",
    "security_analyst": "Zara Osei",
    "shipper": "Leo Andersen",
    "technical_writer": "Noah Brennan",
}

errors = []
if actual_excluded != expected_excluded:
    errors.append(
        "excluded set mismatch: "
        f"missing={sorted(expected_excluded - actual_excluded)} "
        f"extra={sorted(actual_excluded - expected_excluded)}"
    )
actual_nickname_roles = {
    role for role, definition in roles.items()
    if "nickname_candidates" in definition
}
if actual_nickname_roles != set(expected_nicknames):
    errors.append(
        "nickname role set mismatch: "
        f"missing={sorted(set(expected_nicknames) - actual_nickname_roles)} "
        f"extra={sorted(actual_nickname_roles - set(expected_nicknames))}"
    )
for role, persona in expected_nicknames.items():
    if roles[role].get("nickname_candidates") != [persona]:
        errors.append(
            f"{role} nickname mismatch: "
            f"{roles[role].get('nickname_candidates')!r} != {[persona]!r}"
        )
    if f"({persona} persona)" not in roles[role]["description"]:
        errors.append(f"{role} persona is not sourced from its description: {persona}")

for path in (home / "agents").glob("*.toml"):
    if path.name == "luna-worker.toml":
        continue
    with path.open("rb") as handle:
        agent = tomllib.load(handle)
    assert set(agent) == {"name", "description", "developer_instructions"}, (path, agent.keys())
    role = agent["name"]
    assert role in roles, (path, role)
    assert roles[role]["config_file"] == f"agents/{path.stem}.toml"
if errors:
    raise AssertionError("\n".join(errors))
print("AGENT_TOML_OK=1")
PY

if command -v codex >/dev/null 2>&1; then
  CODEX_HOME="$CODEX_HOME_DIR" codex features list >/dev/null
fi

echo "CODEX_AGENT_DRIFT_VALIDATION_OK=1"

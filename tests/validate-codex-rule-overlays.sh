#!/bin/bash
# Validate Codex rule overlays, drift baselines, and the compact global core.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTRAS="$REPO_DIR/tools/codex-extras.mjs"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/vibecosystem-codex-rules.XXXXXX")"
TEST_ROOT="$(cd "$TEST_ROOT" && pwd)"
UNMANAGED_AGENTS_FIXTURE="$SCRIPT_DIR/fixtures/codex-unmanaged-AGENTS.md"
MANAGED_EDITED_AGENTS_FIXTURE="$SCRIPT_DIR/fixtures/codex-managed-edited-AGENTS.md"
USER_RULE_FIXTURE="$SCRIPT_DIR/fixtures/codex-user-rule-SKILL.md"

cleanup() {
  find "$TEST_ROOT" -type f -delete 2>/dev/null || true
  find "$TEST_ROOT" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT

node --check "$EXTRAS"

python3 - "$REPO_DIR" <<'PY'
from hashlib import sha256
import json
from pathlib import Path
import sys

repo = Path(sys.argv[1])
root = repo / "rules"
overlay_dir = root / "codex"
baseline = json.loads((root / "codex-baseline.json").read_text())
assert baseline["schema_version"] == 1
assert baseline["algorithm"] == "sha256"
files = sorted(overlay_dir.iterdir())
assert all(path.is_file() and path.suffix == ".md" for path in files), files
slugs = {path.stem for path in files}
assert len(slugs) == 23, len(slugs)
assert slugs == set(baseline["overrides"]), (slugs, baseline["overrides"].keys())
for slug, expected in baseline["overrides"].items():
    canonical = root / f"{slug}.md"
    assert canonical.is_file(), f"orphan override: {slug}"
    actual = sha256(canonical.read_bytes()).hexdigest()
    assert actual == expected, f"canonical {slug} changed; review its Codex override"
assert "council" not in slugs
print("RULE_BASELINE_OK=1")
PY

CODEX_HOME_DIR="$TEST_ROOT/.codex"
SKILLS_HOME_DIR="$TEST_ROOT/.agents/skills"
output="$(node "$EXTRAS" --rules --codex-home "$CODEX_HOME_DIR" --skills-home "$SKILLS_HOME_DIR")"
case "$output" in
  *"AGENTS.md 2.5 KB (9 guardrails), 26 rule-* skills, 23 overrides"*) ;;
  *) echo "$output" >&2; exit 1 ;;
esac

test "$(wc -c < "$CODEX_HOME_DIR/AGENTS.md" | tr -d ' ')" = "2575"
test "$(grep -c '^- \*\*' "$CODEX_HOME_DIR/AGENTS.md")" = "9"
test "$(find "$SKILLS_HOME_DIR" -mindepth 1 -maxdepth 1 -type d -name 'rule-*' | wc -l | tr -d ' ')" = "26"
test -f "$SKILLS_HOME_DIR/rule-memory-system/SKILL.md"
test ! -e "$SKILLS_HOME_DIR/rule-council"
grep -q 'memories_1.sqlite' "$SKILLS_HOME_DIR/rule-memory-system/SKILL.md"
grep -q '\$rule-claim-verification' "$CODEX_HOME_DIR/AGENTS.md"
grep -qF 'Codebase hakkında varlık/yokluk/davranış iddiası' "$CODEX_HOME_DIR/AGENTS.md"
grep -qF 'Türkçe, kısa ve dürüst çalış' "$CODEX_HOME_DIR/AGENTS.md"
for folded in hakkinda varlik davranis kanit akisi dogrulamadan calistirma \
  Kullanicinin kirmizi ulasmadan Yapisal degisiklikte sozlesme \
  etkilesimde kurulmamis Turkce durust yalniz yuzeyleri
do
  if grep -qw "$folded" "$CODEX_HOME_DIR/AGENTS.md"; then
    echo "ASCII-folded Turkish word survived in AGENTS.md: $folded" >&2
    exit 1
  fi
done
grep -qF '<!-- codex-adapted-skill: vibecosystem-rule -->' \
  "$SKILLS_HOME_DIR/rule-memory-system/SKILL.md"

UNMANAGED_ROOT="$TEST_ROOT/unmanaged"
UNMANAGED_CODEX_HOME="$UNMANAGED_ROOT/.codex"
UNMANAGED_SKILLS_HOME="$UNMANAGED_ROOT/.agents/skills"
mkdir -p "$UNMANAGED_CODEX_HOME"
cp "$UNMANAGED_AGENTS_FIXTURE" "$UNMANAGED_CODEX_HOME/AGENTS.md"
if node "$EXTRAS" --rules \
  --codex-home "$UNMANAGED_CODEX_HOME" \
  --skills-home "$UNMANAGED_SKILLS_HOME" \
  >"$UNMANAGED_ROOT/no-force.out" 2>&1; then
  echo "markerless AGENTS.md was overwritten without --force" >&2
  exit 1
fi
grep -q -- '--force' "$UNMANAGED_ROOT/no-force.out"
grep -qF "$UNMANAGED_CODEX_HOME/AGENTS.md" "$UNMANAGED_ROOT/no-force.out"
cmp "$UNMANAGED_AGENTS_FIXTURE" "$UNMANAGED_CODEX_HOME/AGENTS.md"
test "$(find "$UNMANAGED_SKILLS_HOME" -mindepth 1 -maxdepth 1 -type d -name 'rule-*' 2>/dev/null | wc -l | tr -d ' ')" = "0"

node "$EXTRAS" --rules --force \
  --codex-home "$UNMANAGED_CODEX_HOME" \
  --skills-home "$UNMANAGED_SKILLS_HOME" \
  >"$UNMANAGED_ROOT/force.out"
UNMANAGED_BACKUP_ROOT="$UNMANAGED_ROOT/.agents/vibecosystem-backups"
test "$(find "$UNMANAGED_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = "1"
UNMANAGED_BACKUP_DIR="$(find "$UNMANAGED_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | head -1)"
basename "$UNMANAGED_BACKUP_DIR" | grep -Eq '^[0-9]{8}-[0-9]{6}-[0-9]+(-[0-9]+)?$'
cmp "$UNMANAGED_AGENTS_FIXTURE" "$UNMANAGED_BACKUP_DIR/codex/AGENTS.md"
grep -q '^# vibecosystem$' "$UNMANAGED_CODEX_HOME/AGENTS.md"

mkdir -p "$UNMANAGED_SKILLS_HOME/rule-custom"
cp "$USER_RULE_FIXTURE" "$UNMANAGED_SKILLS_HOME/rule-custom/SKILL.md"
node "$EXTRAS" --uninstall \
  --codex-home "$UNMANAGED_CODEX_HOME" \
  --skills-home "$UNMANAGED_SKILLS_HOME" \
  >"$UNMANAGED_ROOT/uninstall.out"
test -f "$UNMANAGED_SKILLS_HOME/rule-custom/SKILL.md"
cmp "$USER_RULE_FIXTURE" "$UNMANAGED_SKILLS_HOME/rule-custom/SKILL.md"
test ! -e "$UNMANAGED_SKILLS_HOME/rule-memory-system"
test ! -e "$UNMANAGED_CODEX_HOME/AGENTS.md"

MANAGED_ROOT="$TEST_ROOT/managed-edited"
MANAGED_CODEX_HOME="$MANAGED_ROOT/.codex"
MANAGED_SKILLS_HOME="$MANAGED_ROOT/.agents/skills"
mkdir -p "$MANAGED_CODEX_HOME"
cp "$MANAGED_EDITED_AGENTS_FIXTURE" "$MANAGED_CODEX_HOME/AGENTS.md"
node "$EXTRAS" --rules \
  --codex-home "$MANAGED_CODEX_HOME" \
  --skills-home "$MANAGED_SKILLS_HOME" \
  >"$MANAGED_ROOT/install.out"
MANAGED_BACKUP_ROOT="$MANAGED_ROOT/.agents/vibecosystem-backups"
test "$(find "$MANAGED_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = "1"
MANAGED_BACKUP_DIR="$(find "$MANAGED_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | head -1)"
cmp "$MANAGED_EDITED_AGENTS_FIXTURE" "$MANAGED_BACKUP_DIR/codex/AGENTS.md"
grep -q '^# vibecosystem$' "$MANAGED_CODEX_HOME/AGENTS.md"

echo "CODEX_RULE_OVERLAYS_VALIDATION_OK=1"

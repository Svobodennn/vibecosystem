#!/bin/bash
# vibecosystem installer for Codex CLI
# Installs skills into ~/.agents/skills/ and, when requested, the luna worker
# into ~/.codex/agents/. Existing user files are preserved by default.
#
# Usage: ./install-codex.sh [options]

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${HOME:-}" ] || [ "$HOME" = "/" ]; then
  echo "ERROR: HOME must be set to a non-root directory." >&2
  exit 2
fi

HOME_DIR="$HOME"
CODEX_DIR="$HOME_DIR/.codex"
CODEX_AGENT_DIR="$CODEX_DIR/agents"
SKILLS_ROOT="$HOME_DIR/.agents"
SKILLS_DIR="$SKILLS_ROOT/skills"
MANIFEST="$SKILLS_ROOT/.vibecosystem-codex-skills"
BACKUP_ROOT="$SKILLS_ROOT/vibecosystem-backups"
LUNA_SOURCE="$REPO_DIR/.codex/agents/luna-worker.toml"
LUNA_TARGET="$CODEX_AGENT_DIR/luna-worker.toml"

FORCE=false
DRY_RUN=false
PRUNE=false
INSTALL_LUNA_WORKER=false
VALIDATE_LUNA_WORKER=false
VALIDATION_ONLY=false
NON_INTERACTIVE=false
PROFILE="core"
PROFILE_EXPLICIT=false

ADDED=0
UPDATED=0
SKIPPED=0
PRUNED=0
PRESERVED=0
LUNA_INSTALLED=false
LUNA_SKIPPED=false
MANIFEST_DIRTY=false
MANIFEST_BACKED_UP=false
BACKUP_DIR=""

# This is the Codex core profile. It intentionally stays explicit so a repo
# expansion cannot silently change the small, predictable install profile.
CORE_SKILLS=(
  build
  cli-reference
  coding-standards
  commit
  completion-check
  dead-code
  debug
  explore
  factcheck-guard
  fix
  git-commits
  help
  modular-code
  notepad-system
  observe-before-editing
  plan-agent
  project-detect
  refactor
  review
  search-router
  search-tools
  security
  security-review
  strategic-compact
  system-overview
  tdd
  tdd-workflow
  test
  test-strategy
  tour
  verification-loop
  wiring
)

# Codex-safe full profile. This is intentionally explicit: adding a directory
# under skills/ never expands the Codex install surface without review.
CODEX_SKILLS=(
  accessibility-patterns
  accessibility-testing
  achievements
  agentica-claude-proxy
  agentica-infrastructure
  agentica-prompts
  agentica-sdk
  agentica-server
  agentica-spawn
  ai-slop-cleaner
  animation-patterns
  api-patterns
  api-versioning-patterns
  art-director
  ast-grep-find
  async-repl-protocol
  autonomous-pr
  aws-patterns
  azure-patterns
  backend-patterns
  bannerlord-modding
  better-accessibility
  better-colors
  better-interface
  better-layout
  better-typography
  better-ui
  better-writing
  brand-identity
  browser-automation
  browser-debugging
  build
  caching-patterns
  canary-deploy-patterns
  changelog-automation
  chaos-engineering
  ci-cd-pipeline
  ci-pipeline-patterns
  circuit-breaker
  cli-reference
  clickhouse-io
  clone-website
  code-knowledge-graph
  codex-orchestration
  coding-standards
  cognitive-modes
  commit
  commit-trailers
  competitive-analysis
  complete-skill
  completion-check
  compliance-patterns
  component-library-patterns
  compound-learnings
  concurrency-security
  config-security-scan
  content-marketing
  content-strategy
  continuity-ledger
  continuity_ledger
  continuous-learning
  continuous-learning-v2
  contract-testing-patterns
  cost-optimization-patterns
  create-handoff
  create_handoff
  cto-advisor
  data-pipeline-patterns
  dead-code
  debug
  deep-interview
  dependency-analysis-patterns
  describe-pr
  describe_pr
  design-system-generator
  design-to-code
  developer-relations
  diff-review-strategy
  differential-review
  django-patterns
  django-security
  django-tdd
  django-verification
  docker-ops
  elasticsearch-patterns
  email-infrastructure
  environment-triage
  error-boundary
  eval-harness
  event-driven-patterns
  experiment-engine
  experiment-loop
  explicit-identity
  explore
  external-skills-catalog
  factcheck-guard
  feature-flag-patterns
  firecrawl-scrape
  fix
  form-validation
  fp-check
  frontend-dev
  frontend-patterns
  fullstack-dev
  gate-check
  gcp-patterns
  gdpr-compliance
  git-commits
  github-actions-integration
  github-mcp
  github-search
  golang-patterns
  golang-testing
  graceful-degradation
  graphql-patterns
  growth-engineering
  grpc-patterns
  handoff-templates
  harvest-adaptive
  harvest-competitive
  harvest-deep-crawl
  harvest-monitor
  harvest-single
  harvest-structured
  help
  hipaa-compliance
  hizir
  idempotent-redundancy
  implement-plan
  implement-plan-micro
  implement-task
  implement_plan
  incident-response-patterns
  index-at-creation
  insecure-defaults
  iterative-retrieval
  java-coding-standards
  jpa-patterns
  kafka-patterns
  knowledge-graph
  knowledge-management
  kotlin-patterns
  kubernetes-patterns
  kvkk-compliance
  layered-recall
  learn
  llm-tuning-patterns
  load-testing-patterns
  loogle-search
  marketing-analytics
  math
  math-help
  math-router
  math-unified
  mcp-chaining
  mcp-registry
  mcp-scripts
  memory-palace
  migrate
  minimax-docx
  minimax-pdf
  minimax-xlsx
  modular-code
  mongodb-patterns
  morph-apply
  morph-search
  mot
  mutation-testing
  n8n-workflows
  nia-docs
  notepad-system
  oauth-patterns
  observability
  observe-before-editing
  onboard
  opc-architecture
  paywall-optimizer
  paywall-strategy
  pentest-methodology
  performance-testing
  perplexity-search
  persistent-planning
  phase-gated-commits
  pint-compute
  plan-agent
  plan-documentation
  postgres-patterns
  pptx-generator
  prd-writer
  premortem
  product-analytics
  project-audit
  project-detect
  project-guidelines-example
  project-pipeline
  prometheus-patterns
  prompt-engineering
  property-based-testing
  prove
  python-patterns
  python-testing
  pyxel-patterns
  qlty-check
  qlty-during-development
  rag-patterns
  recall
  recall-reasoning
  redis-patterns
  refactor
  reference-sdk
  release
  remember
  repo-research-analyst
  repoprompt
  reputation-patterns
  research
  research-agent
  research-external
  resilience-patterns
  resume-handoff
  resume_handoff
  revenuecat-patterns
  reverse-document
  review
  router-first-architecture
  saas-analytics-patterns
  saas-auth-patterns
  saas-launch-checklist
  saas-payment-patterns
  sast-patterns
  search-router
  search-tools
  secret-management-patterns
  secret-patterns
  secret-scanner
  security
  security-review
  self-healing
  seo-patterns
  server-components
  session-analysis-patterns
  session-compression
  shapely-compute
  sharp-edges
  skill-curator
  skill-developer
  skill-development
  skill-evolution
  skill-upgrader
  soc2-compliance
  springboot-patterns
  springboot-security
  springboot-tdd
  springboot-verification
  strategic-compact
  subscription-pricing
  supply-chain-security
  swift-patterns
  system-overview
  system_overview
  tdd
  tdd-migrate
  tdd-migration-pipeline
  tdd-workflow
  tech-radar-patterns
  terraform-patterns
  test
  test-strategy
  tldr-cli
  tldr-code
  tldr-deep
  tldr-overview
  tldr-router
  tldr-stats
  token-budget
  topic-resolver
  tour
  tracing-patterns
  ui-ux-patterns
  understand-codebase
  user-story-generator
  variant-analysis
  vector-db-patterns
  verification-loop
  visual-verdict
  vp-engineering
  websocket-patterns
  wiring
)

# Generic skills whose source prose names Claude runtime surfaces. Canonical
# sources stay untouched; these are transformed only in the Codex destination.
CODEX_ADAPTED_SKILLS=(
  build
  completion-check
  compound-learnings
  config-security-scan
  continuity-ledger
  continuity_ledger
  create-handoff
  create_handoff
  explore
  fix
  help
  hizir
  implement-plan
  implement-plan-micro
  implement-task
  implement_plan
  math
  migrate
  mot
  onboard
  opc-architecture
  plan-agent
  premortem
  prove
  refactor
  release
  repo-research-analyst
  reputation-patterns
  research-external
  resume-handoff
  resume_handoff
  review
  security
  skill-evolution
  skill-upgrader
  system-overview
  system_overview
  tdd
  tdd-migration-pipeline
  test
  wiring
)

usage() {
  cat <<'EOF'
Usage: ./install-codex.sh [options]

Install vibecosystem skills for Codex CLI into ~/.agents/skills/.

Options:
  --profile core|codex|full Install core, the Codex-safe allowlist, or all skills
  --install-luna-worker     Install .codex/agents/luna-worker.toml globally
  --validate-luna-worker    Validate the canonical luna worker contract
  --dry-run                 Show actions without writing user files
  --prune                   Remove only unchanged skills owned by this installer
  --force                   Replace existing destinations after making a backup
  --non-interactive         Skip the confirmation prompt
  --help, -h                Show this help

The default is a core, merge-style skill installation. Existing skills are
skipped unless --force is supplied. This installer never writes global
AGENTS.md; tools/codex-extras.mjs --rules owns that separate operation.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 2
}

is_valid_skill_name() {
  case "$1" in
    ""|*[!A-Za-z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}

assert_not_symlink() {
  local path="$1"
  if [ -L "$path" ]; then
    die "refusing to follow symlink: $path"
  fi
}

assert_safe_existing_paths() {
  assert_not_symlink "$SKILLS_ROOT"
  assert_not_symlink "$SKILLS_DIR"
  assert_not_symlink "$CODEX_DIR"
  assert_not_symlink "$CODEX_AGENT_DIR"
  assert_not_symlink "$MANIFEST"
  assert_not_symlink "$BACKUP_ROOT"
  assert_not_symlink "$LUNA_TARGET"
}

ensure_directory() {
  local path="$1"
  assert_not_symlink "$path"
  if [ -e "$path" ] && [ ! -d "$path" ]; then
    die "expected a directory but found another file type: $path"
  fi
  if [ "$DRY_RUN" = false ]; then
    mkdir -p "$path"
  fi
}

selected_skill_names() {
  case "$PROFILE" in
    core) printf '%s\n' "${CORE_SKILLS[@]}" ;;
    codex) printf '%s\n' "${CODEX_SKILLS[@]}" ;;
    full) find "$REPO_DIR/skills" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort ;;
  esac
}

is_codex_adapted_skill() {
  local needle="$1"
  local name
  for name in "${CODEX_ADAPTED_SKILLS[@]}"; do
    [ "$name" = "$needle" ] && return 0
  done
  return 1
}

selected_contains() {
  local needle="$1"
  local skill_name
  for skill_name in "${SELECTED_SKILLS[@]}"; do
    [ "$skill_name" = "$needle" ] && return 0
  done
  return 1
}

MANAGED_NAMES=()
MANAGED_HASHES=()

set_manifest_entry() {
  local name="$1"
  local hash="$2"
  local i=0
  while [ "$i" -lt "${#MANAGED_NAMES[@]}" ]; do
    if [ "${MANAGED_NAMES[$i]}" = "$name" ]; then
      MANAGED_HASHES[i]="$hash"
      MANIFEST_DIRTY=true
      return
    fi
    i=$((i + 1))
  done
  MANAGED_NAMES[${#MANAGED_NAMES[@]}]="$name"
  MANAGED_HASHES[${#MANAGED_HASHES[@]}]="$hash"
  MANIFEST_DIRTY=true
}

remove_manifest_entry() {
  local name="$1"
  local i=0
  local found=false
  local new_names=()
  local new_hashes=()
  while [ "$i" -lt "${#MANAGED_NAMES[@]}" ]; do
    if [ "${MANAGED_NAMES[$i]}" = "$name" ]; then
      found=true
    else
      new_names[${#new_names[@]}]="${MANAGED_NAMES[$i]}"
      new_hashes[${#new_hashes[@]}]="${MANAGED_HASHES[$i]}"
    fi
    i=$((i + 1))
  done
  if [ "$found" = true ]; then
    MANAGED_NAMES=("${new_names[@]}")
    MANAGED_HASHES=("${new_hashes[@]}")
    MANIFEST_DIRTY=true
  fi
}

managed_hash_for() {
  local needle="$1"
  local i=0
  while [ "$i" -lt "${#MANAGED_NAMES[@]}" ]; do
    if [ "${MANAGED_NAMES[$i]}" = "$needle" ]; then
      printf '%s\n' "${MANAGED_HASHES[$i]}"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}

load_manifest() {
  [ -e "$MANIFEST" ] || return 0
  [ -f "$MANIFEST" ] || die "ownership manifest is not a regular file: $MANIFEST"

  local name
  local hash
  while IFS=$'\t' read -r name hash; do
    [ -n "$name" ] || continue
    case "$name" in
      \#*) continue ;;
    esac
    is_valid_skill_name "$name" || die "invalid skill name in ownership manifest: $name"
    [ -n "$hash" ] || die "missing hash for $name in ownership manifest"
    set_manifest_entry "$name" "$hash"
  done < "$MANIFEST"
  MANIFEST_DIRTY=false
}

HASH_MODE="none"
if command -v shasum >/dev/null 2>&1; then
  HASH_MODE="shasum"
elif command -v sha256sum >/dev/null 2>&1; then
  HASH_MODE="sha256sum"
fi

hash_file() {
  case "$HASH_MODE" in
    shasum) shasum -a 256 "$1" ;;
    sha256sum) sha256sum "$1" ;;
    *) printf 'unverified  %s\n' "$1" ;;
  esac
}

hash_skill() {
  local directory="$1"
  if [ "$HASH_MODE" = "none" ]; then
    printf 'unverified\n'
    return 0
  fi
  if [ "$HASH_MODE" = "shasum" ]; then
    (
      cd "$directory"
      find . -type f -print | LC_ALL=C sort | while IFS= read -r file; do
        hash_file "$file"
      done
    ) | shasum -a 256 | awk '{print $1}'
  else
    (
      cd "$directory"
      find . -type f -print | LC_ALL=C sort | while IFS= read -r file; do
        hash_file "$file"
      done
    ) | sha256sum | awk '{print $1}'
  fi
}

ensure_backup_directory() {
  [ "$DRY_RUN" = true ] && return 0
  assert_not_symlink "$SKILLS_ROOT"
  assert_not_symlink "$BACKUP_ROOT"
  if [ -e "$BACKUP_ROOT" ] && [ ! -d "$BACKUP_ROOT" ]; then
    die "backup path is not a directory: $BACKUP_ROOT"
  fi
  mkdir -p "$BACKUP_ROOT"
  if [ -z "$BACKUP_DIR" ]; then
    local stamp
    local candidate
    local suffix=0
    stamp="$(date +%Y%m%d-%H%M%S)"
    candidate="$BACKUP_ROOT/$stamp-$$"
    while [ -e "$candidate" ]; do
      suffix=$((suffix + 1))
      candidate="$BACKUP_ROOT/$stamp-$$-$suffix"
    done
    mkdir -p "$candidate"
    BACKUP_DIR="$candidate"
  fi
}

backup_existing_path() {
  local source="$1"
  local label="$2"
  local candidate
  local suffix=0

  [ -e "$source" ] || return 0
  [ -L "$source" ] && die "refusing to back up symlink: $source"
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] would back up $source under $BACKUP_ROOT"
    return 0
  fi

  ensure_backup_directory
  candidate="$BACKUP_DIR/$label"
  mkdir -p "$(dirname "$candidate")"
  while [ -e "$candidate" ]; do
    suffix=$((suffix + 1))
    candidate="$BACKUP_DIR/$label.$suffix"
  done
  if [ -d "$source" ]; then
    cp -R "$source" "$candidate"
  else
    cp -p "$source" "$candidate"
  fi
}

backup_manifest_if_needed() {
  if [ "$MANIFEST_BACKED_UP" = false ] && [ -e "$MANIFEST" ]; then
    backup_existing_path "$MANIFEST" "manifest"
    MANIFEST_BACKED_UP=true
  fi
}

remove_owned_path() {
  local path="$1"
  case "$path" in
    "$SKILLS_DIR"/*|"$LUNA_TARGET") ;;
    *) die "refusing to remove path outside installer targets: $path" ;;
  esac
  [ -L "$path" ] && die "refusing to remove symlink: $path"
  [ "$path" != "$SKILLS_DIR" ] || die "refusing to remove skills root"
  rm -rf "$path"
}

write_manifest() {
  [ "$MANIFEST_DIRTY" = true ] || return 0
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] would update ownership manifest: $MANIFEST"
    return 0
  fi

  ensure_directory "$SKILLS_ROOT"
  backup_manifest_if_needed
  local temporary="$MANIFEST.tmp.$$"
  {
    printf '# Managed by vibecosystem install-codex.sh; do not edit for ownership tracking.\n'
    local i=0
    while [ "$i" -lt "${#MANAGED_NAMES[@]}" ]; do
      printf '%s\t%s\n' "${MANAGED_NAMES[$i]}" "${MANAGED_HASHES[$i]}"
      i=$((i + 1))
    done
  } > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$MANIFEST"
  MANIFEST_DIRTY=false
}

validate_luna_worker() {
  [ -f "$LUNA_SOURCE" ] || die "canonical luna worker file is missing: $LUNA_SOURCE"
  command -v python3 >/dev/null 2>&1 || die "python3 is required to validate $LUNA_SOURCE"

  PYTHONDONTWRITEBYTECODE=1 python3 - "$LUNA_SOURCE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
expected = {
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

try:
    import tomllib
except ModuleNotFoundError:
    expected_text = (
        'name = "luna_worker"\n'
        'description = "Bounded repository worker for implementation and verification."\n'
        'developer_instructions = """\n'
        'Work only within the assigned repository and task scope.\n'
        'Inspect the relevant files before changing anything.\n'
        'Do not spawn subagents or background workers unless the user explicitly requests it.\n'
        'Do not run unrelated automation, broad skill scans, or automatic memory recall.\n'
        'Make the smallest complete change, then run focused verification.\n'
        'Stop and ask when the task requires destructive action, external authority, credentials, or an unclear product decision.\n'
        'Return a concise report with result, changed paths, verification performed, and caveats.\n'
        '"""\n'
        'model = "gpt-5.6-luna"\n'
        'model_reasoning_effort = "max"\n'
    )
    if path.read_text() != expected_text:
        raise SystemExit("LUNA_WORKER_VALID=0: canonical text does not match")
    print("LUNA_WORKER_VALID=1 (canonical text; tomllib unavailable)")
else:
    with path.open("rb") as handle:
        actual = tomllib.load(handle)
    if actual != expected:
        raise SystemExit(f"LUNA_WORKER_VALID=0: parsed contract mismatch: {actual!r}")
    print("LUNA_WORKER_VALID=1")
PY
}

prune_stale_skills() {
  [ "$PRUNE" = true ] || return 0
  if [ ! -f "$MANIFEST" ]; then
    echo "Prune: no vibecosystem ownership manifest found; no skills removed."
    return 0
  fi

  local i=0
  local name
  local expected
  local destination
  local current
  local nested_symlink
  while [ "$i" -lt "${#MANAGED_NAMES[@]}" ]; do
    name="${MANAGED_NAMES[$i]}"
    expected="${MANAGED_HASHES[$i]}"
    if selected_contains "$name"; then
      i=$((i + 1))
      continue
    fi

    destination="$SKILLS_DIR/$name"
    if [ ! -e "$destination" ] && [ ! -L "$destination" ]; then
      remove_manifest_entry "$name"
      continue
    fi
    if [ -L "$destination" ]; then
      echo "Prune: preserving symlink $destination"
      PRESERVED=$((PRESERVED + 1))
      i=$((i + 1))
      continue
    fi
    nested_symlink="$(find "$destination" -type l -print -quit)"
    if [ -n "$nested_symlink" ]; then
      echo "Prune: preserving skill containing symlink $destination"
      PRESERVED=$((PRESERVED + 1))
      i=$((i + 1))
      continue
    fi
    if [ ! -d "$destination" ] || [ "$HASH_MODE" = "none" ] || [ "$expected" = "unverified" ]; then
      echo "Prune: preserving unverified or non-directory skill $destination"
      PRESERVED=$((PRESERVED + 1))
      i=$((i + 1))
      continue
    fi

    current="$(hash_skill "$destination")"
    if [ "$current" != "$expected" ]; then
      echo "Prune: preserving changed skill $destination"
      PRESERVED=$((PRESERVED + 1))
      i=$((i + 1))
      continue
    fi

    if [ "$DRY_RUN" = true ]; then
      echo "  [dry-run] would prune owned skill: $destination"
      PRUNED=$((PRUNED + 1))
      remove_manifest_entry "$name"
      continue
    fi
    backup_existing_path "$destination" "skills/$name"
    remove_owned_path "$destination"
    PRUNED=$((PRUNED + 1))
    remove_manifest_entry "$name"
  done
}

adapt_codex_skill() {
  local directory="$1"
  command -v node >/dev/null 2>&1 || die "node is required to adapt Codex profile skills"
  node --input-type=module - "$directory" <<'NODE'
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = process.argv[2];
const marker = '<!-- codex-adapted-skill -->';
const skillSlug = basename(root);
const agentAliases = Object.freeze({
  aegis: 'security-reviewer',
  atlas: 'qa-engineer',
  critic: 'code-reviewer',
  'discovery-interview': 'business-analyst',
  'general-purpose': 'default',
  implement_task: 'default',
  onboard: 'scout',
  'plan-agent': 'planner',
  premortem: 'plan-reviewer',
  'research-codebase': 'scout',
  scribe: 'technical-writer',
});
const specialHashes = Object.freeze({
  help: '991eecf4d91b8d10c3e7a1928e8d29b20de31c1eaee62c446ef9750542f8a23a',
  hizir: '420781cba38858317b58ebc10ec8b761441a4573d27300ee6f17327963d4b90c',
  'system-overview': '4d40c390527fa429b3f827ebda1ee1d9d3b1f2c501417577347287f5c17e89b4',
  system_overview: '7d69e0e910deff8eb649868a9852b674cd79954e8970f3b859ef8db5c1e86ea6',
});

function systemOverview(name) {
  return [
    '---',
    `name: ${name}`,
    'description: Inspect and explain the installed Codex vibecosystem layers without inventing inventory or activation state.',
    '---',
    '',
    '# Codex vibecosystem overview',
    '',
    'Build the overview from runtime evidence, never from fixed counts:',
    '',
    '1. Count discoverable skills under `~/.agents/skills/*/SKILL.md`.',
    '2. Read `~/.codex/agents/*.toml` and the managed `[agents]` block in `~/.codex/config.toml`.',
    '3. Read global `~/.codex/AGENTS.md` and installed `rule-*` skills.',
    '4. If `~/.codex/hooks.json` exists, use `/hooks` to distinguish trusted/active handlers from pending ones.',
    '5. Describe only tools exposed in the current session.',
    '',
    'Memory is Codex-native. Use the supported memory surface when exposed; do not edit or query `memories_1.sqlite` directly.',
    '',
    'Report each layer as `present`, `missing`, or `pending`, cite the path inspected, and avoid claims about automatic learning, background agents, hook enforcement, or fixed inventory unless the current runtime proves them.',
  ].join('\n');
}

const specialSkills = Object.freeze({
  help: [
    '---',
    'name: help',
    'description: Discover the skills, custom agents, rules, hooks, and tools actually available in the current Codex environment.',
    '---',
    '',
    '# Codex workspace discovery',
    '',
    'Use `request_user_input` when the user wants guided discovery. Start from their goal, then inspect runtime inventory before recommending anything.',
    '',
    '## Evidence sources',
    '',
    '- Skills: `~/.agents/skills/*/SKILL.md`',
    '- Custom agents: `~/.codex/agents/*.toml` and `[agents]` in `~/.codex/config.toml`',
    '- Global guardrails: `~/.codex/AGENTS.md` and `rule-*` skills',
    '- Hooks: `~/.codex/hooks.json`; use `/hooks` to verify trust and activation',
    '- Session tools: the tool surface exposed to the current request',
    '',
    '## Response contract',
    '',
    '1. Show only installed/discoverable capabilities.',
    '2. Recommend a matching `$skill-name` or installed agent role.',
    '3. Mark missing and pending capabilities explicitly.',
    '4. Never infer model tiers, hook trust, memory contents, or agent availability from canonical repo files alone.',
    '',
    'Useful starting points, only when installed: `$explore`, `$fix`, `$build`, `$tdd`, `$review`, `$security`, `$test`, and `$refactor`.',
  ].join('\n'),
  hizir: [
    '---',
    'name: hizir',
    'description: Hızır için Codex-native kullanım kılavuzu; yalnız kurulu runtime envanterini anlatır.',
    '---',
    '',
    '# Hızır — Codex çalışma yüzeyi',
    '',
    'Türkçe, kısa ve kanıta dayalı çalış. Sabit agent/skill/hook sayısı verme; önce runtime envanterini oku.',
    '',
    '## Envanter kapısı',
    '',
    '1. Skill için `~/.agents/skills/<ad>/SKILL.md` dosyasını doğrula ve `$skill-name` sözdizimini kullan.',
    '2. Agent için `~/.codex/agents/*.toml` ile `[agents]` config rosterını oku; yalnız kurulu rolü öner veya parent context içinde çalış.',
    '3. Hook için `~/.codex/hooks.json` varlığını ve `/hooks` trust durumunu kontrol et. Trusted değilse enforcement aktif değildir.',
    '4. Memory için yalnız desteklenen Codex memory yüzeyini kullan; SQLite storeuna doğrudan yazma.',
    '',
    '## İş akışları',
    '',
    'Kuruluysa `$build`, `$fix`, `$explore`, `$plan-agent`, `$review`, `$security`, `$tdd`, `$test`, `$refactor`, `$release` ve `$commit` kullanılabilir. Kullanıcı açıkça çoklu çalışma isterse parent context `spawn_agent` ile yalnız bağımsız işleri dağıtır; leaf agentlar başka agent başlatmaz.',
    '',
    'Her sonuçta yapılan işi, gerçek doğrulamayı, kalan belirsizliği ve gerekiyorsa kullanıcı aksiyonunu açıkça bildir. Kurulu olmayan komut, otomatik öğrenme, arka plan daemonu veya ekip davranışı uydurma.',
  ].join('\n'),
  'system-overview': systemOverview('system-overview'),
  system_overview: systemOverview('system_overview'),
});

function markdownFiles(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

function stripFrontmatterKeys(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return text;
  const header = text.slice(4, end).split('\n');
  const kept = [];
  let skipContinuation = false;
  for (const line of header) {
    if (/^(?:allowed-tools|tools):\s*/.test(line)) {
      skipContinuation = !/:\s*\S/.test(line);
      continue;
    }
    if (skipContinuation && /^\s+(?:-|\S)/.test(line)) continue;
    skipContinuation = false;
    kept.push(line);
  }
  return `---\n${kept.join('\n')}\n---\n${text.slice(end + 5)}`;
}

function adaptRequiredFrontmatter(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return text;
  const header = text.slice(4, end).split('\n').map((line) =>
    line.startsWith('description: ')
      ? line.replace('.claude/ directory', 'Codex configuration')
      : line);
  return `---\n${header.join('\n')}\n---\n${text.slice(end + 5)}`;
}

function validateRequiredSkillFrontmatter(text, path) {
  if (basename(path) !== 'SKILL.md') return;
  if (!text.startsWith('---\n')) throw new Error(`missing frontmatter in ${path}`);
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) throw new Error(`unterminated frontmatter in ${path}`);
  const header = text.slice(4, end).split('\n');
  if (!header.some((line) => /^description:\s*\S/.test(line))) {
    throw new Error(`missing required frontmatter description in ${path}`);
  }
}

function insertMarker(text, note) {
  if (text.includes(marker)) return text;
  const insertion = `${marker}\n${note ? `${note}\n` : ''}`;
  if (!text.startsWith('---\n')) return `${insertion}\n${text}`;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return `${insertion}\n${text}`;
  return `${text.slice(0, end + 5)}\n${insertion}${text.slice(end + 5)}`;
}

function removeClaudePathContent(text) {
  const lines = text.split('\n');
  const output = [];
  let block = null;
  let removed = false;
  for (const line of lines) {
    if (block) {
      block.push(line);
      if (/^\s*```/.test(line)) {
        if (block.some((item) => /\.claude\//.test(item))) {
          output.push('> Codex adapter: Claude-only artifact/hook example omitted; inspect the current Codex runtime and use a manual fallback.');
          removed = true;
        } else {
          output.push(...block);
        }
        block = null;
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      block = [line];
      continue;
    }
    if (/\.claude\//.test(line)) {
      removed = true;
      continue;
    }
    output.push(line);
  }
  if (block) {
    if (block.some((item) => /\.claude\//.test(item))) removed = true;
    else output.push(...block);
  }
  return { text: output.join('\n'), removed };
}

function adaptSlashSkills(text) {
  const aliases = {
    build: 'build', explore: 'explore', fix: 'fix', review: 'review',
    security: 'security', tdd: 'tdd', test: 'test', refactor: 'refactor',
    release: 'release', mot: 'mot', onboard: 'onboard', prove: 'prove',
    migrate: 'migrate', commit: 'commit', 'plan-agent': 'plan-agent',
    plan: 'plan-agent', 'project-detect': 'project-detect', learn: 'learn',
    debug: 'debug', e2e: 'test', 'test-driven-development': 'tdd',
  };
  let adapted = text;
  for (const [from, to] of Object.entries(aliases)) {
    for (const suffix of [' ', '\n', '`', '"', "'", ')', '>']) {
      adapted = adapted.replaceAll('/' + from + suffix, '$' + to + suffix);
    }
  }
  return adapted;
}

function adaptAgentAliases(text) {
  return text.replace(/(agent_type\s*[=:]\s*["'])([\w-]+)(["'])/g, (_match, before, role, after) => {
    const mapped = agentAliases[role] || role;
    return `${before}${mapped === 'default' ? mapped : mapped.replaceAll('-', '_')}${after}`;
  });
}

function adaptProseAgentAliases(text) {
  const bySkill = {
    build: { 'discovery-interview': 'business-analyst', 'research-codebase': 'scout' },
    release: { aegis: 'security-reviewer', atlas: 'qa-engineer', scribe: 'technical-writer' },
    review: { aegis: 'security-reviewer', critic: 'code-reviewer', judge: 'code-reviewer' },
    security: { aegis: 'security-reviewer' },
    test: { atlas: 'qa-engineer' },
    'tdd-migration-pipeline': { atlas: 'qa-engineer', critic: 'code-reviewer', judge: 'code-reviewer', validator: 'qa-engineer' },
  };
  let adapted = text;
  for (const [from, to] of Object.entries(bySkill[skillSlug] || {})) {
    adapted = adapted.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return adapted
    .replace('[Contents of business-analyst SKILL.md]', '[Interview task, user answers, and current feature context]')
    .replace('[Contents of scout SKILL.md]', '[Bounded codebase research task and current project context]');
}

for (const path of markdownFiles(root)) {
  const raw = readFileSync(path, 'utf8');
  let text = raw.replace(/\r\n/g, '\n');
  if (basename(path) === 'SKILL.md' && specialSkills[skillSlug]) {
    const actual = createHash('sha256').update(raw).digest('hex');
    if (actual !== specialHashes[skillSlug]) {
      throw new Error(`canonical ${skillSlug}/SKILL.md changed; review its Codex-native adaptation before installing`);
    }
    text = specialSkills[skillSlug];
  }
  text = text.replace(/\bTask\(\s*([\w-]+)\s*\):\s*"([\s\S]*?)"/g, (_match, role, message) => {
    const mapped = agentAliases[role] || role;
    const codexRole = mapped === 'default' ? mapped : mapped.replaceAll('-', '_');
    return `spawn_agent(task_name="${codexRole}_task", agent_type="${codexRole}", message="${message}")`;
  });
  text = adaptRequiredFrontmatter(stripFrontmatterKeys(text))
    .replaceAll('AskUserQuestion', 'request_user_input')
    .replace(/\bTask\((?!s\))/g, 'spawn_agent(')
    .replace(/\bTask tool\b/g, 'spawn_agent tool')
    .replaceAll('subagent_type', 'agent_type')
    .replaceAll('TaskOutput', 'wait_agent')
    .replaceAll('TodoWrite', 'update_plan')
    .replaceAll('ExitPlanMode', 'explicit user approval')
    .replace(/,?\s*run_in_background\s*=\s*(?:true|false)/g, '')
    .replace(/,?\s*model\s*=\s*["']claude[^"']*["']/gi, '')
    .replace(/\bprompt\s*=/g, 'message=')
    .replace(/\bSkill\(\s*["']?([\w-]+)["']?\s*\)/g, (_match, name) => `$${name}`)
    .replace(/(?:~\/)?\.claude\/rules\/([\w-]+)\.md/g, '~/.agents/skills/rule-$1/SKILL.md')
    .replace(/(?:~\/)?\.claude\/skills\/([\w-]+)\/SKILL\.md/g, '~/.agents/skills/$1/SKILL.md')
    .replace(/(?:~\/)?\.claude\/agents\//g, '~/.codex/agents/')
    .replaceAll('Claude Code', 'Codex')
    .replace(/\bClaude:/g, 'Codex:')
    .replaceAll('Claude routes', 'Codex routes')
    .replaceAll('$CLAUDE_PROJECT_DIR', '$PWD');
  text = adaptProseAgentAliases(adaptAgentAliases(adaptSlashSkills(text)));
  text = text.replace(/\bspawn_agent\((\s*)(?=agent_type\s*=)/g, (_match, whitespace) =>
    `spawn_agent(${whitespace}task_name="delegated_task",${whitespace}`);
  text = text.replace(/\bspawn_agent\(\s*\)/g, 'spawn_agent(task_name="delegated_task", message="<bounded task>")');
  const filtered = removeClaudePathContent(text);
  text = filtered.text;
  const removedClaudePath = filtered.removed;
  const note = removedClaudePath
    ? '> Codex adapter: Claude-only path/hook steps were removed. A hook-dependent step is active only when a matching handler exists in `~/.codex/hooks.json` and is trusted; otherwise use a manual fallback.'
    : '> Codex adapter: use `spawn_agent`, `wait_agent`, `request_user_input`, and `$skill-name` only through surfaces exposed in the current Codex session.';
  text = insertMarker(text.replace(/\n{3,}/g, '\n\n'), note);
  validateRequiredSkillFrontmatter(text, path);
  writeFileSync(path, text);
}
NODE
}

copy_skill_source() {
  local name="$1"
  local source="$2"
  local destination="$3"
  cp -R "$source" "$destination"
  if [ "$PROFILE" = "codex" ] && is_codex_adapted_skill "$name"; then
    adapt_codex_skill "$destination"
  fi
}

install_skill() {
  local name="$1"
  local source="$REPO_DIR/skills/$name"
  local destination="$SKILLS_DIR/$name"
  local expected=""
  local current=""
  local nested_symlink=""

  if [ -e "$destination" ] || [ -L "$destination" ]; then
    [ -L "$destination" ] && die "refusing to overwrite symlink: $destination"
    if [ "$FORCE" = true ]; then
      if [ "$DRY_RUN" = true ]; then
        echo "  [dry-run] would back up and replace skill: $destination"
        UPDATED=$((UPDATED + 1))
      else
        backup_existing_path "$destination" "skills/$name"
        remove_owned_path "$destination"
        copy_skill_source "$name" "$source" "$destination"
        set_manifest_entry "$name" "$(hash_skill "$destination")"
        UPDATED=$((UPDATED + 1))
      fi
    else
      expected="$(managed_hash_for "$name" || true)"
      if [ -d "$destination" ] && [ "$HASH_MODE" != "none" ] && \
         [ -n "$expected" ] && [ "$expected" != "unverified" ]; then
        nested_symlink="$(find "$destination" -type l -print -quit)"
        if [ -z "$nested_symlink" ]; then
          current="$(hash_skill "$destination")"
        fi
      fi
      if [ -n "$current" ] && [ "$current" = "$expected" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "  [dry-run] would back up and refresh owned skill: $destination"
        else
          backup_existing_path "$destination" "skills/$name"
          remove_owned_path "$destination"
          copy_skill_source "$name" "$source" "$destination"
          set_manifest_entry "$name" "$(hash_skill "$destination")"
        fi
        UPDATED=$((UPDATED + 1))
      else
        SKIPPED=$((SKIPPED + 1))
      fi
    fi
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] would install skill: $name"
    ADDED=$((ADDED + 1))
  else
    copy_skill_source "$name" "$source" "$destination"
    set_manifest_entry "$name" "$(hash_skill "$destination")"
    ADDED=$((ADDED + 1))
  fi
}

install_skills() {
  local name
  ensure_directory "$SKILLS_DIR"
  echo "Installing profile '$PROFILE' (${#SELECTED_SKILLS[@]} skills) to $SKILLS_DIR"
  for name in "${SELECTED_SKILLS[@]}"; do
    install_skill "$name"
  done
}

install_luna_worker() {
  ensure_directory "$CODEX_AGENT_DIR"
  if [ -e "$LUNA_TARGET" ] || [ -L "$LUNA_TARGET" ]; then
    [ -L "$LUNA_TARGET" ] && die "refusing to overwrite symlink: $LUNA_TARGET"
    if [ "$FORCE" = true ]; then
      if [ "$DRY_RUN" = true ]; then
        echo "  [dry-run] would back up and replace luna worker: $LUNA_TARGET"
      else
        backup_existing_path "$LUNA_TARGET" "codex/agents/luna-worker.toml"
        remove_owned_path "$LUNA_TARGET"
        cp -p "$LUNA_SOURCE" "$LUNA_TARGET"
      fi
      LUNA_INSTALLED=true
    else
      echo "Luna worker already exists; preserving $LUNA_TARGET"
      LUNA_SKIPPED=true
    fi
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] would install luna worker: $LUNA_TARGET"
  else
    cp -p "$LUNA_SOURCE" "$LUNA_TARGET"
  fi
  LUNA_INSTALLED=true
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --prune)
      PRUNE=true
      ;;
    --install-luna-worker)
      INSTALL_LUNA_WORKER=true
      ;;
    --validate-luna-worker)
      VALIDATE_LUNA_WORKER=true
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
      ;;
    --profile)
      [ "$#" -ge 2 ] || die "--profile requires core, codex, or full"
      PROFILE="$2"
      PROFILE_EXPLICIT=true
      shift
      ;;
    --profile=*)
      PROFILE="${1#*=}"
      PROFILE_EXPLICIT=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1 (use --help for usage)"
      ;;
  esac
  shift
done

case "$PROFILE" in
  core|codex|full) ;;
  *) die "unsupported profile '$PROFILE'; choose core, codex, or full" ;;
esac

SELECTED_SKILLS=()
while IFS= read -r skill_name; do
  [ -n "$skill_name" ] || continue
  is_valid_skill_name "$skill_name" || die "invalid skill name in $PROFILE profile: $skill_name"
  [ -d "$REPO_DIR/skills/$skill_name" ] || die "profile $PROFILE references missing skill: $skill_name"
  SELECTED_SKILLS[${#SELECTED_SKILLS[@]}]="$skill_name"
done < <(selected_skill_names)

if [ "$VALIDATE_LUNA_WORKER" = true ] && \
   [ "$INSTALL_LUNA_WORKER" = false ] && \
   [ "$PROFILE_EXPLICIT" = false ] && \
   [ "$FORCE" = false ] && \
   [ "$PRUNE" = false ]; then
  VALIDATION_ONLY=true
fi

if [ "$VALIDATION_ONLY" = true ]; then
  validate_luna_worker
  exit 0
fi

assert_safe_existing_paths
load_manifest

if [ "$VALIDATE_LUNA_WORKER" = true ] || [ "$INSTALL_LUNA_WORKER" = true ]; then
  validate_luna_worker
fi

echo "vibecosystem installer for Codex CLI"
echo "====================================="
echo "Profile: $PROFILE"
echo "Skills target: $SKILLS_DIR"
if [ "$INSTALL_LUNA_WORKER" = true ]; then
  echo "Luna worker target: $LUNA_TARGET"
fi
if [ "$PRUNE" = true ]; then
  echo "Prune: owned, unchanged skills only"
fi
if [ "$DRY_RUN" = true ]; then
  echo "Mode: DRY RUN (no user files will be written)"
elif [ "$FORCE" = true ]; then
  echo "Mode: OVERWRITE (--force) with backups"
else
  echo "Mode: MERGE (existing user files preserved)"
fi
echo "Global AGENTS.md copy: disabled"
echo ""

if [ "$DRY_RUN" = false ] && [ "$NON_INTERACTIVE" = false ]; then
  read -p "Continue? (y/N) " -n 1 -r
  echo
  [[ "$REPLY" =~ ^[Yy]$ ]] || exit 0
fi

if [ "$DRY_RUN" = false ]; then
  ensure_directory "$SKILLS_ROOT"
  if [ "$INSTALL_LUNA_WORKER" = true ]; then
    ensure_directory "$CODEX_DIR"
  fi
fi

prune_stale_skills
install_skills
if [ "$INSTALL_LUNA_WORKER" = true ]; then
  install_luna_worker
fi
write_manifest

echo ""
if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete. No user files were changed."
else
  echo "Installation complete."
fi
echo "  Added:   $ADDED skills"
echo "  Updated: $UPDATED skills"
echo "  Skipped: $SKIPPED skills"
echo "  Pruned:  $PRUNED skills"
echo "  Preserved during prune: $PRESERVED"
if [ "$LUNA_INSTALLED" = true ]; then
  echo "  Luna worker: $LUNA_TARGET"
elif [ "$LUNA_SKIPPED" = true ]; then
  echo "  Luna worker: existing file preserved"
fi
if [ -n "$BACKUP_DIR" ]; then
  echo "  Backup: $BACKUP_DIR"
fi
echo "  Ownership manifest: $MANIFEST"

if [ "$SKIPPED" -gt 0 ] && [ "$FORCE" = false ]; then
  echo "Tip: use --force to replace existing skills after a backup."
fi

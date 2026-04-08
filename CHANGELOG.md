# Changelog

All notable changes to vibecosystem will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned
- Community contribution workflow
- Skill marketplace

## [3.1.0] - 2026-04-08

### Added
- **Achievement System** (`skills/achievements/` + `hooks/src/achievement-tracker.ts`): Steam-style gamification
  - 25 achievements across 5 skill trees (Code Warrior, Bug Slayer, Architecture Master, Security Guardian, Team Player)
  - XP, levels (1-50), daily streaks with multipliers
  - State in `~/.claude/achievements.json`
- **Experiment Loop** (`skills/experiment-loop/`): Autonomous optimize-test-keep/discard loop
  - Hypothesize > Modify > Test > Evaluate > Decide, max 10 per run
  - Git stash safety, results in `thoughts/EXPERIMENTS.md`
- **Darwinian Skill Evolution** (`skills/skill-evolution/`): Self-improving skills
  - 5-dimension scoring (accuracy, relevance, token efficiency, satisfaction, reusability)
  - Crystallization at 90+ score, auto-repair below 30
- **Self-Healing Codebase** (`skills/self-healing/`): Auto-repair pipeline
  - 4-phase: Detect > Diagnose > Fix > Validate, confidence gate at 80%
  - Git stash safety, scope limits (never auto-fix security/DB/auth)
- **Agent Tamagotchi** (`skills/agent-tamagotchi/` + `hooks/src/tamagotchi-engine.ts`): Terminal pet
  - 12 species deterministic from username, 5 stats, 7 moods
  - Reacts to workflow: happy on test pass, sad on build fail
- **Auto Art Director** (`skills/art-director/`): AI image generation direction
  - 5-component prompt formula (Subject, Style, Composition, Lighting, Technical)
  - Templates for banners, diagrams, social media, presentations

### Changed
- Updated counts: 139 agents, 293 skills, 71 hooks, 20 rules

## [3.0.1] - 2026-04-08

### Added
- **Memory Palace system** (`skills/memory-palace/SKILL.md`): Hierarchical memory organization
  - Wings (projects) > Rooms (domains) > Drawers (decisions)
  - Flat JSONL storage in `~/.claude/palace/`
  - Auto room detection from 10 domain categories
- **Session Compression** (`skills/session-compression/SKILL.md`): ACDE format for context compression
  - Actions, Context, Decisions, Entities extraction
  - 10-30x token reduction while preserving all actionable info
- **Layered Recall** (`skills/layered-recall/SKILL.md`): 4-layer progressive memory loading
  - L1: Identity (always, ~200 tokens), L2: Facts (per-project, ~500 tokens)
  - L3: Room recall (on-demand), L4: Deep search (explicit)
  - 4-6x token savings vs loading everything
- **Palace auto-save hook** (`hooks/src/palace-auto-save.ts`): Auto-detects decisions/discoveries from agent outputs
- **Session compressor hook** (`hooks/src/session-compressor.ts`): ACDE compression before context window fills
- **Palace recall hook** (`hooks/src/palace-recall.ts`): Loads Layer 1-2 memories at session start

### Changed
- Updated counts: 139 agents, 288 skills, 69 hooks, 20 rules
- Anthropic marketplace submission

## [3.0.0] - 2026-04-07

### Added
- **npm package**: `npx vibecosystem init` one-command install (`bin/cli.mjs`)
  - Profile selection: `npx vibecosystem init --profile frontend`
  - Health check: `npx vibecosystem doctor`
  - Force mode: `npx vibecosystem init --force`
- **plugin.json**: Official Claude Code plugin manifest for ecosystem compatibility
- **Worktree isolation**: `isolation: worktree` added to 60 producer agents for true parallel execution
  - Producer agents (code writers) get worktree isolation
  - Consumer agents (readers, orchestrators) remain shared
- **Model routing hook** (`hooks/src/model-router.ts`): Multi-LLM tier routing
  - Tier 1 (Haiku): doc-updater, technical-writer, babel, i18n-expert, etc.
  - Tier 2 (Sonnet): code-reviewer, frontend-dev, backend-dev, etc. (default)
  - Tier 3 (Opus): architect, planner, kraken, sleuth, etc.
  - Recommends via additionalContext, never forces
- **Knowledge graph skill** (`skills/knowledge-graph/SKILL.md`): codebase-memory MCP integration
  - 6-71x token savings vs raw file reading
  - Auto-index on session start via graph-indexer hook
  - Search, architecture, call-path tracing
- **Graph indexer hook** (`hooks/src/graph-indexer.ts`): Auto-suggests indexing on session start
- **Token tracker hook** (`hooks/src/token-tracker.ts`): Estimates token usage per tool call
  - Writes to `~/.claude/token-usage.jsonl`
  - Broadcasts to dashboard WebSocket
- **Dashboard v2 endpoints**: `/api/tokens`, `/api/costs` for token/cost tracking
  - Per-tool and per-agent token breakdown
  - Cost estimates for Haiku/Sonnet/Opus tiers

### Changed
- Updated counts: 139 agents, 285 skills, 66 hooks, 20 rules
- Root `package.json` added for npm distribution
- `.npmignore` added for clean npm packaging

### Context
Competitive analysis of 20+ Claude Code ecosystem repos identified critical gaps: no npm distribution (every 10K+ star repo has it), no plugin.json (invisible to official ecosystem), no worktree isolation (free parallelism), no model routing (70-85% cost savings possible), no knowledge graph (6-71x token savings). This release closes all gaps.

## [2.4.1] - 2026-04-07

### Fixed
- **CI pipeline**: Added `hooks/package-lock.json` to repo (was in `.gitignore`, causing `npm ci` to fail on every push since v2.3.1)
- **Asset counts**: Updated 283->284 skills, 60->63 hooks across README, 12 translations, install scripts, profiles, AGENTS.md, and Cursor/Codex configs
- **README badge anchors**: Added `<a name>` targets for `#agents`, `#skills`, `#hooks`, `#rules` badge links
- **validate.yml**: Fixed skill counting (was checking `prompt.md`, now checks `SKILL.md`) and added hook count to asset report

## [2.4.0] - 2026-04-07

### Added
- **Terminal HUD / Statusline** (`hooks/src/statusline-writer.ts`): Real-time session state in `~/.claude/statusline.json`
  - Tracks: agent spawns/completions/errors, tool count, session duration, active profile, current intent
  - Compatible with Claude Code's native `statusLine` config for terminal display
  - Shared utilities in `hooks/src/shared/statusline.ts`
- **Prompt Auto-Improver** (`hooks/src/prompt-improver.ts`): Enriches vague prompts with context
  - Triggers on short prompts (< 10 words) with vague verbs ("fix", "do", "make")
  - Injects recently changed files, last error from Canavar, current intent
  - Does NOT modify user prompt - only adds `additionalContext`
- **Persistent Planning System** (`hooks/src/plan-tracker.ts` + `skills/persistent-planning/`):
  - 3-file planning: `thoughts/PLAN.md` (active plan), `thoughts/PROGRESS.md` (auto-tracked commits), `thoughts/CONTEXT.md` (project context)
  - Session start: auto-injects active plan into context
  - After commits: auto-appends to PROGRESS.md with hash, message, timestamp
  - Based on planning-with-files pattern (96.7% task completion rate)

### Context
Features prioritized from competitive analysis of 20+ Claude Code ecosystem repos (143K stars leader). Terminal HUD (17K stars for claude-hud), prompt improvement (1.3K stars), and persistent planning (18K stars) were the highest-ROI gaps identified.

## [2.3.1] - 2026-04-07

### Added
- **54 unit tests** for hook utilities (vitest): plugin-check, session-id, project-identity, frontmatter parsing
  - `cd hooks && npm test` now passes with 54 tests across 4 files
- **`vibeco search`** command: fuzzy search across agents and skills by name/description
- **ARCHITECTURE.md**: Complete system architecture document with Mermaid diagrams, hook lifecycle, agent routing, self-learning pipeline, profile system, and contributor guide
- **CODE_OF_CONDUCT.md**: Contributor Covenant v2.1
- **GitHub issue templates**: Upgraded from .md to YAML forms with dropdowns, component selection, and version fields

### Changed
- **CONTRIBUTING.md**: Expanded from 52 to 120+ lines with hook development guide, skill authoring guide, agent creation guide, testing instructions, and vibeco CLI reference
- **validate.yml**: Added `test-hooks` CI job that runs `npm test` on every push/PR
- **vibeco CLI**: Added `search` command to help text and command router

## [2.3.0] - 2026-04-07

### Added
- **vibeco CLI** (`tools/vibeco/vibeco.mjs`): Zero-dependency Node.js CLI for the ecosystem
  - `vibeco help` - command reference
  - `vibeco stats` - agent/skill/hook/rule counts, error rates, instinct counts
  - `vibeco list <agents|skills|hooks|rules> [--search term]` - browse and search components
  - `vibeco dashboard` - start monitoring UI as background process
  - `vibeco doctor` - 11-point health check (directory, counts, hooks, dashboard, memory, PATH, Node.js)
  - `vibeco profile <name>` - switch between preset profiles
  - `vibeco update` - pull latest and reinstall
- **6 preset profiles** (`profiles/*.json`): Token-saving component selection
  - `minimal` (~15 agents, ~40 skills) - core review/test/verify only
  - `frontend` (~30 agents, ~60 skills) - React/Next.js/CSS/a11y
  - `backend` (~44 agents, ~74 skills) - API/DB/security
  - `fullstack` (~59 agents, ~96 skills) - frontend + backend combined
  - `devops` (~33 agents, ~61 skills) - CI/CD/K8s/cloud
  - `all` (139 agents, 283 skills) - everything (default)
- **One-liner remote install** (`install-remote.sh`): `curl -fsSL https://raw.githubusercontent.com/vibeeval/vibecosystem/main/install-remote.sh | bash`

### Changed
- `install.sh`: Added `--non-interactive` flag, profiles directory installation, vibeco CLI symlink setup
- README: Added one-liner install, vibeco CLI reference, profiles table

## [2.2.4] - 2026-04-06

### Added
- **1 new skill**: content-marketing (AI slop detection with 30+ patterns, 5-dimension content scoring, watermark cleaning, copywriting formulas AIDA/PAS/BAB, programmatic SEO, content cluster strategy)

### Changed
- **Token optimization**: Moved 3 rules to skills (commit-trailers, tldr-cli, handoff-templates) saving ~3,400 tokens/session
- Updated counts: 139 agents, 283 skills, 60 hooks, 20 rules

### Removed
- 3 rules moved to skills (still available as skills, no longer injected every session)

## [2.2.3] - 2026-04-05

### Added
- **5 new skills**: agent-linter (agent/skill file validation with 10+ rule categories), experiment-engine (autonomous modify-verify-keep/discard optimization loop), cognitive-modes (5 thinking modes: analytical/creative/systematic/rapid/debug), autonomous-pr (self-fixing PR lifecycle with CI retry and budget controls), circuit-breaker (agent error tolerance with fallback chains and exponential backoff)

### Changed
- Updated counts: 139 agents, 279 skills

## [2.2.2] - 2026-04-05

### Added
- **1 new agent**: resource-manager (token budget tracking, agent cost analysis, ROI reporting)
- **3 new skills**: knowledge-management (4-layer knowledge organization, progressive summarization, ADR templates), agent-qa-testing (agent protocol compliance testing, role boundary verification, personality drift detection), token-budget (per-agent cost tracking, budget planning, optimization strategies)

### Changed
- Updated counts: 139 agents, 274 skills

## [2.2.1] - 2026-04-04

### Added
- **1 new agent**: monetization-expert (Kerem Bozkurt persona, 7-step paywall pipeline orchestrator)
- **2 new skills**: paywall-optimizer (AI-powered A/B testing, churn prediction, push strategies, "kapali carsi esnafi" sales techniques), codex-orchestration (Codex CLI + Claude Code dual workflow patterns, GitHub Actions examples)
- **3 updated skills**: revenuecat-patterns (expanded SDK patterns for 4 platforms), paywall-strategy (14-category benchmarks, regional pricing for 18 countries), subscription-pricing (3-tier framework, win-back campaigns, A/B methodology)

### Changed
- Updated counts: 138 agents, 271 skills, 60 hooks, 23 rules
- agent-assignment-matrix updated with monetization task routing

## [2.2.0] - 2026-04-02

### Added
- **5 new features** reverse-engineered from Claude Code source:
  - **Agent Memory**: persistent per-agent memory with user/project/local scopes (agent-memory-loader, agent-memory-saver hooks)
  - **Magic Docs**: auto-updating docs via `# MAGIC DOC:` header detection (magic-doc-tracker, magic-doc-updater hooks)
  - **Dream Consolidation**: cross-session memory cleanup on 24h+3session threshold with lock mechanism (dream-consolidator hook)
  - **Smart Memory Recall**: frontmatter-based keyword+recency scoring for memory file selection (smart-memory-recall hook)
  - **Plugin Toggle**: CLI-based hook/skill enable/disable registry (plugin-registry hook + shared/plugin-check module)
- **7 new hooks**: agent-memory-loader, agent-memory-saver, magic-doc-tracker, magic-doc-updater, dream-consolidator, smart-memory-recall, plugin-registry
- **1 new shared module**: shared/plugin-check.ts (lightweight enable/disable checker)
- **Skill references** added to 21 agents (Recommended Skills sections)
- `memory: user` frontmatter field added to 10 core agents
- magic-docs/ directory with customizable prompt template
- plugin-config.json for hook/skill toggle state

### Sources
- [Claude Code source](https://github.com/anthropics/claude-code) — agentMemory.ts, MagicDocs, autoDream, findRelevantMemories, builtinPlugins

### Changed
- Updated counts: 138 agents, 271 skills, 60 hooks, 23 rules (see v2.2.1 for current)

## [2.1.2] - 2026-03-30

### Added
- **1 new agent**: paywall-planner (AI paywall strategy planner with category benchmarks, RevenueCat/Adapty config generation)
- **3 new skills**: paywall-strategy (15 category benchmarks, model selection), revenuecat-patterns (SDK integration for Swift/Kotlin/RN/Flutter), subscription-pricing (tier design, PPP, churn reduction)
- **6 new skills** adapted from Trail of Bits (4.1K stars): differential-review (blast radius, risk-adaptive depth), insecure-defaults (fail-open detection), variant-analysis (bug sibling hunting), sharp-edges (API footgun detection), fp-check (false positive verification), property-based-testing (PBT patterns for fast-check/Hypothesis/gopter)
- Dependency risk scoring merged into existing supply-chain-security skill
- RevenueCat and Trail of Bits added to Inspired By section

### Changed
- Updated counts across all files: 138 agents, 271 skills
- Regenerated gif1-numbers.gif with updated counts

## [2.1.1] - 2026-03-29

### Added
- **7 new skills** from oh-my-claudecode (14.6K stars) adaptation:
  - smart-model-routing: Dynamic model selection based on task complexity scoring
  - deep-interview: Socratic spec generation with ambiguity scoring (replaces discovery-interview)
  - agent-benchmark: Framework for measuring agent quality and detecting regressions
  - visual-verdict: Screenshot comparison QA with structured scoring
  - ai-slop-cleaner: Post-implementation cleanup with regression-safe passes
  - factcheck-guard: Runtime claim verification protocol
  - notepad-system: Compaction-resistant notes for context preservation
- **1 new rule**: commit-trailers (structured git trailers for decision context)

### Sources
- [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (14.6K stars)

## [2.1.0] - 2026-03-29

### Added
- **7 new skills**: minimax-pdf, minimax-docx, minimax-xlsx, pptx-generator, frontend-dev (MiniMax), fullstack-dev (MiniMax), clone-website
- **2 new agents**: document-generator (DOCFORGE), website-cloner (MIRAGE)
- **Document generation**: Professional PDF, Word, Excel, PowerPoint creation with anti-AI-aesthetic design system
- **Website cloning**: 5-phase pixel-perfect site cloning pipeline with Chrome MCP and git worktree isolation
- **Enhanced frontend patterns**: Design dials (variance, motion, density), anti-AI-aesthetic rules, motion engine
- **Enhanced fullstack patterns**: 1,037-line comprehensive guide with TypeScript, Python, and Go examples

### Sources
- [MiniMax-AI/skills](https://github.com/MiniMax-AI/skills) (6.8K stars) - document generation, frontend-dev, fullstack-dev
- [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) (1.9K stars) - clone-website

## [2.0.0] - 2026-03-26

### Added
- **13 new agents**: sast-scanner, mutation-tester, graph-analyst, mcp-manager, community-manager, benchmark, dependency-auditor, api-designer, incident-responder, data-modeler, test-architect, release-engineer, documentation-architect
- **23 new skills**: sast-patterns, github-actions-integration, mutation-testing, code-knowledge-graph, github-mcp, browser-debugging, n8n-workflows, understand-codebase, mcp-registry, changelog-automation, soc2-compliance, gdpr-compliance, hipaa-compliance, prd-writer, user-story-generator, content-strategy, cto-advisor, vp-engineering, product-analytics, marketing-analytics, developer-relations, growth-engineering, competitive-analysis
- **4 new hooks**: sast-on-edit (SAST security scan on edit), dashboard-ws-emitter (real-time agent monitoring), mcp-discovery (auto-suggest MCP servers), changelog-on-release (session changelog summary)
- **Agent Monitoring Dashboard**: Real-time web UI at localhost:3848 with agent timeline, live feed, Canavar error ledger, and agent breakdown stats
- **GitHub Actions CI/CD**: Automatic PR review (claude-review.yml) and issue-to-fix (claude-fix.yml) workflows using anthropics/claude-code-action
- **MCP Registry**: Python registry script with 12 known MCP servers and project-based recommendations
- **Compliance suite**: SOC2, GDPR, HIPAA compliance skills with checklists, code patterns, and audit guides
- **Product & Marketing skills**: PRD writer, user story generator, product analytics, marketing analytics, growth engineering, competitive analysis, content strategy, CTO advisor, VP engineering perspectives
- **Mutation testing**: Test suite quality measurement with Stryker/mutmut/go-mutesting support

### Changed
- Agent count: 121 -> 134
- Skill count: 223 -> 246
- Hook count: 49 -> 53

## [1.4.0] - 2026-03-25

### Added
- 2 new agents: browser-agent (AI browser automation + stealth toolkit), harvest (web intelligence gatherer)
- 9 new skills: browser-automation, harvest-single, harvest-deep-crawl, harvest-structured, harvest-adaptive, harvest-monitor, harvest-competitive, config-security-scan, experiment-loop
- Docker crawl4ai integration (docker/crawl4ai/docker-compose.yml)
- MCP integration guide (docs/mcp-integrations.md) for browser-use, codebase-memory-mcp, crawl4ai
- Stealth browser toolkit in browser-agent (Patchright, Nodriver, Camoufox, curl-impersonate)
- Advanced extraction toolkit in harvest (Katana, yt-dlp, gallery-dl, twscrape)

### Enhanced
- security-reviewer: hard exclusion list (reduce false positives), diff-aware review mode, confidence calibration
- maestro: dynamic manager delegation, validation gate pattern, loop detection + step budgets, event-driven flow routing
- qa-loop: event-driven conditional routing, output validation, auto-retry with error feedback (ModelRetry)
- agent-assignment-matrix: 7 new task categories for browser automation, web crawling, config security, performance loops

### Fixed
- README Turkce section agent count (119 -> 121)
- Docker compose deprecated version field removed
- browser-agent MCP tool list consistency across files

## [1.3.0] - 2026-03-24

### Added
- 6 new SaaS skills: saas-payment-patterns, saas-auth-patterns, email-infrastructure, kvkk-compliance, saas-analytics-patterns, saas-launch-checklist

### Enhanced
- api-patterns: plan-based authorization, serverless rate limiting, API key auth, usage metering
- seo-patterns: SaaS landing page anatomy, hero section formulas, pricing page SEO, SoftwareApplication schema

## [1.2.0] - 2026-03-24

### Added
- 2 new skills: external-skills-catalog (60+ community skill directory), pyxel-patterns (retro game engine)
- Invisible routing pattern in workflow-router (silent orchestration, decision flowchart)
- Fallback strategy in workflow-router (workaround, combo, create, external)
- One-question rule in collaborative-decisions (max 1 clarifying question)

### Fixed
- a11y-expert.md: added missing YAML frontmatter (CI fix)
- start-observer.sh: converted CRLF to LF line endings (CI fix)

### Credits
- Skill Gateway (buraksu42): Invisible routing, external catalog, one-question rule
- Pyxel (kitao): Retro game engine patterns, pixel art constraints, MML audio

## [1.1.0] - 2026-03-22

### Added
- 6 new skills: ui-ux-patterns, brand-identity, reverse-document, gate-check, design-system-generator, pentest-methodology
- 3 new rules: pre-compact-state, incremental-writing, collaborative-decisions

### Enhanced
- 5 agents enhanced: designer, frontend-dev, accessibility-auditor, technical-writer, security-analyst
- 4 skills updated: coding-standards, design-to-code, frontend-patterns, security

### Credits
- Shannon (KeygraphHQ): Result<T,E> pattern, pentest pipeline, comment philosophy
- UI UX Pro Max (nextlevelbuilder): Named UX rules, UI style catalog, design token architecture
- Game Studios (Donchitos): Context resilience, incremental writing, gate-check system

## [1.0.0] - 2026-03-22

### Added
- 119 specialized agents covering full software development lifecycle
- 202 skills with domain-specific patterns and best practices
- 48 TypeScript hooks for automated context injection and quality gates
- Self-learning pipeline: passive-learner, instinct consolidation, cross-project learning
- Agent swarm mode: multi-agent parallel coordination across 5 phases
- Dev-QA loop: implement, review, retry (max 3), escalate
- Canavar cross-training: one agent's mistake trains the whole team
- Adaptive hooks: intent-based hook activation
- One-line installer (`install.sh`) with zero npm/node dependency
- Pre-built hook distributions (no build step required)
- Comprehensive documentation (README, CONTRIBUTING, SECURITY)

### Agent Categories
- **Core Development:** frontend-dev, backend-dev, devops, ai-engineer
- **Quality:** code-reviewer, security-reviewer, tdd-guide, verifier
- **Architecture:** architect, planner, ddd-expert, clean-arch-expert
- **Infrastructure:** kubernetes-expert, terraform-expert, aws-expert, gcp-expert
- **Database:** database-reviewer, mongodb-expert, redis-expert, elasticsearch-expert
- **Operations:** sentinel, shipper, migrator, canary-deploy-expert

### Skill Categories
- **Tier 1 (Core):** tdd-workflow, frontend-patterns, backend-patterns, coding-standards, security
- **Tier 2 (Stack):** django-patterns, postgres-patterns, redis-patterns, kafka-patterns, kubernetes-patterns
- **Tier 3 (Advanced):** observability, chaos-engineering, event-driven-patterns, rag-patterns, prompt-engineering

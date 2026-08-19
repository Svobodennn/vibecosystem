# Codex CLI Setup Guide

vibecosystem works with [Codex CLI](https://github.com/openai/codex) (OpenAI) in addition to Claude Code.

## Prerequisites

1. Node.js 18+
2. OpenAI API key
3. Python 3 for validating the luna worker contract
4. Codex CLI installed:

```bash
npm install -g @openai/codex
```

## Installation

### Recommended: use the installer

```bash
git clone https://github.com/vibeeval/vibecosystem.git
cd vibecosystem

# Small, operational core profile
./install-codex.sh --profile core

# Codex-safe repository profile (recommended for the full mirror)
./install-codex.sh --profile codex

# Raw canonical profile, including Claude-only skills (not recommended for Codex)
./install-codex.sh --profile full

# Install the bounded luna worker as well
./install-codex.sh --profile core --install-luna-worker
```

Skills are installed into `~/.agents/skills/`, the current Codex skill discovery target. The default is ownership-aware merge: unmanaged or user-modified destinations are preserved, while unchanged destinations recorded in the installer manifest are backed up and refreshed. `install-codex.sh` never writes global `AGENTS.md`; global rules are a separate, explicit `tools/codex-extras.mjs --rules` operation.

The `core` profile is a small explicit allowlist. The `codex` profile is the explicit Codex-safe allowlist: Claude-runtime-only skills are excluded and generic Class B skills are adapted only in the destination. The `full` profile is the unadapted canonical inventory and exists for compatibility, not as the recommended Codex profile.

### Installer options

| Option | Behavior |
| --- | --- |
| `--profile core\|codex\|full` | Select the small core, Codex-safe explicit allowlist, or raw canonical inventory. Default: `core`. |
| `--install-luna-worker` | Validate and install `.codex/agents/luna-worker.toml` at `~/.codex/agents/luna-worker.toml`. |
| `--validate-luna-worker` | Validate the canonical worker contract and exit when used alone. |
| `--dry-run` | Print the planned changes without creating, replacing, pruning, or backing up user files. |
| `--prune` | Remove only unchanged skill directories recorded in the installer ownership manifest and absent from the selected profile. |
| `--force` | Replace existing destinations, after taking a backup. Without it, existing skills or the worker are skipped. |
| `--non-interactive` | Skip the confirmation prompt. |

The ownership manifest is `~/.agents/.vibecosystem-codex-skills`. Pruning never removes an unrecorded skill, a symlink, or a skill whose contents changed after installation. If no manifest exists, pruning reports that it has nothing safe to remove. Destructive changes are copied to a timestamped directory under `~/.agents/vibecosystem-backups/` first.

Preview a change before applying it:

```bash
./install-codex.sh --profile core --install-luna-worker --dry-run
```

For the full Codex mirror, preview `--profile codex` first. Existing unmanaged destinations remain preserved unless the user explicitly approves replacement.

Validate the canonical worker without touching the home directory:

```bash
./install-codex.sh --validate-luna-worker
```

### Global rules and curated agents

`codex-extras.mjs` owns the global layers that the skill installer deliberately does not touch. Always use an isolated target or `--dry-run` first. Before replacing any existing target, extras creates one timestamp/PID backup under the same `~/.agents/vibecosystem-backups/` root used by `install-codex.sh`.

```bash
# Compact global AGENTS.md plus full rule-* skills
node tools/codex-extras.mjs --rules --dry-run

# Curated mirror sourced from live ~/.claude/agents
node tools/codex-extras.mjs --agents --dry-run
```

Rules use `rules/codex/<slug>.md` when an override exists and otherwise use the canonical rule. Canonical `rules/*.md` remains the Claude source. The generated global `AGENTS.md` contains only the compact always-on guardrails; full procedures remain discoverable as `rule-*` skills.

Generated `AGENTS.md`, rule skills, and agent TOMLs carry ownership markers. A markerless collision is preserved and causes installation to fail with its path; use `--force` only after inspecting it. Forced replacement and refresh of a marked-but-user-edited file both create a recoverable backup. Uninstall removes only marked rule skills, so a user-owned `rule-*` skill survives.

Agents use the same overlay policy: live `~/.claude/agents` is normalized and checked against the canonical repo, mechanical transforms are applied, and `agents/codex/<slug>.md` is used only for exceptional semantic overrides. The generator writes standalone TOML files and a managed `[agents]` registry with bounded concurrency/depth. The reserved `luna_worker` is not part of this mirror and is never overwritten.

To install only the reserved worker:

```bash
mkdir -p ~/.codex/agents
cp vibecosystem/.codex/agents/luna-worker.toml ~/.codex/agents/luna-worker.toml
```

## Project setup

To use vibecosystem instructions in a specific project, copy `AGENTS.md` to that project root:

```bash
cp vibecosystem/AGENTS.md ~/my-project/AGENTS.md
```

Optionally, copy the model-neutral Codex project config:

```bash
mkdir -p ~/my-project/.codex
cp vibecosystem/.codex/config.toml ~/my-project/.codex/config.toml
```

The project config only defines the `AGENTS.md`/`CLAUDE.md` document fallback. It intentionally does not pin a project-wide model, enable `history.local`, or override skill discovery. For this repository, the canonical reserved worker is `.codex/agents/luna-worker.toml`; its model contract is independent from the mirrored roster. Codex does not infer an Opus/Sonnet mapping from Claude frontmatter.

## Usage

```bash
cd your-project
codex
```

Then use installed skills by referencing them:

```
> "use the coding-standards skill to review this file"
> "apply tdd-workflow to add a new feature"
> "use security-review to audit this endpoint"
> "follow postgres-patterns for this migration"
```

The custom worker is named `luna_worker` and is the bounded repository worker for implementation and verification. Its canonical contract pins `gpt-5.6-luna` with `max` reasoning while keeping the task boundary explicit.

## What works with Codex CLI

| Feature | Status | Notes |
| --- | --- | --- |
| Skills (`SKILL.md`) | Supported | Use the explicit `codex` profile for the adapted allowlist. |
| Project instructions | Full support | `AGENTS.md`, with `CLAUDE.md` as the configured fallback. |
| Custom agents | Supported | `codex-extras.mjs --agents` writes the curated global TOML roster; `luna_worker` stays reserved. |
| Hooks | One allowlisted candidate | `credential-deny` is generated without trust; the user must inspect and trust it through `/hooks`. Until then it is pending, not active. |
| Rules | Compact core + skills | `codex-extras.mjs --rules` owns global `AGENTS.md` and `rule-*` skills. |

## Updating

```bash
cd vibecosystem
git pull
./install-codex.sh --profile codex --force
```

Update the worker explicitly when needed:

```bash
./install-codex.sh --validate-luna-worker --install-luna-worker --force
```

## Troubleshooting

### Skills not found

Check the current target:

```bash
find ~/.agents/skills -mindepth 1 -maxdepth 1 -type d | head -20
```

If an existing skill was preserved by merge mode, use `--force` after reviewing the backup behavior.

### Project instructions not read

Make sure `AGENTS.md` is in the project root, or check that `.codex/config.toml` contains:

```toml
project_doc_fallback_filenames = ["AGENTS.md", "CLAUDE.md"]
```

### Luna worker validation fails

Run:

```bash
./install-codex.sh --validate-luna-worker
```

The validator checks the exact name, description, bounded-worker instructions, model, and reasoning effort in `.codex/agents/luna-worker.toml`.

### Hook is pending

The hook generator never creates trust state. Review `~/.codex/hooks.json` and the generated handler, then use `/hooks` to make the trust decision. Absence of a trusted handler means automatic enforcement is not active; use the documented manual guardrail.

### Model selection

`.codex/config.toml` is deliberately model-neutral. The worker model authority lives in `.codex/agents/luna-worker.toml`; do not add `o4-mini`, tier routing, or model-changing hooks to the project config.

## Maintainer validation

Run the focused installer, overlay drift, transform, TOML, and hook allowlist checks with:

```bash
tests/validate-codex-installer.sh
tests/validate-codex-rule-overlays.sh
tests/validate-codex-agent-drift.sh
tests/validate-codex-hooks.sh
```

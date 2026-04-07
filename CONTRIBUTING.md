# Contributing to vibecosystem

Thanks for considering contributing! Here's how you can help.

## Ways to Contribute

### Add New Agents

Create a `.md` file in `agents/` with YAML frontmatter:

```yaml
---
name: my-agent
description: "What this agent does — one clear sentence"
model: opus
tools: [Read, Write, Edit, Bash, Grep, Glob]
---

Your agent prompt here. Be specific about the role,
what it should and shouldn't do, and output format.
```

**Fields:**
- `name` (required): kebab-case identifier
- `description` (required): role description
- `model` (optional): `opus` (complex tasks) or `sonnet` (fast execution). Default: opus
- `tools` (optional): subset of Read, Write, Edit, Bash, Grep, Glob, Task
- `memory` (optional): `user` for persistent learning

### Add New Skills

Create a directory in `skills/` with a `SKILL.md` (preferred) or `prompt.md`:

```yaml
---
name: my-skill
description: "When to use this skill and what it does"
user-invocable: false
---

Skill content — patterns, instructions, checklists.
```

**Fields:**
- `name` (required): kebab-case identifier
- `description` (required): what this skill covers
- `user-invocable` (optional): `true` if user can call it as `/my-skill`
- `metadata.filePattern` (optional): glob patterns that trigger this skill
- `metadata.bashPattern` (optional): regex patterns for bash command matching

### Improve Hooks

TypeScript hooks live in `hooks/src/`. Each hook is a separate ESM module.

**Development workflow:**

```bash
cd hooks
npm install          # install dev dependencies
npm run build        # compile TypeScript to dist/*.mjs
npm test             # run unit tests
npm run test:watch   # watch mode
```

**Hook types:**
- `PreToolUse` — runs before a tool call (can block, inject context)
- `PostToolUse` — runs after a tool call (can format, validate)
- `Stop` — runs when session ends (cleanup, learning)
- `SessionStart` — runs on session start/resume/clear

**Creating a new hook:**
1. Create `hooks/src/my-hook.ts`
2. Export the hook handler
3. Run `npm run build` to compile
4. Register in `settings.json` (see existing hooks for format)

### Testing

```bash
cd hooks
npm test                    # run all tests
npm run test:watch          # watch mode
npm run check               # TypeScript type check
```

Tests live in `hooks/src/__tests__/`. Use vitest:

```typescript
import { describe, it, expect } from 'vitest';

describe('my-feature', () => {
  it('does the thing', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

### Documentation & Translations

- Improve existing docs or add tutorials
- Translate README to new languages (see `docs/` for examples)
- See [ARCHITECTURE.md](ARCHITECTURE.md) for system design overview

### Bug Reports & Feature Requests

Open an issue using the provided templates. Include your `vibeco version` output and OS.

## Development Setup

```bash
git clone https://github.com/vibeeval/vibecosystem.git
cd vibecosystem
./install.sh
```

After install, `vibeco` CLI is available:

```bash
vibeco doctor     # verify installation health
vibeco stats      # check component counts
vibeco search X   # find agents/skills by keyword
```

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-new-agent`)
3. Write tests for hook changes
4. Commit with clear messages (`feat:`, `fix:`, `docs:`, etc.)
5. Push and open a PR against `main`
6. Describe what you added and why
7. CI will validate frontmatter, lint markdown, and run tests

## Code Style

- **Agents**: Markdown + YAML frontmatter
- **Skills**: Markdown (SKILL.md or prompt.md) + YAML frontmatter
- **Hooks**: TypeScript (ES2022, NodeNext modules), built with esbuild
- **Rules**: Markdown
- **CLI**: Node.js ESM (.mjs), zero dependencies

## Good First Issues

Look for issues labeled `good first issue`:
- Add a missing agent for a specific domain
- Improve a skill's instructions
- Add test coverage for a hook utility
- Translate README to a new language

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

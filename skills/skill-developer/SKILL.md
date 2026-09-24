---
name: skill-developer
description: Create, split, or retire a Claude Code skill - directory layout, frontmatter, invocation mode, and registration. Use when asked to make a new skill, turn a script or workflow into one, or clean up an existing one.
allowed-tools: [Bash, Read, Write, Edit]
---

# Skill Developer

The **mechanics** of adding a skill to this setup. The **writing** is a separate discipline: call the Skill tool with `writing-for-agents` before authoring the content, and read its `SKILL-MECHANICS.md` for the invocation choice. This file covers only where files go and how they get registered.

## First, don't

This setup has 300+ skills, and their descriptions cost ~9.2K tokens of context on **every turn**. A new skill is never free. Before creating one, rule out the cheaper moves:

1. **Does an existing skill already own this?** `ls ~/.claude/skills/ | grep <topic>` and read the near-misses. Extending one beats adding another.
2. **Is it really a rule?** Standing policy that must never be missed belongs in `~/.claude/rules/` (always loaded). A procedure reached when the task fits belongs here.
3. **Is it really an agent?** Work that needs its own context window or genuine independence belongs in `~/.claude/agents/`.
4. **Is it one line in a router?** `hizir`, `help`, `workflow-router`, `search-router` already exist to hold pointers.

If a new skill is still right, continue.

## Layout

```
~/.claude/skills/<skill-name>/
├── SKILL.md          # required
├── <REFERENCE>.md    # optional: disclosed reference, one file per branch
├── scripts/          # optional
└── templates/        # optional
```

Global (`~/.claude/skills/`) applies in every project. Project-scoped (`<repo>/.claude/skills/`) applies only there, and wins on a name clash. Default to global only when the skill is genuinely project-agnostic.

## Frontmatter

```yaml
---
name: skill-name                    # kebab-case, matches the directory
description: What it is + the distinct branches that should trigger it
allowed-tools: [Bash, Read, Write]  # optional, restricts tools
---
```

The `description` is the skill's always-loaded context pointer, and it is the single highest-leverage line in the file. Write it last, after the body exists, and follow the pointer rules in `writing-for-agents`.

Invocation, in short (full reasoning in `writing-for-agents/SKILL-MECHANICS.md`):

- **Model-invoked** (default, omit both flags): agent can fire it, human can type it. Pays permanent context load.
- **User-only** (`disable-model-invocation: true`): only the human can type it. No context load. Right for expensive orchestrators.
- **Model-only** (`user-invocable: false`): hides it from the human's slash menu but **still pays full context load**. Rarely what you want.

Omit `model` so the skill inherits the parent (`rules/performance.md`).

## Structure of the body

- **Steps** if the skill is a procedure, in order, each ending on a checkable completion criterion.
- **Reference** if the skill is a body of rules, flat is fine.
- Push a branch only some runs need into its own file and point at it. Inline what every run needs.

## Registration

Nothing is required: dropping `SKILL.md` in place makes the skill available, and the harness reports it immediately.

`skills/skill-rules.json` adds keyword and intent-pattern triggers via the `skill-activation-prompt.mjs` hook, but it currently registers **3 skills out of 300+**. Add an entry only when the trigger genuinely cannot live in the description (a file path, an intent phrasing rather than a topic word). A weak description is fixed by rewriting the description.

```json
{
  "skills": {
    "my-skill": {
      "type": "domain",
      "priority": "medium",
      "enforcement": "suggest",
      "description": "What it does",
      "promptTriggers": {
        "keywords": ["keyword1", "keyword2"],
        "intentPatterns": ["(pattern).*?(match)"]
      }
    }
  }
}
```

## Verify

```bash
~/.claude/skills/<name>/SKILL.md          # exists, frontmatter parses
node ~/.claude/hooks/dist/canavar-cli.mjs health   # hook chain still healthy
```

Then invoke it once in a real task. A skill that has never run is a hypothesis. The `agent-linter` skill checks structural conformance (frontmatter, naming, required sections) across skills and agents if you want a sweep rather than a spot check.

## Retiring one

Deleting is the cheapest performance win available here, and the hardest to bring yourself to do (`writing-for-agents`, sediment). A skill earns deletion when its description carries no trigger, nothing invokes it, and its body caches something the environment already answers. Move it out rather than editing around it:

```bash
mkdir -p ~/.claude/skills/.archive
mv ~/.claude/skills/<name> ~/.claude/skills/.archive/
```

`rules/safety-and-quality.md` forbids deleting without asking: archive, then confirm with the user before anything leaves the disk.

# Skill mechanics

The skill-specific branch of [writing-for-agents](SKILL.md): what changes when the document is a skill. Everything else about writing it is the universal reference in `SKILL.md`.

## Three ways a skill gets reached

Most setups have two. This one has three, and they are routinely confused.

### 1. Model-invoked (the default)

The skill keeps a `description`, so the agent can fire it autonomously and other skills can reach it. You can still type its name: model-invocation always *includes* user reach. A description only ever adds agent discovery, never removes the human's.

The description is the skill's top-level context pointer, forced to stay loaded at all times: permanent context load in exchange for discoverability. A model-invoked skill whose content is all reference is also one home for shared reference, since another skill can invoke it, so reference needed by several skills lives in one place (`codebase-design` is exactly this).

Mechanics: omit `disable-model-invocation`, and write a model-facing description carrying the trigger branches. The pointer-writing rules in `SKILL.md` apply in full.

### 2. User-invoked

`disable-model-invocation: true` strips the description from the agent's reach: only the human typing its name can invoke it, and no other skill can. Zero context load, but it spends cognitive load: you are the index that must remember it exists.

The `description` becomes human-facing: a one-line summary, trigger lists stripped.

Pick this only when the skill is an orchestrator you always start by hand. `improve-codebase-architecture` is the model case: it costs money, spawns sub-agents, and should never fire on its own.

Shared reference that two user-invoked skills both need can live in neither: with no descriptions, neither can fire the other. Push it to a model-invoked reference skill, or a plain file both point at.

### 3. `user-invocable: false` (model-only) — and what it does not buy

51 skills in this setup set `user-invocable: false`. **It does not reduce context load.** Verified: skills carrying that flag (`agent-context-isolation`, `agentic-workflow`, `async-repl-protocol`, `background-agent-pings`, `agent-orchestration`) still appear in the agent's always-loaded skill list with their descriptions.

So the flag removes the human's reach while keeping the token cost. That is the *opposite* trade from `disable-model-invocation`, and it is almost never what you want:

- Want to stop paying for a skill you only ever type? → `disable-model-invocation: true`.
- Want to hide an internal reference doc from the human's slash-menu but keep it agent-reachable? → `user-invocable: false` is right, and the cost is honest.
- Set it out of tidiness, on a skill nothing else invokes? → it is pure load. Either sharpen the description so the agent actually reaches it, or delete the skill.

Before adding either flag, name which of the two loads you are trying to spend less of. If the answer is "neither, it just felt cleaner", change nothing.

## Frontmatter keys in use here

| Key | Effect | Used by |
|---|---|---|
| `name` | canonical skill name | 252 skills |
| `description` | the always-loaded context pointer; enables model invocation | 262 |
| `allowed-tools` | restricts the tools the skill may use | 43 |
| `user-invocable: false` | model-only; **keeps** context load (see above) | 51 |
| `disable-model-invocation: true` | user-only; drops context load | 1 |
| `argument-hint` | placeholder shown for `/skill <arg>` | 2 |
| `model` | pins a model for the skill | 7 |

`model` fights `rules/performance.md`, which says to omit the model and inherit from the parent. Leave those seven alone unless you know why each one pins.

## The keyword-trigger path

`skills/skill-rules.json` is read by the `skill-activation-prompt.mjs` UserPromptSubmit hook and can fire a skill from `promptTriggers.keywords` / `intentPatterns`, independent of the description.

**It currently registers 3 skills out of 300+** (`frontend-patterns`, `backend-patterns`, `tdd-workflow`). Treat that as the real state of the mechanism: it is not the way skills get reached here, and a new entry only earns its place when the description genuinely cannot carry the trigger (for instance the trigger is a file path or an intent phrasing rather than a topic word). Adding a keyword entry is not a substitute for a weak description; fix the description first.

## Splitting by invocation

The invocation cut of splitting (the sequence cut lives in `SKILL.md`): split off a model-invoked skill when you have a distinct leading word that should trigger it on its own (a trigger word you actually use in your prompts), or another skill must reach it. You pay context load for the new always-loaded description, so that independent reach has to be worth it.

## Router skills

When user-invoked skills multiply past what you can remember, that piled-up cognitive load is cured by a **router skill**: one user-invoked skill that names the others and when to reach for each, so the human has one skill to remember instead of many. It can only hint, never fire them: user-invoked skills have no description, so nothing but the human can reach them.

This setup already runs several (`hizir`, `help`, `workflow-router`, `search-router`, `tldr-router`, `math-router`). Before writing a new skill, check whether the right move is a line in an existing router rather than another always-loaded description.

## Skills vs agents vs rules

Three homes, and putting content in the wrong one is the most common structural mistake here:

- **Rule** (`~/.claude/rules/*.md`): always loaded, every session, every project. The most expensive real estate there is. Only standing policy that must never be missed (git approval, commit format, the 🔴 SENDE block). If it applies to *some* tasks, it is not a rule.
- **Skill** (`~/.claude/skills/*/SKILL.md`): description always loaded, body loaded on invocation. Procedures and reference, reached when the task fits.
- **Agent** (`~/.claude/agents/*.md`): a whole separate context window with its own tools. Use when the work would pollute the main context, or needs genuine independence (an adversarial reviewer, a parallel explorer).

A procedure written as a rule taxes every session for a case that arises weekly. A standing policy written as a skill gets missed, because nothing guarantees the pointer fires.

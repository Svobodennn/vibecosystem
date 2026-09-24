---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, naming a new concept, writing or editing a CONTEXT.md, or recording an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

Why it pays: a shared language means the agent spends fewer tokens describing a concept, names variables and files consistently, and navigates the codebase faster. "There's a problem when a lesson inside a section of a course is given a spot in the file system" becomes "there's a problem with the materialization cascade". That concision compounds session after session.

## CONTEXT.md is not memory

Three stores, three jobs. Putting a fact in the wrong one is how it goes stale.

| Store | Scope | Holds |
|---|---|---|
| `CONTEXT.md` (in the repo) | this project, all contributors | the **glossary**: what each domain term means. Nothing else |
| `docs/adr/` (in the repo) | this project, all contributors | **decisions** that were hard to reverse and surprising without context |
| `~/.claude/projects/<proj>/memory/` | this machine, this user | facts about working *with* the user and the project's live state (see `rules/memory-system.md`) |

`CONTEXT.md` is committed and reviewed, so it is the only one a teammate or a fresh agent sees. A term belongs there; "we decided to defer the migration to next sprint" does not.

## File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

This is a **verification** claim, so `rules/claim-verification.md` binds: read the function and trace it before asserting the contradiction. A grep hit is not a contradiction.

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](ADR-FORMAT.md).

Note the overlap with two existing rules, and don't duplicate their work:

- `rules/pre-implementation-contract.md` already forces you to **name the rejected alternative** in every plan. An ADR is where that line goes when the decision meets all three tests above; most rejected alternatives stay in the plan and never become ADRs.
- `rules/council.md` treats `irreversible` as its gate for blocking. A decision the council ruled one-way is close to an automatic ADR candidate.

## Language

Write `CONTEXT.md` and ADRs in the language the repo already uses for its committed docs. Domain terms themselves stay verbatim in whatever language the team says them out loud: a glossary that translates the term destroys the point of having one.

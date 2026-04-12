---
name: plan-documentation
description: Generate structured plan files for large tasks. Use when starting a big feature, refactoring, or multi-phase work. Creates plans/<task>-plan.md with phases, acceptance criteria, and open questions. After each phase, generates completion docs.
---

# Plan Documentation

Create durable, structured plan files for complex work. Plans survive session boundaries and serve as living documentation of intent.

## When to Create a Plan

- Task touches more than 3 files
- Work will span multiple sessions
- Architecture decision involved
- Unclear requirements that need discovery
- Refactoring with risk of regression

## Plan File Structure

Store in `plans/<task-slug>-plan.md`:

```markdown
# Plan: <Task Name>

## Goal
<One sentence describing the end state>

## Motivation
<Why this work matters - the problem being solved>

## Scope
### In
- <what's included>

### Out
- <what's explicitly excluded>

## Open Questions
- [ ] <question needing answer>
- [ ] <decision to make>

## Phases

### Phase 1: <Name>
**Objective:** <what this phase achieves>
**Files:** <expected files to touch>
**Acceptance:**
- [ ] <measurable criterion>
- [ ] <measurable criterion>

### Phase 2: <Name>
...

## Risks
- <risk>: <mitigation>

## References
- <related doc or issue>
```

## Completion Docs

After each phase completes, append to `plans/<task-slug>-completed.md`:

```markdown
## Phase <N>: <Name> - Completed <date>

**Commits:** <hash1>, <hash2>
**Files changed:** <count>
**Tests added:** <count>
**Surprises:** <anything unexpected>
**Next:** <what's coming next>
```

## Integration

- Works with `persistent-planning` skill (PLAN.md sync)
- Triggers `plan-reviewer` agent for validation
- Feeds `phase-gated-commits` workflow
- Plans referenced by `compass` for session recovery

## Lifecycle

1. **Create** plan at task start
2. **Review** with plan-reviewer agent
3. **Execute** phase by phase
4. **Update** completion doc after each phase
5. **Archive** to `plans/archive/` when task complete

---
name: phase-gated-commits
description: Break large features into phases where each phase follows implement -> review -> commit cycle. Use for multi-file features or refactoring that should have clean git history.
---

# Phase-Gated Commits

Break large features into clean, reviewable commits. Each phase is a gate: no proceeding until the previous phase is committed with tests passing.

## When to Use

- Features touching 5+ files
- Refactoring that should be bisectable
- Multi-day tasks where context may reset
- PRs that will be reviewed by others

## The Pattern

```
Phase 1: Foundation
  -> Implement
  -> Test
  -> Review
  -> Commit: "feat(x): add foundation for Y"

Phase 2: Core Logic
  -> Implement
  -> Test
  -> Review
  -> Commit: "feat(x): core logic for Y"

Phase 3: Integration
  -> Implement
  -> Test
  -> Review
  -> Commit: "feat(x): wire Y into A and B"

Phase 4: Polish
  -> Documentation
  -> Edge cases
  -> Commit: "docs(x): document Y usage"
```

## Rules

1. **No phase skipping.** Phase 2 cannot start until Phase 1 is committed.
2. **Green tests before commit.** Every phase commit must pass all tests.
3. **Atomic commits.** Each phase is one logical change. If it's too big, split the phase.
4. **Revertable.** Each phase commit can be reverted without breaking later phases.
5. **Named phases.** Every phase has a clear name and objective in the plan.

## Phase Template

```markdown
## Phase N: <Name>

**Goal:** <one sentence>
**Files:** <list>
**Test:** <how to verify>
**Commit message:** <draft>
**Acceptance:** <what "done" looks like>
```

## Integration

- Works with `persistent-planning` skill (track phases in PLAN.md)
- Triggers `verifier` agent before each commit
- Compatible with `autonomous-pr` workflow
- `commit-trailers` skill adds phase metadata to commit messages

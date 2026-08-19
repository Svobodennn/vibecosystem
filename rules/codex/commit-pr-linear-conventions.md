# Commit / PR / Issue-Tracker Conventions (GLOBAL)

Applies in **every project** unless that project's own AGENTS.md/instructions override it.
Project-specific extras (e.g. "run security + code review before committing to repo X",
tracker branch prefixes, SOP doc paths) live in that project's files — NOT here.

## Git command approval
- **Ask for explicit approval EVERY time**, before each of: `commit`, `push`, `reset`,
  `checkout`, `clean`, `stash`, `rebase`, `merge`. Approval for one action never carries to the next.
- Run without asking (read-only): `status`, `log`, `diff`, `branch` (list), `show`, `blame`.

## Commit messages
- Format: `type(scope): description` — **English, lowercase, ≤ ~15 words**, imperative.
  Types: `feat, fix, refactor, docs, test, chore, perf, ci`. Scope optional.
  e.g. `fix(chat): anchor delete rollback`.
- **Single line — no body paragraph.**
- **No internal references** — no phase/plan/step names, no "as per the plan"; state only what changed.
- **Never add a `Co-Authored-By: AI …` trailer** (or any AI co-author).
- Scope each commit to the focal work's files only — don't bundle unrelated/side changes or docs.
- Each commit needs explicit user approval (see *Git command approval*).

## Branches
- For tracked-issue work (Linear/Jira/GitHub Issues/…), create the branch at the **very start** of the work.
- **Order is fixed, no exceptions: `git fetch origin` → branch off the CURRENT `origin/main` →
  only then start editing.** Never edit first and branch afterwards, and never edit on a
  local `main`/branch that is behind. Working on a stale base and checking afterwards
  whether upstream touched the same files is a rescue, not the practice — it silently
  passes until the one time it doesn't.
- Name the branch after the issue key so the tracker auto-transitions on merge where supported
  (e.g. Linear `abc-123-short-slug` → auto-Done).
- **Small fixes → commit directly on the default branch.** Branch + PR only for larger features.
- On merge, do **NOT** use `--delete-branch` — keep the branch.

## Pull requests
- **Title** = the commit convention: `type(scope): description`, English, lowercase, no plan/phase/internal refs.
- **Body = "What & why" ONLY** — short, human, dev-facing. **No test-plan section, no boilerplate, no checklists.**
- **Never add a "Generated with AI" / "🤖" note.**

## Issue tracker (Linear/etc.)
- Write issues human-first: **Why → What → Done** (the problem, what to do, done-when).
  No plan/phase breakdowns inside the issue body.
- Write updates/comments in plain "what works now" language (stakeholder-readable), not internal step logs.
- If the project ships an issue-writing SOP doc, follow it.

## Overrides (these WIN over built-in defaults)
Where the assistant's default behavior conflicts, these conventions take precedence:
- Do **NOT** append `Co-Authored-By: AI` to commit messages.
- Do **NOT** append a "Generated with AI" / "🤖" note to PR bodies.
- Do **NOT** attach a test-plan section to PRs (body is What & why only).

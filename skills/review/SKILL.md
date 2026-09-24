---
name: review
description: Review the changes since a fixed point (commit, branch, tag, merge-base) on two axes - Standards (does it follow this repo's conventions plus a code-smell baseline?) and Spec (does it do what the issue asked?). Use when reviewing a branch, a PR, work in progress, or "review since X".
---

# Review

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards**: does the code conform to this repo's documented conventions?
- **Spec**: does the code faithfully implement the originating issue or spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

**Why two axes.** A change can pass one and fail the other. Code that follows every convention but implements the wrong thing is Standards-pass, Spec-fail. Code that does exactly what the issue asked but breaks the project's conventions is the reverse. Reporting them separately stops one axis from masking the other, which is why step 5 does not merge or rerank them.

## 1. Pin the fixed point

Whatever the user said is the fixed point: a commit SHA, branch name, tag, `main`, `HEAD~5`. If they didn't specify one, ask.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Note the commits with `git log <fixed-point>..HEAD --oneline`.

Confirm the ref resolves (`git rev-parse <fixed-point>`) and the diff is non-empty **before** spawning anything. A bad ref should fail here, not inside two parallel sub-agents.

## 2. Identify the spec source

In this order:

1. Issue references in the commit messages (`#123`, `ABC-456`, `Closes #45`). Fetch Linear issues with the Linear MCP, GitHub issues with `gh issue view`.
2. A path the user passed as an argument.
3. A spec, plan, or PRD under `docs/`, `specs/`, `thoughts/`, or `.scratch/` matching the branch name or feature.
4. Otherwise ask where the spec is. If there isn't one, skip the Spec sub-agent and say so in the report.

Where the work came from a `rules/pre-implementation-contract.md` plan, **that plan is the spec**, and its Goal section is the acceptance criteria to review against.

## 3. Identify the standards sources

Anything in the repo documenting how code should be written: the project's `CLAUDE.md`, `CONTRIBUTING.md`, `CODING_STANDARDS.md`, `.editorconfig`, lint config. Plus the global `rules/coding-style.md` and `rules/architecture-principles.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (*Refactoring*, ch. 3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Skip anything tooling already enforces (Prettier, ESLint, `tsc`, and the `post-edit-diagnostics` hook already cover formatting and types).

Each smell reads *what it is* → *how to fix*. Match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

Where the diff is architectural rather than local, the `codebase-design` vocabulary is sharper than the smell list: a **shallow** module is the smell Fowler doesn't name.

## 4. Spawn both sub-agents in parallel

Send both in one message so they run concurrently. Omit `model` so they inherit the parent (`rules/performance.md`).

**Standards** → `code-reviewer`. The prompt must include:

- The full diff command and commit list.
- The standards-source files found in step 3, **plus the smell baseline pasted in full** (the sub-agent has no other access to it).
- The brief: *"Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."*

**Spec** → `plan-reviewer`. The prompt must include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: *"Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."*

If the spec is missing, skip the Spec sub-agent and note it in the report.

**Add a third axis only when the diff earns it**, in the same parallel batch:

| Diff touches | Add | As axis |
|---|---|---|
| auth, user input, secrets, API endpoints, payments | `security-reviewer` | Security |
| SQL, migrations, schema | `database-reviewer` | Data |
| Python | `python-reviewer` | replaces Standards |

## 5. Aggregate

Present each axis under its own heading (`## Standards`, `## Spec`, `## Security`), verbatim or lightly cleaned. **Do not merge or rerank findings across axes**: the separation is the whole point.

End with one line per axis: total findings, and the worst issue *within that axis*. Don't pick a single winner across axes.

Then a verdict:

- **APPROVE**: ready to merge, all findings minor
- **REQUEST_CHANGES**: blocking findings must be fixed
- **NEEDS_DISCUSSION**: a design decision needs the user's input

## 6. Escalate to council when the axes disagree

`rules/council.md` fires a council automatically on **contradiction**: one axis passes while another fails. Standards-PASS with Security-FAIL is the canonical case. Two other triggers apply to a review:

- the diff touches `**/auth/**`, `**/payment/**`, `**/billing/**`, `**/migrations/**`, `**/*.sql`, public API surface, `.claude/hooks/**`, or `.github/workflows/**`
- the diff is over ~200 lines or 5 files

Council is in **shadow mode**: it reports, it does not block. It also costs ~400-900K subagent tokens per run, so offer it rather than launching it, and only where the blast radius justifies it.

## Modes

- `/review` — Standards + Spec (plus any earned third axis)
- `/review --quick` — Standards only
- `/review PR #123` — resolve the PR's base as the fixed point, review the PR diff

## Handing findings back

Findings are not fixes. Route them by size: `spark` for a one-file change, `kraken` for anything multi-file, under `rules/qa-loop.md` (max 3 retries, then escalate). A fix is done when `@verifier` passes, not when the reviewer's comment is addressed.

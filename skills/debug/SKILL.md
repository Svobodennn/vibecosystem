---
name: debug
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "debug this" / "diagnose", or reports something broken, throwing, failing, or slow.
---

# Debug

A discipline for hard bugs. Skip a phase only when you can say why.

The one idea: **build a tight feedback loop that goes red on this bug, before you theorise about it.** Everything else here is mechanical. Reading code to form a theory without a loop is the exact failure this skill prevents.

When exploring the codebase, read `CONTEXT.md` (if it exists) for a clear mental model of the relevant modules, and check `docs/adr/` for decisions in the area you're touching.

For the environment specifics of this machine (where logs live, how to query a local DB, how to check a service), see [ENVIRONMENT.md](ENVIRONMENT.md).

## Redact

This skill has you show commands, outputs, and captured artifacts. **Redact every secret first**: write `<REDACTED>` in its place. Build loops against env vars so the credential stays in the environment rather than in what you show. Captured artifacts carry auth headers: quote only the lines that carry the signal.

If the redacted output is not enough to diagnose the bug, say so and ask the user.

## Phase 1: Build a feedback loop

**This is the skill.** If you have a **tight** pass/fail signal that goes red on *this* bug, you will find the cause: bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. Be aggressive, be creative, refuse to give up.

### Ways to construct one, in roughly this order

1. **Failing test** at whatever seam reaches the bug: unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright, or the `claude-in-chrome` tools) that drives the UI and asserts on DOM/console/network.
5. **Replay a captured trace.** Save a real request, payload, or event log to disk; replay it through the code path in isolation.
6. **Throwaway harness.** Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug path with a single function call.
7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness.** If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop.** Run the same input through old-version vs new-version (or two configs) and diff outputs.
10. **Human-in-the-loop script.** Last resort. If a human must click, drive *them* with a script so the loop is still structured: call the Skill tool with `wizard` to author it. Captured output feeds back to you.

Where reproduction itself is the hard part (flaky, race, environment-dependent), hand it to the `replay` agent rather than grinding on it here.

### Tighten the loop

Treat the loop as a product. Once you have *a* loop, **tighten** it:

- Faster? (Cache setup, skip unrelated init, narrow the test scope.)
- Sharper signal? (Assert on the specific symptom, not "didn't crash".)
- More deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is a debugging superpower.

### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not. Keep raising the rate until it's debuggable.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for (a) access to an environment that reproduces it, (b) a redacted captured artifact (HAR file, log dump, core dump, screen recording with timestamps), or (c) permission to add temporary production instrumentation. Do **not** proceed to hypothesise without a loop.

### Completion criterion: a tight loop that goes red

Phase 1 is done when you can name **one command** that you have **already run at least once** (show the invocation and its output, redacted), and that is:

- [ ] **Red-capable**: it drives the actual bug code path and asserts the **user's exact symptom**, so it goes red on this bug and green once fixed. Not "runs without erroring": it must be able to catch *this* bug.
- [ ] **Deterministic**: same verdict every run (flaky bugs: a pinned, high reproduction rate, per above).
- [ ] **Fast**: seconds, not minutes.
- [ ] **Agent-runnable**: you can run it unattended.

No red-capable command, no Phase 2.

## Phase 2: Reproduce and minimise

Run the loop. Watch it go red.

Confirm:

- [ ] The loop produces the failure mode the **user** described, not a different failure that happens to be nearby. Wrong bug means wrong fix.
- [ ] The failure reproduces across multiple runs (or at a high enough rate to debug against).
- [ ] You captured the exact symptom (error message, wrong output, timing) so later phases can verify the fix addresses it.

Then shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**, re-running the loop after each cut. Keep only what's load-bearing.

Why bother: a minimal repro shrinks the hypothesis space in Phase 3 and becomes the clean regression test in Phase 5.

Done when **every remaining element is load-bearing**: removing any one of them makes the loop go green.

## Phase 3: Hypothesise

Generate **3-5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each must be **falsifiable**: state the prediction.

> "If X is the cause, then changing Y will make the bug disappear / changing Z will make it worse."

If you can't state the prediction, it's a vibe: discard or sharpen it.

**Show the ranked list to the user before testing.** They often re-rank instantly ("we just deployed a change to #3") or know what they've already ruled out. Cheap checkpoint, big saving. Don't block on it: proceed with your ranking if they're away.

Delegate the search to `sleuth` when it needs to read more than a handful of files (`rules/proactive-delegation.md`), and keep the loop in the main context so you stay the one holding the signal.

## Phase 4: Instrument

Each probe maps to a specific prediction from Phase 3. **Change one variable at a time.**

Preference order:

1. **Debugger / REPL inspection** where the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`, so cleanup is one grep. Untagged logs survive; tagged logs die.

**Perf branch.** For performance regressions, logs are usually wrong. Establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second. Where the bottleneck is genuinely unknown, `profiler` has the better tooling.

## Phase 5: Fix and regression test

State the root cause before fixing it, and treat it as an existence claim: `rules/claim-verification.md` binds. "The loop goes green when I change X" is evidence; a grep hit is not.

Write the regression test **before the fix**, but only if there is a **correct seam** for it. A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (a single-caller test when the bug needs multiple callers; a unit test that can't replicate the chain that triggered it), a test there gives false confidence.

**If no correct seam exists, that itself is the finding.** Note it: the architecture is preventing the bug from being locked down. That is a `codebase-design` problem (the module is shallow, or the seam is in the wrong place), and it belongs in the report.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 loop against the original, un-minimised scenario.

## Phase 6: Cleanup

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes, or the absence of a seam is documented
- [ ] All `[DEBUG-...]` instrumentation removed (grep the prefix)
- [ ] Throwaway harnesses deleted, or moved to a clearly-marked debug location
- [ ] The **whole** suite run, not just the new test (`rules/safety-and-quality.md`): a regression elsewhere means the job isn't done
- [ ] The correct hypothesis stated in the commit or PR message, so the next debugger learns it

Then the two automatic follow-ups from `rules/auto-skill-activation.md`: `coroner` to find the same pattern elsewhere in the codebase, and `self-learner` if the bug came from a wrong assumption worth recording.

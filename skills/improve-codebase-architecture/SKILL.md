---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one the user picks.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

Run it periodically (every few days on an active codebase), not on demand after a bug. It is a **survey, not a rescue**: on a genuinely tangled codebase it will find real candidates, but it won't untangle the mud for you.

This skill is *informed* by the project's domain model and built on a shared design vocabulary:

- Call the Skill tool with `codebase-design` for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion, and don't drift into "component", "service", "API", or "boundary".
- The domain language in `CONTEXT.md` gives names to good seams. ADRs in `docs/adr/` record decisions this skill must not re-litigate.

## Where this sits next to janitor and phoenix

Three different jobs, don't duplicate them:

| | Asks |
|---|---|
| `janitor` agent | what is **dead or oversized**? (unused exports, TODO debt, files over the size cap) |
| this skill | what is **shallow**? (interface nearly as complex as the implementation) |
| `phoenix` agent | given a chosen target, what is the **phased refactor plan**? |

A file can be small, live, and still shallow: that's this skill's catch and nothing else finds it. Once the user picks a candidate and wants it *executed*, hand to `phoenix` for the plan and `kraken` for the work.

## Process

### 1. Explore

**Scope before you scan: YAGNI.** Deepening pays off by making *future* changes easier, so weight the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it and skip the inference below.
- Otherwise find the hot spots: `git log --oneline -200 --name-only | grep -v '^$' | sort | uniq -c | sort -rn | head -30`. The files that keep coming up pull your attention first. If changes are scattered with no clear hot spot, widen the net.

Read `CONTEXT.md` and any ADRs in the area you're touching **first**, so candidates are named after domain concepts rather than class names.

Then dispatch the exploration rather than doing it in the main context (`rules/proactive-delegation.md`: 5+ files means delegate):

- `scout` walks the candidate paths and reports where it experiences friction.
- `graph-analyst` supplies the structural view: call graph, circular dependencies, orphan files, layer violations.
- Where the `tldr` MCP is available, `mcp__tldr__arch` and `mcp__tldr__structure` are cheaper than reading files for the same picture.

Don't follow rigid heuristics; explore organically and note friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, while the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

`rules/claim-verification.md` binds here. "Module X is shallow" is an existence claim about behaviour: read the implementation and the call sites before it goes in the report. A grep hit is a hypothesis, not a candidate.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the scratchpad directory (or `$TMPDIR`, falling back to `/tmp`) so nothing lands in the repo: `<dir>/architecture-review-<timestamp>.html`, a fresh file per run.

**Tell the user the absolute path and ask whether to open it. Do not open a browser window unsupervised** (`memory: no-auto-launch-gui-apps`). If they say yes, `open <path>` on macOS.

The report uses **Tailwind via CDN** for layout and **Mermaid via CDN** for graph-shaped diagrams, mixed with hand-crafted CSS/SVG for the editorial visuals. Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture causes friction
- **Solution**: plain English description of what would change
- **Wins**: named in glossary terms (locality, leverage), plus how tests would improve
- **Before / After diagram**: side by side, illustrating the shallowness and the deepening
- **Recommendation strength**: `Strong`, `Worth exploring`, or `Speculative`, as a badge
- **Dependency category** from `codebase-design/DEEPENING.md`: `in-process`, `local-substitutable`, `ports & adapters`, or `mock`

**Never estimate the size of the fix.** Measuring reversibility and blast radius is in scope; guessing "this is a one-line change" is not, and being wrong about it poisons every downstream decision.

End with a **Top recommendation** section: which candidate to tackle first, and why.

**ADR conflicts**: if a candidate contradicts an existing ADR, surface it only when the friction is real enough to warrant reopening the decision. Mark it clearly in the card (an amber callout: *"contradicts ADR-0007, but worth reopening because…"*). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the scaffold, diagram patterns, and styling.

Do NOT propose interfaces yet. After the file is written, ask: "which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, call the Skill tool with `deep-interview` to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, which tests survive.

Side effects happen inline as decisions crystallise. Call the Skill tool with `domain-modeling` to keep the domain model current:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term mid-conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR: *"want me to record this so future architecture reviews don't re-suggest it?"* Only when the reason would actually stop a future re-suggestion; skip ephemeral ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces?** Use the design-it-twice parallel sub-agent pattern in `codebase-design/DESIGN-IT-TWICE.md`.

### 4. Hand off, don't build

This skill ends at a decided design. Implementing it is `phoenix` (phased plan) then `kraken` (execution) under the usual gates: `rules/pre-implementation-contract.md` for the plan, `rules/qa-loop.md` for the Dev-QA loop, `@verifier` before anything is called done.

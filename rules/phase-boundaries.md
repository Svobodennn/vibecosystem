# Phase Boundaries

A **phase** is a chunk of work inside a session: the grilling, the implementation, the QA. The definition is fuzzy on purpose: a phase ends when you think *"ok, we're done with that"*.

The **phase boundary** is the gap between two phases, and it is the only place the context decision belongs. Mid-phase there is no decision to make: continue, or split the remaining work into subagents. Compacting mid-phase makes the agent lose the thread.

This rule covers the **voluntary** case: you have finished something and are choosing what to do with the context. `pre-compact-state.md` covers the **involuntary** case: the window is running out mid-phase and state must be dumped before it goes.

## The five options

| Option | What it does |
|---|---|
| **Continue** | Stay in the session. No context switch at all |
| **`/clear`** | Empty the context window and start from nothing |
| **Handoff** | Write a portable file and seed a session anywhere with it (`create_handoff` skill) |
| **Subagent** | Send the task to its own context window and get a report back |
| **`/compact`** | Compress this context and seed a fresh session with the summary |

## The tree

Work top to bottom at the boundary. The first **yes** wins.

**1. Can you continue in this session?** Two things make the answer yes: the next phase needs this phase as a **primary source**, or enough usable context remains for the next phase to fit. Grilling → implementation is the standard yes: the implementation wants the reasoning verbatim, not a summary of it. Continue costs nothing and loses nothing, so rule it out before anything else.

**2. Is the context irrelevant to what comes next?** Is everything in this session (the exploration, the decisions, the dead ends) disposable? Then **`/clear`**. It is the cheapest move on the board: it takes no time and hands back the whole window, and it isn't terminal, since the old session stays resumable.

The cost of getting this wrong is one-way. Clear a *relevant* context and the **why** behind what you built is gone; no amount of reading the diff back returns it.

**3. Do you need to hand off?** Handoff is narrow. You need it only when you are:

- swapping to a **different harness** (Claude Code → Codex)
- moving to a **different directory** or repo
- sending the work to **someone else**
- forking a side task found **mid-phase** without derailing what you're doing

That list is the whole clause. What a handoff buys is **portability**: a file that travels. If nothing is travelling, you don't need one.

**4. Can the task be done AFK?** Is it scoped tightly enough to run unattended, with no steering? Then send it to a **subagent** and leave this session untouched. Automated review is the standard case: the agent reads the diff and reports, and you aren't needed while it does. `proactive-delegation.md` already makes this mandatory for 5+ file reads, bug investigation, and multi-file edits.

**5. Otherwise, `/compact`.** Relevant context, same harness, same directory, and you need to stay in the loop: this is where the tree lands, and it lands here often. Pass it an instruction (`/compact we're going to QA this area`) so the summary keeps what the next phase needs.

`/compact` is the **default, not the first reach**. It sits at the bottom because the four questions above it are all cheaper or more precise. The failure mode when people start here is a fresh session that is confidently wrong about a decision the summary flattened.

## Primary and secondary sources

Every move except **Continue** turns a **primary source** into a **secondary source**: the session as it happened, replaced by a summary of it. The trade is always the same shape:

| Source | Information | Noise | Room to move |
|---|---|---|---|
| Primary (Continue) | Full | Lots | Little |
| Secondary (`/compact`, handoff) | Lossy | Less | Lots |

This is why question 1 comes first. You only pay the lossiness when staying costs more than it saves.

## Usable context, not total context

Question 1 asks whether the next phase *fits*, which is about the usable zone rather than the advertised window. The ~150K rule of thumb comes from 200K-class contexts; a 1M-context session has far more room and question 1 says yes much more often. Judge it by what is left, not by a fixed number, and remember `performance.md`: don't push into the last stretch of the window with a large refactor or multi-file feature. Delegate those instead.

## These are judgement calls

The questions are not objective: each has taste in it, and the same boundary can go two ways on two days. The value is in asking them **in order**, at the boundary rather than in the middle of the work.

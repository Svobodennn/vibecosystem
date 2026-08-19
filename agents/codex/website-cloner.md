---
name: website-cloner
description: "USE WHEN: reconstructing a website from authorized visual/browser evidence. Works sequentially with tools actually available; does not dispatch builders or create worktrees."
---

# Website Cloner — Codex

Rebuild an authorized target from captured visual and behavioral evidence.

## Capability and permission gate

1. Confirm the user is authorized to reproduce the target.
2. Inspect the browser/vision tools available in the current session.
3. If browser capture is unavailable, request screenshots/assets or return a manual capture checklist.
4. Do not assume Chrome MCP, `claude --chrome`, or a specific MCP server.

## Pipeline

1. **Reconnaissance** — capture desktop/mobile views, states, fonts, colors, assets, and interactions.
2. **Foundation** — inspect the destination project and establish tokens, types, breakpoints, and asset policy.
3. **Section specs** — split the page into bounded, non-overlapping sections. Work sequentially in this leaf agent; if parallel builders would help, return a dispatch plan to the parent.
4. **Assembly** — integrate sections using the project's existing framework and conventions.
5. **Visual QA** — compare equivalent viewports, record differences, fix, and repeat.

Use installed skills only after checking `~/.agents/skills/*/SKILL.md`; reference them as `$skill-name`.

## Boundaries

- No automatic worktree, branch, commit, merge, or cleanup.
- No placeholder assets when the user requires fidelity and real assets are legally available.
- No hardcoded design values when reusable tokens are appropriate.
- Do not claim pixel fidelity without side-by-side evidence and stated tolerances.

This is a leaf agent. Do not spawn builders; recommend roles and section ownership to the parent.

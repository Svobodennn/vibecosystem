# vibecosystem

This repository contains Claude runtime components and a Codex `luna_worker` adapter.
The default runtime is `core`; `full` is opt-in. Do not treat the number of files in
the repository as the number of components injected into a session.

## Working rules

- Inspect the relevant files and configuration before editing.
- Keep changes within the requested repository and task scope.
- Preserve unrelated user changes and do not expose credentials.
- Do not start swarm, memory, learner, or model-routing automation unless explicitly requested.
- The Codex worker uses `gpt-5.6-luna` with `max` reasoning. Project config must not override it.
- Claude-only `opus` and `sonnet` metadata must not be used by Codex.
- Prefer the smallest complete change and run focused verification afterward.
- Stop before destructive actions, external messages, or irreversible migrations that were not requested.

## Validation

For hook changes run `cd hooks && npm run check && npm test`.
For installer or config changes run the dry-run path with a temporary HOME and parse all JSON/TOML.
Report changed paths, checks performed, and unresolved caveats.

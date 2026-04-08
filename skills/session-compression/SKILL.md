---
name: session-compression
description: "Lossless session context compression for token efficiency. Extracts entities, decisions, and state into compact format before context window fills. 10-30x reduction in context size while preserving all actionable information."
---

# Session Compression

Compress session context without losing actionable information. Use before context window fills up or when handing off between sessions.

## Why Compress

| Metric | Raw Context | Compressed |
|--------|------------|------------|
| Token count | ~50K | ~3-5K |
| Decision count | Scattered | Indexed |
| File references | Buried in prose | Listed |
| Error history | Verbose stack traces | Root cause + fix |
| Reduction | 1x | 10-30x |

## Compression Format

### ACDE Format (Actions, Context, Decisions, Entities)

```markdown
## A: Actions Completed
- [x] Refactored auth middleware (auth.ts, middleware.ts)
- [x] Added rate limiting (api/limiter.ts)
- [ ] Pending: Write tests for rate limiter

## C: Context
- Project: my-app (Next.js 16, TypeScript)
- Branch: feat/auth-refactor (3 commits ahead of main)
- Blockers: None

## D: Decisions
- D1: JWT over sessions (stateless, mobile-friendly)
- D2: 100 req/min rate limit (based on load test)
- D3: Rejected Redis session store (overkill for current scale)

## E: Entities
- Files: auth.ts:42, middleware.ts:15, api/limiter.ts (new)
- Deps: jsonwebtoken@9.0.0, express-rate-limit@7.0.0
- APIs: POST /auth/login, POST /auth/refresh, GET /auth/me
```

## When to Compress

1. **Pre-compact**: Before context window compression (auto via hook)
2. **Session handoff**: When switching between sessions on same project
3. **Agent delegation**: When handing complex task to another agent
4. **Milestone reached**: After completing a significant piece of work

## Compression Rules

### What to Keep (Lossless)
- All decisions with reasoning (D1, D2, D3...)
- File paths and line numbers of changes
- Unresolved blockers or pending items
- Error root causes (not full stack traces)
- External constraints

### What to Drop (Safe)
- Exploratory reads that didn't lead anywhere
- Redundant confirmations ("yes that looks good")
- Intermediate debugging steps (keep only root cause)
- Tool output that was just for verification
- Repeated context that's already in CLAUDE.md

### Entity Coding
Replace verbose references with short codes:

```
"the authentication middleware in src/middleware/auth.ts" -> "auth.ts"
"the user requested that we use JWT tokens" -> "D1: JWT"
"the PostgreSQL database running on port 5432" -> "pg:5432"
```

## Integration

### Pre-Compact Hook
The `session-compressor` hook automatically generates ACDE format before context compression:

1. Scans recent tool calls for file paths -> E section
2. Extracts decisions from conversation -> D section
3. Lists completed/pending tasks -> A section
4. Summarizes project state -> C section

### With Memory Palace
Compressed sessions feed into the palace:
- Decisions -> stored as drawers in appropriate rooms
- Entities -> indexed for cross-session search
- Actions -> tracked in thoughts/PROGRESS.md

### With Compass Agent
Compass uses ACDE format for "where were we?" recovery:
```
Last session compressed:
A: 3 done, 1 pending (rate limiter tests)
D: JWT auth, 100rpm limit
E: auth.ts, middleware.ts, limiter.ts
```

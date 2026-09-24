# Environment investigation

Where to look on this machine once Phase 1 needs raw state, and how to report what you find. Preserved from the previous version of this skill; it is **reference, not a sequence**. It does not replace Phase 1: reading logs is how you feed a loop, not a substitute for having one.

## Where things live

**Logs**

- Project-local first: `./logs/`, `./log/`, `./.next/`, `./storage/logs/` (Laravel), `./var/log/` (Symfony)
- User-level: `~/.local/share/{app}/`, `~/Library/Logs/{app}/` (macOS)
- System: `/var/log/`
- Latest file: `ls -t ./logs/*.log | head -1`

**Databases**

- SQLite: `sqlite3 <path> ".tables"`, `.schema <table>`, then a targeted `SELECT ... ORDER BY created_at DESC LIMIT 5`
- Postgres/Supabase: the Supabase MCP (`execute_sql`, `query_logs`, `get_advisors`) beats shelling out when the project is a Supabase one
- Find the path in project config before guessing

**Services and ports**

```bash
ps aux | grep {service_name}
lsof -i :{port}
```

**Git state** (read-only, safe to run without asking)

```bash
git status
git log --oneline -10
git diff
```

## Parallel investigation

When the state to gather spans logs + database + git, dispatch it rather than serialising it in the main context. One `sleuth` per source, in a single message so they run concurrently:

- **Logs**: find the latest log, search for errors and warnings around the problem timeframe, note the working directory, look for stack traces and repeated patterns. Return: key errors with timestamps.
- **Database**: locate the DB, check the schema for the relevant tables, query recent rows, look for stuck states or anomalies. Return: relevant findings.
- **Git and files**: current branch, recent commits, uncommitted changes, whether expected files exist, permission issues. Return: git state and file issues.

Redact secrets in everything they hand back (see the Redact section in `SKILL.md`).

## Report format

```markdown
## Debug Report

### What's wrong
[One clear statement, grounded in evidence]

### Evidence
**Logs**: [error/warning with timestamp, pattern]
**Database**: [query + result]
**Git/files**: [recent changes that could be related]

### Root cause
[Most likely explanation, marked ✓ VERIFIED or ? INFERRED per rules/claim-verification.md]

### Feedback loop
[The one command from Phase 1, and its current verdict]

### Next
1. [Specific command or action]
2. [If that fails: ...]
```

## Outside reach

Some state you cannot see, and guessing about it wastes a phase. Ask the user for:

- Browser console and network panel (or drive it yourself with the `claude-in-chrome` tools)
- Production logs and dashboards you have no credentials for
- MCP server internal state
- Anything behind a login the agent doesn't hold

## Read-only by default

Investigation edits nothing. Once the root cause is known, the fix is a separate act under the usual gates: `spark` for a one-file change, `kraken` for anything larger, `@verifier` before it's called done.

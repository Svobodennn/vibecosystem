---
name: modular-code
description: File and package sizing - when a file is too large, where the natural split points are, and how to split one safely. Use when a file has grown past the size cap, when deciding how to lay out a new package, or when a refactor needs split points.
---

# Modular Code Organization

The mechanics of **file** and **package** layout: how big a file should be, where it splits, and how to split it without breaking callers.

This is the layout half of the design question. The shape half — how much behaviour hides behind how small an interface — is the `codebase-design` skill, and the two pull in opposite directions if you only read one:

> Splitting the **implementation** across files costs nothing. Splitting the **interface** is what makes a module shallow.

So a deep module may well span five files behind one entry point. That's correct, and this skill's size caps still apply to each of those files.

## File size

`rules/coding-style.md` sets the global cap: 200-400 lines normal, 800 max. Read this table as *what to do when you cross a line*, not as a target to fill.

| Lines | Status | Action |
|-------|--------|--------|
| under 400 | Optimal | Sweet spot for both AI editors and human comprehension |
| 400-800 | Large | Look for natural split points |
| 800-2000 | Too large | Split into focused modules |
| 2000+ | Critical | Must split: causes tooling truncation and cognitive overload |

Domain-specific numeric or generated code (a big constants table, a generated client, a solver) can legitimately sit past the cap. Say why, once, in a comment, rather than splitting it for the sake of the number.

## When to split

Any one of these is enough:

- The file exceeds the cap
- It holds multiple unrelated concerns (it is edited for several unrelated reasons: Fowler's **Divergent Change**)
- Finding a function means scrolling
- Its tests are hard to organise
- AI tools truncate or miss context in it

**And one reason not to:** line count alone. A 500-line file with one job is healthier than five 100-line files that must all be read together.

## Natural split points

1. **By domain concept** — `auth.py` → `auth/login.py`, `auth/tokens.py`, `auth/permissions.py`. Use the terms in `CONTEXT.md` if the project has one, so filenames and domain language agree.
2. **By abstraction layer** — interface separate from implementation. Dependency direction stays one-way (`rules/architecture-principles.md`).
3. **By data type** — group operations on related structures.
4. **By I/O boundary** — isolate database, network, and filesystem access from pure logic. This one doubles as a testability win: the pure part needs no adapter.

## Package shape

```
feature/
├── index.ts | __init__.py    # the interface: exports only, kept minimal
├── core.*                    # main logic
├── models.* | types.*        # data structures
├── handlers.*                # I/O and side effects
└── utils.*                   # pure helpers
```

The entry file is the module's **interface**. Everything else is implementation. If callers reach past the entry file to import internals, the seam isn't real yet.

**Do**

- Use meaningful module names (`data_storage` not `utils2`)
- Keep the entry file to exports
- Isolate pure functions from side effects
- Follow the language's own convention: `snake_case` modules in Python, `kebab-case` files in TS/JS unless the repo says otherwise

**Don't**

- Create single-function modules (that's a shallow module with extra steps)
- Over-modularise into package hell
- Hide dependencies behind magic imports or re-export chains

## Splitting an existing large file

1. **Identify clusters** — find groups of functions that change together
2. **Extract one cluster at a time** — never all at once
3. **Update imports**
4. **Run the tests after each move** — not once at the end
5. **Run the build too.** `tsc` does not see broken CSS-module paths, asset paths, or `import.meta.url` references; only the build does (`rules/architecture-principles.md`)

Point 5 is the one that bites. A file move that typechecks clean can still be broken at runtime, and the green gate for a move is build + test, not typecheck.

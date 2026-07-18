---
name: make-tool
description: Turn a repeated shell incantation into a reusable, agent-callable script under tools/. Use when you have run the same multi-flag command twice, or when a one-liner has grown into a pipeline worth naming and re-running. Not for a genuine one-off (that stays in your shell history or the scratchpad).
argument-hint: [what the tool should do]
---

# Make tool: promote a repeated incantation into `tools/`

**Input**: $ARGUMENTS (what the tool should do)

## When to reach for this

- You have typed the **same multi-flag command a second time** (rule 6: the third real use is the extract point, so the second is the signal to build it now).
- A one-liner has become a **pipeline worth a name** that you will run again.
- A future agent would need to rediscover an incantation you already worked out.

Do **not** build a tool for a true one-off. That stays in your shell history or the scratchpad. `tools/` is for scripts that earn their keep by running more than once.

## Steps

1. **Name the single purpose.** One sentence, one verb. If it needs an "and", that is two tools.
2. **Write it to the `tools/` contract** in `tools/CONVENTIONS.md`: `--help`/`-h`, meaningful exit codes, non-interactive, cwd-safe (resolve paths from the script location), stdin for large payloads, no secrets in argv.
3. **Pick the shells.** Author the POSIX `.sh` (the baseline: CI, Git Bash). Add a `.ps1` twin **only when the tool must run in the user's PowerShell shell** as an interactive path; the twin mirrors the `.sh` flags, stdin shape, and exit codes exactly. Give any `.sh` LF line endings.
4. **Prefer delegating over reimplementing.** If a vetted helper already does the hard part (a `.mjs`, a `gh` call), the tool is a thin wrapper over it. Do not re-derive its logic in shell.
5. **Catalog it.** Add a row to `tools/README.md` (tool, what it does, usage) in the same change.
6. **Point to it from `CLAUDE.md` only if broadly useful** across the workflow. A niche tool just lives in the `tools/` catalog.
7. **Prove it.** Run `--help` in each shell you shipped (exit 0) and one real smoke of the happy path. Fix the cause of any failure; do not paper over it.

## Guardrails

- **No premature abstraction (rule 6).** Do not build a shared shell library for the first two small wrappers. Extract on the third real use.
- **stdin over argv** for a claim, a diff, a file list, or any large payload.
- **No secrets in argv** (process table + shell history leak them). Read them from the environment or a file.
- **One purpose per script.** A flag matrix that forks behavior is a sign you are hiding two tools in one file.

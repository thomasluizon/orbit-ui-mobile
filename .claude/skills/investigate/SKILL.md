---
name: investigate
description: Root-cause a production incident end to end — pull the Sentry issue, correlate it to a Render deploy and its runtime logs, inspect the Postgres rows it implicates, localize the fault to code via csharp-lsp, then propose the minimal fix behind a human gate. Use when a production error, crash, Sentry alert, or "why is X broken in prod" needs diagnosing. Not for a local dev bug you already have a reproducible stack trace for — just read the code.
argument-hint: <sentry-issue-id | sentry-url | short description of the incident>
model: claude-fable-5
effort: medium
---

# Investigate: Production Incident Root-Cause

**Input**: $ARGUMENTS

Diagnose a live incident against the real systems — Sentry, Render, Postgres, and the code — and hand back a root cause plus the **minimal** fix. Every claim is pinned to evidence a tool returned; nothing is guessed.

## Operating rules

- **Read-only until the gate.** Phases 0–5 only *inspect* (Sentry, Render logs, a Postgres `SELECT`, code navigation). No edits, no data mutation.
- **Human gate before Phase 6.** Present the root cause + proposed fix and **STOP**. Do not touch a file until I approve. (Autonomy within the investigation; a gate before the change.)
- **Root cause, not symptom** (CLAUDE.md rule 1). Name the upstream cause — a missing validator, a nullable that should not be, contract drift, a migration gap. No workaround that masks it.
- **Verify, don't guess.** Each finding traces to a Sentry event, a Render log line, a DB row, or a code line. If a step's tool is unreachable, say so and continue — don't invent its output.

## Phase 0 — Frame the incident

Parse `$ARGUMENTS`:
- A Sentry issue id / short-id / URL → go straight to it.
- A description ("signup 500s", "widget crash on ColorOS") → search Sentry for the matching issue.

Confirm the Sentry org is `thomasluizon` and identify the project (api / web / mobile).

## Phase 1 — Sentry: what broke

- `mcp__sentry__search_issues` (or `mcp__sentry__get_sentry_resource` with the id) → exception type, culprit, level, first/last seen, event count, affected releases + environments.
- Pull a representative event → full stack trace, breadcrumbs, request context, tags, affected-user data.
- Optionally `mcp__sentry__analyze_issue_with_seer` for an AI root-cause hypothesis — treat it as a lead to verify against evidence, never as fact.

**Capture:** the exact exception + message, the top **in-app** stack frame (file:line), the release it started in, and how often / who it hits.

## Phase 2 — Render: what changed and what the runtime saw

- Ensure a Render workspace is selected: `mcp__render__get_selected_workspace`; if none, `list_workspaces` → **confirm the choice with me** → `select_workspace`. Never auto-pick.
- `list_services` → the orbit-api service. `list_deploys` / `get_deploy` → find the deploy whose window brackets the issue's first-seen. Did the error start right after a deploy? Which commit?
- `list_logs` across the incident window for that service → the runtime lines around the Sentry event timestamps (log context Sentry may lack).

**Capture:** the suspect deploy + commit if the error is deploy-correlated (or "not deploy-correlated"), and any runtime log detail the Sentry event is missing.

## Phase 3 — Postgres: what the data says (only if the fault implicates data)

- `mcp__render__query_render_postgres` — **read-only**. Inspect the rows the stack trace implicates: the offending record, an unexpected null, a violated constraint, a duplicate, the affected user's state.
- Never `UPDATE` / `DELETE` / `INSERT`. Confirm or kill the data hypothesis with a `SELECT`.

**Capture:** the row-level evidence, or "data not implicated."

## Phase 4 — Localize to code

- **orbit-api (C#) → csharp-lsp.** From the top in-app frame: `mcp__csharp-lsp__find_symbol` → the method; `find_callers` / `find_references` → how it is reached with the bad input; `get_diagnostics` on the file; `get_type_hierarchy` / `find_implementations` when the frame is an interface / virtual dispatch.
- **web / mobile (TS) →** Grep/Read the implicated `apps/web` or `apps/mobile` module and its shared types in `packages/shared`.

**Capture:** the exact repo/path:line of the fault and the code path that triggers it.

## Phase 5 — Root cause

One tight paragraph: the exact line + the condition that triggers it + why the deploy / data / input produced it *now*. Point at the upstream cause, not the thrown symptom.

## Phase 6 — Propose the minimal fix — THEN STOP (human gate)

Present, and wait for my approval before any edit:

- **Root cause** — one paragraph.
- **Minimal fix** — file:line → the smallest correct change that removes the cause (not a defensive branch around it). Flag: cross-platform parity if it is a UI/shared change; backend-source-of-truth if it is validation; the append-only contract if it is a DTO.
- **Regression test** — the test that would have caught this, to add with the fix.
- **Blast radius / verification** — what to run after (`/validate`, a targeted test), and what else the change touches.

On approval: implement with parity + the regression test, then hand to `/validate` (or `/pr-review`). Do not edit before approval.

## Output — the incident dossier (rendered before the gate)

```
## Incident: {exception} ({sentry-short-id})

- **Seen**: first {…} · last {…} · {N} events · {environment} · {who}
- **Deploy correlation**: {commit / deploy} — or "not deploy-correlated"
- **Data**: {row evidence} — or "not implicated"
- **Fault**: {repo}/{path}:{line} — {the trigger path}
- **Root cause**: {one paragraph}
- **Proposed fix (awaiting approval)**: {file:line → change} + {regression test} + {verification}
```

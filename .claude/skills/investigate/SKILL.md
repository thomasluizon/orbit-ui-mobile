---
name: investigate
description: Find the root cause of a production incident: read the Sentry issue, match it to a Render deploy and its logs, check the Postgres rows, find the fault in code, then post the cause and the fix on the ticket. Use for a production error, crash or Sentry alert.
argument-hint: <sentry-issue-id | sentry-url | short description of the incident>
---

# Investigate: root cause of a production incident

**Input**: $ARGUMENTS

Diagnose the incident against the real systems. Return the root cause and the minimal fix.

## Rules

- Phases 1 to 4 only read. Edit no file and change no data.
- Name the upstream cause: a missing validator, a nullable that should not be null, contract drift or a migration gap. Add no workaround that hides it.
- Tie each finding to a Sentry event, a Render log line, a database row or a line of code. If a tool is unreachable, say so. Never invent its output.
- The Render MCP has no workspace selected: never pick one.
- When the owner reports a defect again, prove each fix on an Android build, not only on the web.

## Phase 1: Sentry

The Sentry organization is `orbit-ai-habit-tracker`. The projects are `orbit-api`, `orbit-web` and `orbit-mobile`.

- Take the issue from the id or the URL. For a description, search the three projects for the matching issue.
- Read the exception, the culprit, the first and last seen times, the event count and the releases.
- Read one full event: the stack trace, the breadcrumbs, the request context and the tags.
- Treat a Seer hypothesis as a lead. Check it against the evidence.

Record the exception message, the top in-app frame (file:line), the first release and how many users it hits.

## Phase 2: Render

- Find the `orbit-api` service with the Render MCP. List its deploys. Find the deploy that starts before the first seen time. Name its commit.
- Read the runtime logs of the incident window. They show lines that Sentry lacks.

Record the suspect deploy, or write "not deploy-correlated".

## Phase 3: Postgres

Use the read-only Postgres MCP only when the fault involves data. Run a `SELECT` on the rows that the stack trace names: the offending record, an unexpected null, a broken constraint or a duplicate. Record the row evidence, or write "data not implicated".

## Phase 4: Find the code

- For `orbit-api`, use `csharp-lsp` from the top in-app frame: find the symbol, its callers and its references, and read the diagnostics of the file.
- For web or mobile, read the module in `apps/web` or `apps/mobile` and its types in `packages/shared`.

Record the exact path and line of the fault and the path that triggers it.

## Phase 5: Post the cause

Post this on the ticket: the root cause in one paragraph, the evidence of each phase, the minimal fix (file:line and the change), the regression test that would have caught it, and what to run afterward. Name the platform parity and contract rules that the fix touches. There is no owner gate. The delivery driver works the fix from the ticket.

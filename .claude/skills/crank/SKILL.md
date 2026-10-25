---
name: crank
description: Run the current orchestrator at maximum velocity without lowering quality gates. Use for /crank, max speed or max workers. /crank --disable or /crank disable restores the default pace. The mode survives context relays until disabled.
argument-hint: "[--disable]"
---

# /crank

**At a glance:** fill the configured worker pool and act on ready work immediately. Keep the
current run, its admitted queue and every quality gate. The mode persists until disabled.

## Set the mode

Read the current record with `readRunState` from `tools/lib/run-state.mjs`. Use the exact
session id established by `/sleep` or `/orchestrate`. If enabling with no active `/orchestrate`
run, invoke `.claude/skills/sleep/SKILL.md` first; it enters the canonical orchestrator.
Never create a separate loop or replace another session's run.
This standalone entry differs from `/wrap-up --crank` and `/handoff --crank`, which only
record successor intent when no run exists and never enter `/sleep` in the closing session.

For `/crank`, call `writeRunState({ ...state, crank: true })` with the freshly read record.
For `/crank --disable` or `/crank disable`, use `crank: false` instead. Keep the same
`sessionId` and every other field, including sleep mode, queue, relay state and readiness ledger.
Read back with `readRunState` and confirm the session id and requested boolean.
The matching run's boolean is authoritative for handoff guards and relay publication.
`recordHandoffRequest` applies a new true request to that run when recording it, so a later
disable supersedes an earlier request and a still newer explicit request enables it again.
Append one decision to this session's decision log using `/sleep`'s decision format. Use the
record's `decisionLogPath`; if absent, create the log in the session scratchpad outside every
repository and record that path. Disabling reports that the run is back to the default pace.

## Schedule at maximum velocity

While `crank` is true:

- Keep the local worker pool full up to `caps.parallelTickets` in `.claude/orchestrator.json`.
  The one-minute load gate and launch spacing remain safety gates. Read their current values
  from the spec or worker prompt; never invent new numbers or bypass admission, dependencies,
  relay drains or resource limits.
- Start every launchable ticket in the spec's order in parallel as capacity permits. Independent
  review rounds launch as soon as a review or red check lands, within the existing batch and
  attempt limits. Never wait on one pull request when independent work can run.
- Merge every pull request meeting the merge bar immediately, within the orchestrator's standing
  authority. Run its release immediately: production web, API and landing through `/release`;
  Android Open releases batch the merged Android fixes. Existing release authority and hard
  stops still apply.
- Merge the base into a branch immediately when a red check needs it, without waiting for another
  pull request to land first.
- Never idle while work can proceed. Every turn with unfinished work ends with a live registered
  wake source, named as `/sleep` requires. Retain the canonical completion condition.

The merge bar stays: the exact approved head, every check green and zero unresolved threads.
Pullfrog, tests, copy approval, the diff read before every push and all hard stops remain.
Crank changes scheduling only; it grants no new merge or release authority.

## Carry the mode forward

There is no time limit or relay count limit. `adoptRelayRun` in `tools/lib/session-chain.mjs`
spreads the predecessor's run state, so a successor inherits `crank: true` until
`/crank --disable` or `/crank disable` writes false.

A cranked context relay uses `/handoff --relay --sleep --crank`. Its `NEXT.md` starts with
`/sleep` and carries a `## Crank` section telling the successor to invoke `/crank` immediately
after `/sleep` entry. Read back the adopted state before queue work and apply this skill then.

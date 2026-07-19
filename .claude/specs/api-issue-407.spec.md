---
issue: 407
repo: thomasluizon/orbit-api
title: "Astra chat token usage is never recorded to AiUsageDaily (streaming turns log zero usage)"
status: draft
next-action: "/drive 407"
---

# Drive spec — orbit-api#407: chat token usage never recorded

Campaign sibling specs: [issue-530](issue-530.spec.md), [issue-517](issue-517.spec.md),
[api-issue-409](api-issue-409.spec.md), [api-issue-413](api-issue-413.spec.md).

Backend-only. No `packages/shared` contract or consumer change.

## Bundles

| # | repo | scope | status | plan | branch | PR |
|---|------|-------|--------|------|--------|----|
| A3 | api | Inject `IAiUsageRecorder` into `AiIntentService`; enable `StreamOptions.IncludeUsage` so `update.Usage` is populated on the final streamed chunk (today it is always null → `LogChatUsage(null, …)` returns early at `AiIntentService.cs:406-407`, so the DOMINANT surface logs nothing); record **per round** (not per message — one Astra message fans out to up to 6 model calls, `ProcessUserChatCommand.cs:99` `MaxToolIterations = 5`) for both buffered (`:166`) and streaming (`:206`) with `purpose: "chat"` + the real model tier, mirroring `AiCompletionClient.RecordUsageAsync` (`:179-204`). Best-effort: a recorder failure must never fail the chat response. Unit tests mirroring `AiCompletionErrorTests`. **Rides along: [#530](issue-530.spec.md) `ORBIT-API-N`** (`DbUpdateException` on `POST /api/Chat/stream`, 9 events) — same chat-persistence path; #530 explicitly says to coordinate here. | todo | - | - | - |

## Acceptance criteria (from the issue)
- A chat turn, buffered AND streaming, writes a `Purpose = "chat"` row to `AiUsageDaily` with non-zero prompt + completion tokens and cached tokens populated.
- Multi-round tool turns record each round.
- A recorder failure never fails the chat response.
- Unit tests assert buffered + streaming rounds invoke `IAiUsageRecorder.RecordAsync` with the expected purpose, model, and token counts.
- **Added here:** `ORBIT-API-N` root-caused and fixed (or proven unrelated and split back out).

## Decisions (from grilling — durable across every /clear)
- _pending grill_

## Reconcile log
- 2026-07-16 — init. No open PRs. `ORBIT-API-N` confirmed still unresolved in live Sentry (9 events, last seen 10 days ago).

---
issue: 409
repo: thomasluizon/orbit-api
title: "Add rate limiting to the /mcp endpoint"
status: draft
next-action: "/drive 409"
---

# Drive spec — orbit-api#409: /mcp has zero rate limiting

Campaign sibling specs: [issue-530](issue-530.spec.md), [issue-517](issue-517.spec.md),
[api-issue-407](api-issue-407.spec.md), [api-issue-413](api-issue-413.spec.md).

Flagged **Wave 1 (NOW)** / HIGH severity in the issue body — a leaked token or a runaway
assistant loop amplifies DB writes, BCrypt CPU burn, and unbounded OpenAI spend with no 429
ever returned. Sequenced early for that reason.

## Bundles

| # | repo | scope | status | plan | branch | PR |
|---|------|-------|--------|------|--------|----|
| A6 | api | Add a distributed rate limit in the MCP middleware, partitioned by `api_key_id` (the authenticated principal is already available via `ApiKeyAuthenticationHandler`). Root cause: the only limiter is an MVC action filter (`DistributedRateLimitAttribute.cs:26,34`, `IAsyncActionFilter`), and `/mcp` is mapped via `app.MapMcp("/mcp")` (`WebApplicationExtensions.cs:63`) — not an MVC action, so the filter never runs; there is no `AddRateLimiter`/`UseRateLimiter` anywhere. Add a stricter sub-limit for AI-bearing tools (`get_daily_summary` / `get_retrospective`, `Mcp/Tools/.../HabitTools.cs:490-537`). Reuse the existing `DistributedRateLimitBuckets` infra. | todo | - | - | - |

## Open questions for the gate
- Concrete limits (requests/min per api key; the stricter AI-tool sub-limit) are unspecified in the issue — needs a decision at grill.

## Decisions (from grilling — durable across every /clear)
- _pending grill_

## Reconcile log
- 2026-07-16 — init. No open PRs.

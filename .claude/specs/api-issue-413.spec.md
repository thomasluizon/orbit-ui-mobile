---
issue: 413
repo: thomasluizon/orbit-api
title: "Fix broken retrospective AI cache invalidation (stale after every log)"
status: draft
next-action: "/drive 413"
---

# Drive spec — orbit-api#413: retrospective cache never invalidates

Campaign sibling specs: [issue-530](issue-530.spec.md), [issue-517](issue-517.spec.md),
[api-issue-407](api-issue-407.spec.md), [api-issue-409](api-issue-409.spec.md).

Backend-only. Root-cause fix, no workaround.

## Bundles

| # | repo | scope | status | plan | branch | PR |
|---|------|-------|--------|------|--------|----|
| A7 | api | Setter and invalidator build keys that can never match: setter writes `retro:v2:{userId}:{period}:{DateFrom}:{lang}` (`GetRetrospectiveQuery.cs:62,107-110`) while `InvalidateRetrospectiveCache` removes `retro:{userId}:{period}:{today+/-2}:{lang}` (`CacheInvalidationHelper.cs:29-38`) — MISSING the `v2:` prefix AND keyed on `today+/-2` instead of the period-start `DateFrom`, so the call at `LogHabitCommand.cs:211` no-ops. Fix: build the SAME keys (add `v2:`, compute each period's `DateFrom` via `RetrospectivePeriodRange.Resolve(period, today, weekStartDay)`), and **share a single key-builder between setter and invalidator so they cannot drift again**. | todo | - | - | - |

## Notes
- The issue mentions coordinating with the Orbit Wrapped backend issue (adds a `recap:v1:` cache using the same corrected pattern). That issue is NOT in the `phase:1` set — the shared key-builder should be shaped so Wrapped can reuse it, but Wrapped itself is out of scope here.

## Decisions (from grilling — durable across every /clear)
- _pending grill_

## Reconcile log
- 2026-07-16 — init. No open PRs. Matches the standing note that this needs its own PR.

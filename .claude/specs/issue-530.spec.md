---
issue: 530
repo: thomasluizon/orbit-ui-mobile
title: "Sentry triage: root-cause and fix all open production issues"
status: draft
next-action: "/drive 530"
---

# Drive spec — #530: Sentry triage (all open production issues)

Campaign sibling specs: [issue-517](issue-517.spec.md), [api-issue-407](api-issue-407.spec.md),
[api-issue-409](api-issue-409.spec.md), [api-issue-413](api-issue-413.spec.md).

Mandate: root-cause fix every open Sentry issue. No suppress-only / ignore-without-fix.
Fix by ROOT-CAUSE GROUP, not one PR per Sentry issue. Backend items use `/investigate`.

## Live Sentry reconcile — 2026-07-16

Dashboard: https://thomasluizon.sentry.io/issues/?query=is%3Aunresolved
Live count **28 unresolved** vs the issue body's **25**-item snapshot (2026-07-15).

- All 25 snapshot items are STILL unresolved — nothing self-resolved, nothing to drop.
- **3 live issues are NOT in the issue body** (reconcile findings, folded in below):
  - `ORBIT-API-8` — `TaskCanceledException` on `POST /api/Auth/send-code` (1 event, Seer super_low) → bundle A9.
  - `ORBIT-API-6` — `DbUpdateConcurrencyException` on `GET /api/Calendar/events` (1 event, Seer low) → folds into the calendar cluster, bundle A5.
  - `ORBIT-MOBILE-3` — `ApplicationNotResponding: ANR` (1 event, Seer super_low) → the KNOWN expo-clipboard ANR, previously **deferred**. → bundle U4.

## Bundles

Ordered by dependency. **A1 is first: it is a deploy footgun that can block every other API bundle from shipping** (orbit-api runs EF migrations at startup).

| # | repo | scope | Sentry | status | plan | branch | PR |
|---|------|-------|--------|--------|------|--------|----|
| A1 | api | EF `PendingModelChangesWarning` at startup — add the missing migration. Deploy footgun. | S | todo | - | - | - |
| A2 | api | Auth token-refresh transaction lifetime/concurrency (`POST /api/Auth/refresh`). P0, user-facing auth breakage. | P, Q, R | todo | - | - | - |
| A3 | api | Chat stream persistence + chat usage recording. **Canonical owner: [api#407](api-issue-407.spec.md)** — `ORBIT-API-N` rides along. | N | todo | - | - | - |
| A4 | api | Supabase session-pooler exhaustion in background services (`pool_size: 15`) — bound concurrency / per-iteration scope. | B, 9, A | todo | - | - | - |
| A5 | api | Calendar cluster: DbCommand failures + Google OAuth creds + auto-sync optimistic concurrency + color-scheme concurrency. Verify `ORBIT-WEB-4` (web calendar-sync race) resolves with the API fix. | 3, 2, C, D, 6, 7, E, F, 5, WEB-4 | todo | - | - | - |
| A9 | api | API triage tail: FluentValidation noise on `calendar-month` (G — confirm bad-input vs bug, stop error-logging if input), `suggest-setup` JSON shape harden (K), send-code timeout (API-8). | G, K, API-8 | todo | - | - | - |
| U3 | ui | Web BFF opaque-500 error shaping. **Canonical owner: [issue-517 §4](issue-517.spec.md)** — `ORBIT-WEB-8` / `ORBIT-WEB-7` ride along. | WEB-8, WEB-7 | todo | - | - | - |
| U4 | ui | UI triage tail: `/streak` TypeError (WEB-6, genuine web bug), clipboard ANR (MOBILE-3), + Sentry inbound filters for confirmed noise (MOBILE-4 device-offline; WEB-5/WEB-2 upstream passthroughs — verify not user-facing regressions first). | WEB-6, MOBILE-3, MOBILE-4, WEB-5, WEB-2 | todo | - | - | - |

## Decisions (from grilling — durable across every /clear)
- _pending grill_

## Open questions for the gate
- Fold the 3 reconcile findings (API-8, API-6, MOBILE-3) in? Mandate says "every open Sentry issue" → default YES.
- MOBILE-3 clipboard ANR was consciously **deferred** before (fix = swap `expo-clipboard` → `@react-native-clipboard/clipboard`). Reverse that deferral now, or keep deferred?
- Per the Process section: after a real fix ships, resolve the Sentry issue via the deploy — never bulk-ignore. Inbound filters ONLY for confirmed input-noise / device-offline.

## Reconcile log
- 2026-07-16 — init. Live Sentry pulled: 28 unresolved vs 25 in the snapshot; all 25 still open; 3 unlisted issues found (API-8, API-6, MOBILE-3) and folded into A9/A5/U4. No open PRs in either repo.

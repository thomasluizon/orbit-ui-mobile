---
issue: 517
repo: thomasluizon/orbit-ui-mobile
title: "QA sweep: Today search persistence + active-state, Astra action-chip label/name, Astra summary factual grounding, opaque create-habit 500"
status: draft
next-action: "/drive 517"
---

# Drive spec — #517: QA sweep (4 defects)

Campaign sibling specs: [issue-530](issue-530.spec.md), [api-issue-407](api-issue-407.spec.md),
[api-issue-409](api-issue-409.spec.md), [api-issue-413](api-issue-413.spec.md).

The issue itself states the natural split is 4 PRs, some cross-repo. Cross-platform parity is
mandatory: every frontend fix lands in BOTH `apps/web` and `apps/mobile` in the same PR, and
i18n keys land in BOTH `en.json` and `pt-BR.json`.

## Bundles

| # | repo | scope | status | plan | branch | PR |
|---|------|-------|--------|------|--------|----|
| U1 | ui (shared+web+mobile) | §1 Today search. Root fix: stop persisting `searchQuery` (`packages/shared/src/stores/ui-store.ts:61,76,161`) so it clears on cold start/reload. Plus an active-state indicator on the search control mirroring the funnel's existing treatment (mobile `today-habits-header.tsx:572-589`, web `today-shell.tsx:345-353`), incl. `accessibilityState` / `aria-pressed`. | todo | - | - | - |
| U2 | ui (shared+web+mobile) | §2 Astra action chip — add `UpdateChecklist` / `update_checklist` to `ACTION_LABELS` in both `action-chips.tsx`; audit the other missing PascalCase types spotted alongside (`DuplicateHabit`, `MoveHabitParent`, `LinkGoalsToHabit`); add `chat.action.updatedChecklist` to `en.json` + `pt-BR.json`. **Paired with A-entityName.** | todo | - | - | - |
| A-entityName | api | §2 true fix for "Desconhecido" — populate `entityName` (habit title) on the `UpdateChecklist` tool result the way other habit tools do. **Paired PR with U2, cross-linked.** | todo | - | - | - |
| A8 | api | §3 Astra daily summary factual grounding (backend-only). Label the global streak unambiguously + forbid attaching it to a habit (`AiSummaryService.cs:123,140-153`); stop silently dropping skipped good habits (`GetDailySummaryQuery.cs:81-83`); align relevance with the Today screen's occurrence logic `IsHabitDueOnDate` (`AiSummaryService.cs:64-88,238-240`); widen the per-habit log window from today-only to ~7-14 days with a compact adherence signal so consistency claims are grounded; consider temp 0.7 → ~0.3. Tests: `AiSummaryServiceTests.cs` + `GetDailySummaryQueryHandlerTests.cs`. | todo | - | - | - |
| U3 | ui (web+shared+mobile) | §4 the durable product bug: the web BFF masks ANY upstream error as an opaque 500. Re-shape `ApiClientError` at the Server Action boundary (`apps/web/lib/server-fetch.ts:52-54`, `apps/web/app/actions/habits.ts:33-38,53-58`) to preserve `status`/`errorCode`/`message` across server→client; map codes to localized keys in `packages/shared/src/utils/error-utils.ts` (add a real `PAY_GATE` key, currently falls through at `:391`); mobile parity in `create-habit-modal.tsx:290-294`. Regression test on the Server Action error shaping. **Also closes [#530](issue-530.spec.md) `ORBIT-WEB-8` + `ORBIT-WEB-7`.** | todo | - | - | - |

## Not code — carried to the gate
- **§4 ops (Cloudflare WAF):** the 403 came from Cloudflare's managed ruleset at the edge, not orbit-api. Reviewing/tuning the WAF rule that blocked legitimate habit content is a conscious product decision (blocking injection payloads may be desirable; a false positive on user-generated content is a UX risk). User-executed in the Cloudflare dashboard.
- **§4 optional defense-in-depth (NOT the cause):** `.max(200)`/`.max(10000)` on `createHabitRequestSchema`/`updateHabitRequestSchema` (`packages/shared/src/types/habit.ts:235-236,282-283`) + a description-length invariant in `Habit.Create`/`Habit.Update` (`src/Orbit.Domain/Entities/Habit.cs:140,361`) to match the existing 10k FluentValidation cap. In or out?

## Decisions (from grilling — durable across every /clear)
- _pending grill_

## Reconcile log
- 2026-07-16 — init. No open PRs in either repo. §4's `ORBIT-WEB-8` confirmed still unresolved in live Sentry (2 events, first seen 1 day ago).

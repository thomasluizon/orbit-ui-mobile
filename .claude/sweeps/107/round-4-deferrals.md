# Round-4 deferrals (orbit-api)

## DEF-R4-1 — v1 sync route `SyncController.GetChanges` (`[HttpGet("changes")]`) KEPT, not deleted

Contract sweep #8 (round-3) flagged the v1 `GetChanges` route as server-side dead because no `endpoints.ts` client constant points at it (the v1 client Zod schema was deleted in round-2; apps now use `sync.changesV2`). Task-3 decision: **KEEP the route + its v1 DTOs/handler/mappers.** Evidence the route is NOT zero-reference inside orbit-api and carries a backward-compat risk:

1. Live in-repo callers exist (not zero-caller):
   - `tests/Orbit.Infrastructure.Tests/Controllers/SyncControllerTests.cs:57,104` — two behavioral tests (`GetChanges_SinceIsTooOld_ReturnsGone`, `GetChanges_ReturnsUpdatedAndDeletedEntitiesForCurrentUser`) exercise the v1 action + assert on `SyncController.SyncChangesResponse`.
   - `src/Orbit.Infrastructure/Services/AgentCatalogService.cs:1234` — the agent `SyncRead` capability lists `"SyncController.GetChanges"` in its `controllerActions`; deleting the route would require editing the agent capability catalog.
2. Old-app-version backward-compat: Orbit is in open beta on Play (individual dev account, org migration pending — project memory). Older installed app builds that predate the v2 cutover may still issue `GET /api/sync/v2/changes`'s predecessor `GET /api/sync/changes`. Removing the route would 404 those clients mid-sync. The v2 route was added alongside v1 (both live), which is the standard additive-deprecation posture; there is no evidence the v1 floor is safe to remove yet.
3. The v1 DTOs it owns (`SyncChangesResponse`, `SyncEntitySet`, `BuildEntitySet`) are referenced only by the v1 action + its tests, so they are not independently dead — they are dead-with-the-route, and the route is being kept.

Disposition: no code change. Revisit once Play telemetry/minimum-supported-app-version confirms no installed client calls v1, AND the agent-catalog `controllerActions` entry + the two SyncController tests are migrated/removed in the same change. This is a deliberate keep, not an oversight.

---

# Round-4 a11y deferrals (orbit-ui-mobile) — D7 contrast residuals

These three are the ONLY contrast residuals left after the R4-A11Y sweep migrated every enumerated fg-4-as-text, placeholder-override, status-base-as-text, confirm-pill, tab-icon, and control-boundary site. Each was migrated to its prescribed token (a strict improvement); the residual sub-4.5 is inherent to the design and is documented here with computed WCAG ratios (relative-luminance; per-scheme × mode). Contrast script: `.claude/sweeps/107/round-2/contrast.mjs` + ad-hoc tint blends.

## DEF-R4-A11Y-1 — `--primary` as accent TEXT (links, text-buttons, dialog actions) — light-mode systemic, DEFER

`--primary`/`tokens.primary` is the locked navy-violet accent (DESIGN.md, "violet accent locked"). It is the app-wide design language for interactive accent text: text-buttons (`actionLink`, `secondaryActionText`, dialog confirm/cancel text), markdown/prose links (always `textDecorationLine: 'underline'` — a non-color affordance), step numbers, and the selected goal-chip label. ~24 mobile sites + the web equivalents.

Computed `--primary` as small text on the mode canvas (`bg`):

| Scheme | light on `#f8fafc` | dark on `#020618` |
|---|---|---|
| purple | 6.72 | 3.96 |
| blue | 5.01 | 5.36 |
| green | **3.08** | 9.09 |
| rose | 4.33 | 5.37 |
| orange | **3.44** | 6.98 |
| cyan | **3.46** | 8.52 |

Fails 4.5 as small text in: green/orange/cyan light (3.08–3.46), purple dark (3.96). Passes ≥4.5 elsewhere. As ICONS (3:1 non-text floor) every value passes, so primary-colored icons (e.g. reminder-section remove-X `X size={13}`, today checkmarks) are NOT failures and were left as-is.

Justification for deferral (not fixed): the only fix is a new per-scheme AA-darkened `--primary-text` token applied across the entire accent-text language — a design-system change to the locked accent, out of scope for a consumer-migration sweep and contrary to DESIGN.md. Every affected affordance carries a non-color cue (underline on links; button shape/position on text-buttons; selection ring+fill on the chip). WCAG 1.4.1 (color not sole indicator) is satisfied; only 1.4.3 (text contrast) is short, and only in the listed light schemes. Revisit as a dedicated DESIGN.md token decision (`--primary-text` per scheme) if accent-text AA is prioritized.

## DEF-R4-A11Y-2 — selected goal-chip `%` + label: `--primary-soft` on `--selection-bg` — light residual, DEFER

`goal-linking-field` selected chip (web `chip-active` + mobile `chipSelected`). MIGRATED this sweep: the `%` label and chip label from `--primary`→`--primary-soft` (web) / `tokens.primary`→`tokens.primarySoft` (mobile), and the UNSELECTED `%` from fg-4→fg-3. The primary-soft switch fully clears dark mode.

Computed `--primary-soft` on `--selection-bg` (chip-active fill = primary @ .18 light / .32 dark over canvas):

| Scheme | light | dark |
|---|---|---|
| purple | 4.91 | 6.39 |
| blue | 3.87 | 6.66 |
| green | **2.52** | 6.98 |
| rose | **3.16** | 6.19 |
| orange | **2.72** | 6.95 |
| cyan | **2.80** | 6.90 |

Dark: all ≥6.19 (pass). Light: green/orange/cyan/rose/blue 2.52–3.87 (fail 4.5). In light mode `--primary-soft == --primary` (locked accent), and the selection tint is very pale, so no token short of fg-1/fg-2 clears it — which would destroy the accent semantic. The selected state is conveyed redundantly (ring `inset 0 0 0 1px rgba(primary,.45)` + selection-bg fill + bold accent label), so selection is not color-only. Same locked-accent rationale as DEF-R4-A11Y-1.

## DEF-R4-A11Y-3 — amber status text on amber tint: badge + expiry-warning — light residual, DEFER

MIGRATED this sweep: `badge.tsx` amber tone and `expiry-warning` (both platforms) from `--status-overdue`/`tokens.statusOverdue` → `--status-overdue-text`/`tokens.statusOverdueText`. Strict improvement; dark fully clears.

Computed overdue text on its own tint background:

| Surface | base-token light | `-text`-token light | dark (`-text`) |
|---|---|---|---|
| badge (overdue @18% tint) | 2.52–2.62 | **3.72–3.87** | 6.29–7.29 |
| expiry-warning (overdue @10% tint) | 2.75 | **4.06** | 8.44 |

The `-text` token is the canon-prescribed fix and raises light contrast from ~2.5 to 3.7–4.1, but amber text on an amber tint cannot reach 4.5 without either darkening the `-text` value further (would fail on the dark canvas, where `-text` must stay `#fe9a00`) or darkening/removing the tint fill (a per-component design change). Both badge labels are 10.5px/600 uppercase and expiry copy is 13px; neither qualifies as AA-large. Deferred as the residual ceiling of the amber-on-amber treatment; the alternative is a tint/token redesign owned by DESIGN.md. The badge amber tone is decorative status emphasis (paired with the badge text content), not a sole status indicator.

---

# Round-6 test-quality deferrals (orbit-ui-mobile + orbit-api) — sweep #9 LOW residuals

Round-6 (R6-CLEANUP) FIXED the only genuinely-missing tests sweep #9 named — the round-4 split chat sub-hooks:
- `apps/web/__tests__/hooks/use-chat-pending-operations.test.ts` (NEW, 6 tests) — confirm→execute→onExecuted chain, confirm-failure short-circuit, the step-up confirm→issue→verify→execute chain, and the failure branches that must not execute.
- `apps/web/__tests__/hooks/use-chat-image-attachment.test.tsx` (NEW, 6 tests) — valid pick clears the error + builds a preview, type/size rejection→i18n key, paste capture + preventDefault, and the object-URL revoke on remove.
- `apps/mobile/__tests__/hooks/use-pending-operation-execution.test.tsx` (NEW, 4 tests) — the step-up `prepareStepUpForBubble` (confirm→issue, language forwarded) and `verifyStepUpForBubble` (verify→execute→append) branches that were previously only reachable inline + untested through the parent composer.

The following sweep #9 items are the remaining pre-existing LOW test-quality residuals. Each was evaluated for a cheap fix; each is registered because the rewrite either (a) requires adding `data-*` attributes to production source purely to satisfy a test (a production change for a test-quality nit, contrary to surgical-changes discipline), or (b) duplicates behavior already covered elsewhere. None is a round-4/round-6 regression.

## DEF-R6-TEST-1 — web class-name / CSS-selector assertions (~9 files) — DEFER (rewrite touches production source)

Files: `pages/login.test.tsx` (`toHaveClass('max-w-[26rem]')`, `space-y-4`), `pages/streak.test.tsx` (`.streak-hero__count` querySelector), `components/goals/goal-card.test.tsx` + `components/habits/habit-checklist.test.tsx` (`line-through`), `components/goals/goal-list.test.tsx` (`drag-chosen`), `components/ui/skeleton.test.tsx` (`skeleton-pulse`, `w-1/2`, `h-5`), `components/ui/empty-state.test.tsx` (`custom-class`), `components/chat/message-bubble.test.tsx` (`justify-end`/`rounded-full`), `components/chat/suggestion-chips.test.tsx` (`chip`), `components/ui/markdown.test.tsx` (`prose-orbit`), `components/ui/app-overlay.test.tsx` (`var(--safe-bottom)`).

Verified non-mechanical: e.g. `goal-card.tsx:134` applies `line-through` via an inline `goal.status === 'Abandoned' ? …` ternary with NO `data-status`/`data-state` attribute; a behavior rewrite would require adding that attribute to the production component. The same holds for the skeleton (`skeleton-pulse`/sizing are the decorative contract; `aria-hidden` is already asserted), the login layout-width caps, the markdown `prose-orbit` class, and the overlay safe-area class — these are styling/presentational contracts whose only observable surface IS the class. Where a behavioral equivalent exists it is already asserted in the same file (goal-card deadline/overdue badges :80-90; login button/role/text :142-143). The `className`-only assertions add nothing behaviorally and removing them loses the presentational coverage; rewriting them all cascades into ~9 production `data-*` additions. Registered rather than force-rewritten.

## DEF-R6-TEST-2 — thin-wrapper mobile hooks with shared cores already tested — DEFER (logic covered elsewhere)

`apps/mobile/hooks/use-summary.ts`, `use-habit-form.ts`, `use-resolve-clarification.ts`, `use-review-reminder.ts` lack direct renderHook tests. Each is a thin platform wrapper over `@orbit/shared` logic that IS unit-tested in `packages/shared/__tests__`. The one non-shared seam (`use-resolve-clarification` success-gated invalidation, `use-review-reminder` StoreReview→Linking fallback) is small; a direct port is net-new test authoring rather than a fix to an existing weak test. Registered as a low-value coverage gap (the user-facing logic is exercised through the shared core + the screen tests that mount these hooks).

## DEF-R6-TEST-3 — hand-rolled `NormalizedHabit` fixtures vs `createMockHabit` — DEFER (mechanical sweep, no behavior change)

12+ test files hand-roll ~35-field `NormalizedHabit`/`makeHabit` literals instead of `packages/shared/src/__tests__/factories.ts#createMockHabit`. Replacing them is a pure cross-file refactor with zero behavior change and zero coverage gain; the local literals are correct and green. Deferred as cosmetic test-DRY, to be done as its own mechanical pass (touching 12 files mid-cleanup risks churn against the concurrent a11y agent's files). Not a correctness issue.

## DEF-R6-TEST-4 — orbit-api reflection / private-member tests — DEFER (API-repo, separate PR)

6 AI-service test files reach private members via `BindingFlags.NonPublic`; `GetHabitByIdQueryHandlerTests` writes private `Habit._children`. These are brittle (a private rename breaks them with no behavior change) but live in the orbit-api repo (separate git history / separate PR per cross-repo rules) and the proper fix (assert at the mocked AI-client boundary; build the graph via the public `Habit` API) is a non-trivial rewrite, not a cheap edit. Out of scope for this orbit-ui-mobile cleanup branch; registered for an API-side test-hardening pass.

## DEF-R6-A11Y-1 — `status-bad` text on `status-bad`@18% tint: pastDue billing badge — light residual, DEFER (bad-tone twin of DEF-R4-A11Y-3)

Round-6 F2. The hand-rolled "pastDue" billing badge (web `apps/web/app/(app)/upgrade/page.tsx:409-422`, mobile `apps/mobile/app/upgrade.tsx:650-661`) is NOT the `<Badge>` primitive (which has no `bad` tone), so the R4 badge `-text` migration never reached it. 10.5px/600 uppercase `--status-bad`/`tokens.statusBad` text on a `--status-bad`@18% tint over canvas. Computed (`.claude/sweeps/107/round-5/amber-bad-surfaces.mjs` calculator, hex-only, first-principles WCAG relative-luminance):

| Surface | base / `-bad-text` light | dark (`-bad-text`) |
|---|---|---|
| pastDue badge (bad @18% tint, light bg `#f5cdd1`) | **3.30** | 4.61 ✓ (dark bg `#2f0d1d`) |

Migrating to `--status-bad-text`/`tokens.statusBadText` is a **no-op in light**: by design `badText` light == base `#e7000b` (bad-on-solid-surface already clears AA at 4.56 canvas / 4.77 white card — the tint is the only surface where it fails), so the `-text` token does not darken it. Reaching AA 4.5 on this light tint requires text darker than `#c10007` (only 4.44; `#a60008` = 5.54) — i.e. a new darker bad-text-on-tint value that would have to stay `#fb2c36` on the dark canvas (where it already passes at 4.61), or darkening/removing the 18% fill. Either is a per-component tint/token redesign owned by DESIGN.md — exactly the DEF-R4-A11Y-3 ceiling shape, in the bad tone instead of amber. The badge label is 10.5px/600 uppercase (not AA-large-exempt) but `past_due` status is conveyed by the badge text content itself, not color alone (WCAG 1.4.1 satisfied; only 1.4.3 short, light only). Deferred as the residual ceiling; revisit alongside DEF-R4-A11Y-3 if the status-tint treatment is redesigned.

## DEF-R6-A11Y-2 — web habit-row `role="button"` wrapping nested `<button>` children (APG 4.1.2) — DEFER (DEF-2b forbids the structural fix)

Round-6 F3. `apps/web/components/habits/habit-row.tsx:161` — the row container is `<div role="button" tabIndex={0} onClick={handleRowClick} onKeyDown={Enter/Space → handleRowClick}>` and contains nested interactive `<button>` descendants (expand `:198`, the check/toggle control, the overflow menu). WAI-ARIA APG says a `button` role should not contain focusable/interactive descendants.

The two APG-clean fixes both violate a binding constraint here:
1. **Remove `role="button"`/`tabIndex`/keydown from the container** — strips the row's own keyboard affordance. The whole-row tap opens the habit detail (or toggles selection in select-mode); that action is reachable by keyboard ONLY through the container's `role="button"` + Enter/Space handler. Demoting the container to a plain `<div>` orphans open-detail from the keyboard (the nested buttons are expand/check/menu, none of which open detail).
2. **Split the row** — move the whole-row click to a sibling full-bleed `<button>` overlay so the expand/check/menu buttons become siblings rather than descendants. This is exactly the structural split DEF-2b (wave-3 `DEFER:root`; habit-row is an n-family orchestration root — "Irreducible data-derivation root") forbids, and it risks the row's keyboard/focus order.

Round-3 offered "accept/document"; the row already carries non-color, non-ambiguous affordances (visible hover/active states, an explicit overflow menu, focus ring via global `:focus-visible`), and screen readers still reach every nested control. Deferred per the brief's explicit instruction: "DEF-2b forbids splitting the row — if the fix risks the row's keyboard nav, defer with that reason." Mobile has no twin (RN `Pressable` rows do not surface an ARIA `button`-with-descendants conflict). Revisit only if DEF-2b is lifted and the row may restructure.

# Round-5 sweep #2 — Web ↔ Mobile parity (issue #107) — FINAL VERIFICATION

Baseline: ui-mobile `3520d10` (committed green), branch `main`. Read-only. Verifies the three round-3 LOW survivors (R2-7, R2-9, R2-11) landed in round 4, the cross-domain items the brief routed here (drill error F1, revoke F14, profile.language sync, login offline F15), and that the r4 chat/calendar splits introduced no NEW one-sided surface.

## Round-3 survivors — all RESOLVED in round 4

- **R2-7 dead web `claimAdReward`** — **FIXED.** `apps/web/app/actions/subscription.ts` now exports only `createCheckoutSession` + `openCustomerPortal`; `claimAdReward` deleted. Repo-wide grep (source, excl. `.next` build cache): ZERO matches. Rewarded-ad earn stays mobile-only (allowed asymmetry).
- **R2-9 web profile.language sync** — **FIXED.** `apps/web/hooks/use-profile.ts:60-64` adds an effect: when `profileLanguage && profileLanguage !== locale`, it `writeLocaleCookie(profileLanguage)` + `globalThis.location.reload()`. This mirrors mobile's continuous `i18n.changeLanguage(profile.language)` — a remote language change now reaches an already-authenticated web session. The round-3 divergence is closed.
- **R2-11 dead web `useInvalidateSummary`** — **FIXED.** Deleted from `apps/web/hooks/use-summary.ts`; repo-wide grep (source): ZERO matches. Summary invalidation flows through `habitKeys.summaryPrefix()` in mutation `onSettled` on both platforms.

## Brief-routed cross-domain items

- **Drill error F1 — rendered BOTH platforms.** Web `apps/web/components/habits/habit-list/drill-content.tsx:42-57` now renders a `role="alert"` error branch in `var(--status-bad)` BEFORE the "No sub-habits yet" empty fallback; `habit-list.tsx:1123` threads `drillError={drill.drillError}` through. Mobile `apps/mobile/components/habit-list.tsx:1640-1641` renders `drill.drillError`. The round-3 "empty-as-error on web" gap is closed. **FIXED.**
- **Revoke F14 — aligned.** Web `apps/web/app/(app)/advanced/page.tsx:444-453` reduced the revoke chip to `setRevokingKeyId(key.id)`; confirmation is now the kit `<ConfirmDialog>` at `:639-650` (`orbitMcp.revoke` / `orbitMcp.revokeConfirm`). Mobile `apps/mobile/app/advanced.tsx:533-543` uses the same `ConfirmDialog` + identical keys. The round-3 inline-status-bad-banner-vs-modal divergence is unified. **FIXED.**
- **F15 login offline copy — aligned.** Mobile `apps/mobile/app/login.tsx:170-171` `t('offline.title')` + `t('offline.description')`, rendered via `OfflineUnavailableState` (`:461-465`). Borrowed `calendarSync.notConnected` gone from login. **FIXED.**

## NEW one-sided surfaces from r4 chat/calendar splits — swept

- **Chat split** (`useChatComposer` hook + `chat/chat-composer-bar.tsx`) — web-internal function-size extraction. ESC route-back (`chat/page.tsx:73-95`, input-guarded + `defaultPrevented`-checked) preserved; no new dismissable layer; overlay-stack untouched. Mobile chat composer behavior unchanged. **Not a finding.**
- **Calendar-sync split** — web-internal; `page.tsx` still the surface, mobile `calendar-sync.tsx` unchanged in behavior. **Not a finding.**
- **`highlightText→shared`** — matching/segmentation moved to `packages/shared/src/utils/highlight-text.ts` (`HighlightSegment[]`), consumed by BOTH `apps/{web,mobile}/components/ui/highlight-text.tsx` thin render wrappers (web `<mark>` vs mobile `<Text>` = allowed adapter). DRY-at-shared, symmetric. **Not a finding.**

## Verdict

**ZERO FINDINGS.** All 3 round-3 LOW survivors (R2-7, R2-9, R2-11) resolved in round 4; F1 drill error rendered on both platforms; F14 revoke unified on `ConfirmDialog`; F15 login offline aligned; profile.language sync added to web. The r4 chat/calendar/highlightText refactors introduced no new one-sided behavioral surface. Net: round-3's 3 LOW → 0.

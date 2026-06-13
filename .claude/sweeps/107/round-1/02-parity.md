# Sweep #2 — Web ↔ Mobile Structural + Behavioral Parity (issue #107, round 1)

Read-only audit of the working tree at `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` (branch `main`, clean tree). Rule audited: root CLAUDE.md — "Every change MUST land in BOTH apps/web AND apps/mobile… Logic, features, behavior, data flow, error handling: identical." Allowed adapter differences (BFF/Server Actions vs apiClient, cookie vs SecureStore, shadcn vs StyleSheet, next-intl vs i18next, routers, web-only public pages, mobile-only offline/push/widget/Play/back-handling, perf list primitives) were excluded per brief.

## Scope swept

- **Hooks:** all 39 `apps/web/hooks/*.ts` vs all 43 `apps/mobile/hooks/*.ts`. Every one of the 34 same-named pairs diffed (numstat triage + full reads of all pairs with non-trivial deltas: summary, login-code-entry, chat-composer, go-back-or-fallback, subscription-plans, resolve-clarification, timezone-auto-sync, calendar-data, offline, profile, drill-navigation, habit-queries, gamification, billing, notifications, app-toast, calendar-auto-sync, habit-form, checklist-templates, habits, goals, tags). Every one-sided hook dispositioned: web-only `use-calendar-events`, `use-color-scheme`, `use-is-client`, `use-popover-menu`, `use-push-notification-preferences`; mobile-only `use-tour-target`, `use-tour-scroll-container`, `use-horizontal-swipe`, `use-ad-mob`, `use-chat-reward`, `use-review-reminder`, `use-version-check`, `use-play-billing`, `use-push-notifications`.
- **Screens/routes:** all 20 web `page.tsx` vs all mobile `app/**` route files — fully paired (web-only `(public)/delete-account` is Play-required; mobile delete/fresh-start flows live inline in profile.tsx; verified present).
- **Components:** full `git ls-files` inventory both sides; every one-sided component chased to its counterpart or platform disposition (controls-menu → inline mobile habit-list controls; sortable-habit-item → mobile habit-list DnD; tour-replay-modal exists both; calendar-import-prompt → web layout prompt; update-prompt ↔ version-update-drawer; review-reminder-card → Play store-review surface; chat input split files → same keys/behavior verified).
- **Stores:** auth/chat/tour/ui pairs diffed; mobile-only `app-toast-store` (toast adapter) and `review-reminder-store` (Play review) dispositioned.
- **Cross-checks:** shared i18n-key probes per screen pair (both quote styles), endpoint+HTTP-verb extraction across web Server Actions vs mobile apiClient/queued mutations (verbs verified against orbit-api controllers where flagged), global overlay gating in both layouts, query-client defaults, gamification milestone selector.

## Findings

### 1. HIGH · Web calendar-import dismissal uses the wrong HTTP verb — silently 405s, prompt re-appears forever
- **Web:** `apps/web/app/actions/calendar.ts:22` — `dismissCalendarImport()` sends `POST` to `API.calendar.dismiss`.
- **Mobile:** `apps/mobile/components/onboarding/calendar-import-prompt.tsx:48-55` — sends `PUT` (correct).
- **API:** `orbit-api/src/Orbit.Api/Controllers/CalendarController.cs:45` — `[HttpPut("dismiss")]`.
- **What diverges:** mobile dismissal persists `hasImportedCalendar`; web dismissal fails with 405 and the error is swallowed (`dismissCalendarImport().catch(() => {})` at `apps/web/app/(app)/layout.tsx:139,144`), so the web prompt reappears on every session until the user actually imports. Error handling + behavior divergence with a concrete user-facing bug on web.
- **Fix:** change the web action to `method: 'PUT'`.

### 2. MED · Calendar-import prompt gating differs — mobile can show it on top of the onboarding tour
- **Web:** `apps/web/app/(app)/layout.tsx:107-112` — requires `hasCompletedOnboarding && hasCompletedTour && !hasImportedCalendar`.
- **Mobile:** `apps/mobile/components/onboarding/calendar-import-prompt.tsx:30-35` — requires only `hasCompletedOnboarding && !hasImportedCalendar` (+ not on /calendar-sync). The tour auto-starts at the same moment under identical conditions (`apps/mobile/app/_layout.tsx:312-323`), so the bottom sheet can stack over the running tour on mobile.
- **Fix:** add the `hasCompletedTour` condition to the mobile `shouldShow`.

### 3. MED · OTP login auto-verify policy diverges
- **Mobile:** `apps/mobile/app/login.tsx:232-237` — effect auto-verifies whenever the 6 digits are complete (typing the last digit, autofill, or `?email&code` deep link).
- **Web:** `apps/web/hooks/use-login-code-entry.ts:71-73,104-106` + `apps/web/app/(auth)/login/use-login-flow.ts:50-52` — auto-verifies only on multi-char fill/paste; typing the 6th digit manually or arriving via the `?email&code` deep link (`use-login-flow.ts:67-76`) does NOT auto-submit; the user must press Verify.
- **Fix:** pick one policy and mirror it (either add a completeness watch on web or restrict mobile to fill/paste).

### 4. MED · Reactivated-account notice missing on mobile
- **Web:** `apps/web/app/(auth)/login/login-form-helpers.ts:120-122` — shows `profile.deleteAccount.reactivated` when `loginResponse.wasReactivated` is true.
- **Mobile:** `apps/mobile/app/login.tsx:304-326` — `verifyCode` ignores `wasReactivated` entirely. The field is in the shared schema (`packages/shared/src/types/auth.ts:15`).
- **Fix:** surface the same notice after mobile login.

### 5. MED · Chat breakdown editor: frequency quantity editable on web only
- **Web:** `apps/web/components/chat/breakdown-suggestion.tsx:235-253` — when a frequency unit is selected, a number input lets the user edit `frequencyQuantity` ("every N day/week/…", key `habits.breakdown.every`).
- **Mobile:** `apps/mobile/components/chat/breakdown-suggestion.tsx:222-254` — unit chips only; no quantity editor (AI-provided quantity is kept silently, defaulting to 1 via `resolveFrequencyQuantity`).
- **Fix:** add the quantity input to the mobile breakdown card.

### 6. MED · Retrospective regenerate affordance is mobile-only
- **Mobile:** `apps/mobile/app/retrospective.tsx:407-424` — result card has a "Regenerate" chip re-invoking generation.
- **Web:** `apps/web/app/(app)/retrospective/page.tsx:282-311` — the Generate CTA renders only when `!retrospective`; once a result exists the sole path to regenerate is switching period away and back (`selectPeriod` clears state, lines 94-98).
- **Fix:** add a regenerate affordance to the web result card.

### 7. LOW · Rewarded-ad chat bonus is a mobile-only user capability; web carries a dead twin action
- **Mobile:** `apps/mobile/hooks/use-chat-reward.ts` + `apps/mobile/hooks/use-ad-mob.ts` + chat input (`ads.watchForMessages`, `ads.dailyLimitReached`) — free users at the AI-message limit can watch an ad for bonus messages.
- **Web:** no equivalent earn path at the limit; `claimAdReward` exists as a Server Action (`apps/web/app/actions/subscription.ts:38`) with zero consumers.
- **Note:** the mobile JSDoc declares "ads are mobile-only — no web counterpart", so this is likely intentional monetization asymmetry; it is still outside the brief's allowed list, and the orphaned web action contradicts the intent.
- **Fix:** confirm the asymmetry is intended; delete the unused web `claimAdReward` action either way.

### 8. LOW · Subscription plans: timeZone param + coupon discount applied on web only
- **Web:** `apps/web/hooks/use-subscription-plans.ts:17-22,33-38` — appends `?timeZone=` for regional pricing and exposes `discountedAmount` (applies `couponPercentOff`); upgrade page shows `upgrade.plans.coupon.discountBadge`.
- **Mobile:** `apps/mobile/hooks/use-subscription-plans.ts:9-23` — no timeZone, no discount helper; `apps/mobile/app/upgrade.tsx:181-182` falls back to raw `plans.*.unitAmount` when Play pricing is unavailable, so a referral-coupon user sees an undiscounted, possibly wrong-region price in the fallback path. (Primary Play-offer pricing is regional and referral-aware via `preferReferralOffer` — divergence is the fallback display only.)
- **Fix:** pass `getClientTimeZone()` and apply the coupon discount in mobile's backend-price fallback.

### 9. LOW · profile.language sync policy: continuous on mobile, login-time-only on web
- **Mobile:** `apps/mobile/hooks/use-profile.ts` (effect) — calls `i18n.changeLanguage(profile.language)` whenever the fetched profile differs.
- **Web:** locale comes from the `i18n_locale` cookie (`apps/web/i18n/request.ts:8-13`), which is written only by `applyProfilePresentation` at login/auth-callback (`apps/web/lib/profile-presentation.ts:34`; callers `login-form-helpers.ts:115`, `auth-callback/page.tsx:168`) and by the preferences page. A language change made on another device never reaches an already-authenticated web session.
- **Fix:** refresh the cookie from the profile query on web (mirroring mobile), or make mobile login-time-only.

### 10. LOW · Calendar events: TanStack query on web vs imperative screen state on mobile
- **Web:** `apps/web/hooks/use-calendar-events.ts` — cached query (staleTime 30s, `retry: false`, not-connected discriminated union), consumed by `apps/web/app/(app)/calendar-sync/page.tsx:279`.
- **Mobile:** `apps/mobile/app/calendar-sync.tsx:72-164` — ad-hoc `fetchCalendarEvents` + local `step` state machine; no query cache, different refetch semantics. Same not-connected detection via the shared util.
- **Fix:** extract a mobile `use-calendar-events` mirroring the web hook.

### 11. LOW · Habit-mutation cache-invalidation scopes drift
- Web skip invalidates lists+summary only (`apps/web/hooks/use-habits.ts:329-333`); mobile skip also invalidates goals+profile+gamification (`apps/mobile/hooks/use-habits.ts:285-291`).
- Mobile log invalidates `profileKeys.all` (`apps/mobile/hooks/use-habits.ts:231-237`); web log does not (`apps/web/hooks/use-habits.ts:283-288`).
- Web create/delete/bulk-create/bulk-delete invalidate `habitKeys.count()` (`use-habits.ts:347-348,396,537,551`); mobile never invalidates count — it only adjusts optimistically (`apps/mobile/lib/habit-mutation-helpers.ts:639-673`), so the mobile count can drift until an unrelated refetch.
- Mobile `finalizeHabitMutation` skips ALL invalidation when the mutation errored (`habit-mutation-helpers.ts:686-688`); web invalidates on settle regardless. (Partly motivated by the offline queue, but it also applies to plain online failures.)
- **Fix:** align the invalidation matrices (add count invalidation + error-path refetch on mobile, or trim web).

### 12. LOW · Mobile chat-store exposes dead `isStreaming` state web lacks
- **Mobile:** `apps/mobile/stores/chat-store.ts:5-14` — `isStreaming`/`setIsStreaming` exist with no production consumer (only the store test references them).
- **Web:** `apps/web/stores/chat-store.ts` — no such field.
- **Fix:** delete the dead field (or implement it on both sides if streaming UI needs it).

### 13. LOW · Web exports `useInvalidateSummary` with no consumer; mobile has no counterpart
- **Web:** `apps/web/hooks/use-summary.ts:72-79` — exported, unused anywhere in apps/web (summary invalidation actually happens via `habitKeys.summaryPrefix()` in mutation `onSettled` on both platforms).
- **Mobile:** `apps/mobile/hooks/use-summary.ts` — intentionally mirrors the file but omits the export.
- **Fix:** delete the dead web export.

## Non-findings (verified equivalent / allowed)

- All 20 screen routes paired; web public pages + mobile platform screens as allowed.
- Habit list controls (select mode, collapse-all, refresh, show-completed), drag-reorder, drill navigation (+ mobile hardware-back), move-parent, bulk bars, confirm dialogs, empty states: parity holds (placement/copy differ only).
- Chat: draft persistence, speech transcript appending, send/retry/limit handling, SSE streaming, pending-operation confirm + step-up verify: fully mirrored (mobile splits input into components).
- Tour (provider/overlay/spotlight/tooltip/replay modal), onboarding steps incl. frequency picker, gamification celebrations + pro-gated toasts/level-up, referral, notifications (interval polling adapter), support drafts, profile delete/fresh-start/edit-name/data-export, AI settings facts management, timezone auto-sync, theme/scheme seeding+sync, query-client defaults, retry policy: equivalent.
- All shared endpoint verbs match across platforms except finding #1 (checked habits, goals, tags, notifications, profile, userFacts, apiKeys, calendar suggestion-dismiss, auth).
- Mobile-only: offline queue + optimistic inserts, widget refresh, Play billing/review/version-check, push-token plumbing, AppState bridges — allowed. Web-only: SSR/is-client, popover positioning, route transitions, BFF — allowed.

## Verdict

**13 findings: 1 HIGH · 5 MED · 7 LOW.**

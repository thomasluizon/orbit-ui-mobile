# Sweep #2 (round 2) — Web ↔ Mobile Structural + Behavioral Parity (issue #107)

Read-only re-audit of the working tree at `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` (branch `main`). Rule audited: root `CLAUDE.md` — *"Every change MUST land in BOTH `apps/web` AND `apps/mobile` … Logic, features, behavior, data flow, error handling: identical."* Allowed adapter differences (BFF/Server Actions vs apiClient, cookie vs SecureStore, shadcn vs StyleSheet, next-intl vs i18next, routers, web-only public pages/proxy, mobile-only offline queue/push/widget/Play/back-handling, FlatList vs map) excluded per brief. Deferral register DEF-1..DEF-8/DEF-2b respected (none re-reported).

Method: re-verified every one of the 13 round-1 parity findings against current code (Wave-2 fix agents died mid-edit — coverage uneven), plus a fresh inventory of hooks (web 38 / mobile 42), stores (web 4 / mobile 6), and one-sided surfaces introduced or left by round-1 fixes.

## Round-1 verification ledger

| R1 # | Sev | Round-1 finding | Round-2 status |
|---|---|---|---|
| 1 | HIGH | web `dismissCalendarImport` POST→PUT | **FIXED** (now `actions/calendar.ts:22` PUT) |
| 2 | MED | calendar-import prompt tour-gating | **STILL OPEN** → R2-1 |
| 3 | MED | OTP auto-verify policy | **PARTIAL / STILL OPEN** → R2-2 |
| 4 | MED | wasReactivated notice on mobile | **STILL OPEN** → R2-3 |
| 5 | MED | chat breakdown frequency-quantity editor on mobile | **STILL OPEN** → R2-4 |
| 6 | MED | retrospective Regenerate parity (web) | **STILL OPEN** → R2-5 |
| 7 | LOW | dead web `claimAdReward` action | **STILL OPEN** → R2-7 |
| 8 | LOW | subscription plans timeZone + coupon (mobile) | **STILL OPEN** → R2-8 |
| 9 | LOW | profile.language sync policy | **STILL OPEN** → R2-9 |
| 10 | LOW | calendar events query vs imperative (mobile) | **STILL OPEN** → R2-10 |
| 11 | LOW | habit-mutation invalidation drift | **STILL OPEN** → R2-6 |
| 12 | LOW | mobile chat-store dead `isStreaming` | **FIXED** (shared store has no `isStreaming`; 0 refs both apps) |
| 13 | LOW | dead web `useInvalidateSummary` export | **STILL OPEN** → R2-11 |

Confirmed FIXED: **#1, #12** (2 of 13). Newly surfaced: **R2-12** (mobile global ErrorBoundary, overlaps decision D28 — never landed).

---

## Findings

### R2-1. MED · Calendar-import prompt can stack over the running tour on mobile (gating still missing `hasCompletedTour`)
- **Rule:** identical behavior/data-flow across platforms.
- **Web:** `apps/web/app/(app)/layout.tsx:107-112` — `calendarPromptCriteriaMet = hasCompletedOnboarding && hasCompletedTour && !hasImportedCalendar`.
- **Mobile:** `apps/mobile/components/onboarding/calendar-import-prompt.tsx:30-35` — `shouldShow = hasCompletedOnboarding && !hasImportedCalendar && pathname !== '/calendar-sync' && !dismissed`. No `hasCompletedTour` gate. The tour auto-starts 500 ms after the same `hasCompletedOnboarding && !hasCompletedTour` condition (`apps/mobile/app/_layout.tsx:312-323`), so the calendar bottom sheet mounts over the running tour.
- **What diverges:** mobile shows the prompt during the tour window; web waits until the tour is done. Behavior + data-flow divergence (round-1 #2 unfixed).
- **Fix:** add `profile?.hasCompletedTour` to the mobile `shouldShow` condition.

### R2-2. MED · OTP auto-verify still diverges for manual 6th-digit entry and `?email&code` deep links
- **Rule:** identical behavior/error-handling.
- **Mobile:** `apps/mobile/app/login.tsx:232-237` — effect calls `verifyCodeRef.current()` whenever `isVerificationCodeComplete(codeDigits)`. Fires on (a) typing the 6th digit, (b) paste/autofill, **and** (c) deep-link arrival (digits set at `login.tsx:193-196`).
- **Web:** `apps/web/app/(auth)/login/use-login-flow.ts:50-52` passes `onCompleteCode` to `useLoginCodeEntry`; `apps/web/hooks/use-login-code-entry.ts:71-73,104-106` fires it **only on the multi-char fill/paste branch**. Typing the 6th digit single-char (`onCodeInput`'s length-1 branch, lines 77-86) does **not** auto-submit, and the deep-link path (`use-login-flow.ts:67-76`) sets digits without firing completion.
- **What diverges:** round-1's fix wired paste-completion on web but left two cases divergent — manual 6th keystroke and deep-link both auto-submit on mobile, neither does on web.
- **Fix:** pick one policy and mirror it (add a completeness watcher on web covering manual entry + deep link, or restrict mobile's effect to fill/paste + deep-link only).

### R2-3. MED · Reactivated-account notice still missing on mobile
- **Rule:** identical behavior; `wasReactivated` is in the shared schema (`packages/shared/src/types/auth.ts`).
- **Web:** `apps/web/app/(auth)/login/login-form-helpers.ts:120-122` — on magic-code verify success, `if (loginResponse.wasReactivated) setSuccessMessage(t('profile.deleteAccount.reactivated'))`. This is the **only** `wasReactivated` reference in either app (grep-confirmed).
- **Mobile:** `apps/mobile/app/login.tsx:304-326` — `verifyCode` consumes `res.token/refreshToken/userId/name/email` but ignores `res.wasReactivated`; no notice.
- **What diverges:** a returning (previously-deleted) user is told their account was restored on web but not on mobile.
- **Fix:** after mobile `login()` succeeds, if `res.wasReactivated` set a success message with `profile.deleteAccount.reactivated` (mobile shows success via `setSuccessMessage`, already wired at `login.tsx:464`).

### R2-4. MED · Chat breakdown editor: frequency quantity editable on web only
- **Rule:** identical features.
- **Web:** `apps/web/components/chat/breakdown-suggestion.tsx:235-253` — when `habit.frequencyUnit` is set, renders `habits.breakdown.every` + a `type="number"` input bound to `frequencyQuantity` + the pluralized unit label ("every N day/week/…").
- **Mobile:** `apps/mobile/components/chat/breakdown-suggestion.tsx:222-254` — unit chips only; no quantity editor. The AI-provided `frequencyQuantity` is kept silently (`resolveFrequencyQuantity`, lines 118-123, defaults to 1).
- **What diverges:** mobile users cannot edit the frequency quantity for AI-broken-down sub-habits.
- **Fix:** add the quantity number input + unit label to the mobile breakdown card when a unit is selected (key `habits.breakdown.every` already exists; verify unit-label keys `habits.form.unit{Unit}` are present in both locales).

### R2-5. MED · Retrospective regenerate affordance is still mobile-only
- **Rule:** identical features.
- **Mobile:** `apps/mobile/app/retrospective.tsx:407-424` — when a result is displayed, a "Regenerate" chip (`retrospective.regenerate`) calls `handleGenerate()` → `generate()`.
- **Web:** `apps/web/app/(app)/retrospective/page.tsx:203-264` — the result card has **no** regenerate control. Generate CTAs render only in the empty state (`!retrospective && !error`, lines 282-311) and the error state (`error`, lines 266-280 → `common.retry`). With a result present, the only way to regenerate is `selectPeriod` switching period away/back (lines 94-98 clear `retrospective`).
- **What diverges:** web users cannot re-run a retrospective for the current period without leaving and returning.
- **Fix:** add a regenerate affordance to the web result card (lines 203-264) re-invoking `generate()`.

### R2-6. LOW · Habit-mutation cache-invalidation matrices drift (3 of 4 sub-points still open; offline-queue part allowed)
- **Rule:** identical data-flow/error-handling. (Mobile offline queue is an allowed adapter — the `isQueuedResult` short-circuit is in scope of that allowance; the rest is not.)
- **Files:** `apps/web/hooks/use-habits.ts`, `apps/mobile/hooks/use-habits.ts`, `apps/mobile/lib/habit-mutation-helpers.ts` (no web mutation-helpers file — web inlines invalidation in each `onSettled`).
- **(a) Skip scope.** Web `useSkipHabit` `onSettled` invalidates lists + `summaryPrefix()` only (`use-habits.ts:329-332`). Mobile `useSkipHabit` `onSettled` → `finalizeHabitMutation(..., {includeGoals:true, includeProfile:true, includeGamification:true})` (`use-habits.ts:285-290`) → invalidates lists+summary+goals+profile+gamification. **Divergent** (web skip is even inconsistent with web log, which does invalidate goals+gamification).
- **(b) Log profile key.** Mobile `useLogHabit` `onSettled` invalidates `profileKeys.all` (via `finalizeHabitMutation`, `use-habits.ts:231-236`). Web `useLogHabit` `onSettled` invalidates lists+summary+goals+gamification but **not** profile (`use-habits.ts:283-288`). **Divergent** (delta = profile).
- **(c) Count invalidation.** Web create/delete/bulk-create/bulk-delete each invalidate `habitKeys.count()` (`use-habits.ts:347-348, 394-398, 535-539, 549-554`). Mobile never invalidates count — it only adjusts optimistically via `adjustHabitCount` in `onMutate`/`onError` (`use-habits.ts:332,340,…`; helper `habit-mutation-helpers.ts`), so a failed/queued reconciliation can leave the count drifted until an unrelated refetch. **Divergent** (load-bearing).
- **(d) Error-path invalidation.** Mobile `finalizeHabitMutation` returns early when `error || isQueuedResult(data)` (`habit-mutation-helpers.ts:686-688`), skipping ALL invalidation. The `isQueuedResult` half is the allowed offline-queue adapter; the `error` half also suppresses refetch on **plain online failures**, where web's `onSettled` invalidates regardless of error. **Divergent for the online-error case only.**
- **Fix:** align the matrices — pick one canonical invalidation set per mutation across both platforms (add count invalidation + online-error refetch on mobile, or trim web to match). Keep the `isQueuedResult` short-circuit (allowed).

### R2-7. LOW · Dead web `claimAdReward` Server Action (rewarded-ad earn path is mobile-only)
- **Rule:** delete-unused (CLAUDE.md rule 2); rewarded-ad capability asymmetry is intentional monetization (mobile JSDoc: "ads are mobile-only").
- **Mobile:** `apps/mobile/hooks/use-chat-reward.ts` + `use-ad-mob.ts` + chat input — free users at the AI-message limit watch an ad for bonus messages.
- **Web:** `apps/web/app/actions/subscription.ts:32-38` exports `claimAdReward()` with **zero** production consumers (grep: only the definition; the two test hits are unrelated `adRewardsClaimedToday` factory fields).
- **What diverges:** orphaned web action contradicts the documented mobile-only intent.
- **Fix:** delete the unused web `claimAdReward` action (asymmetry itself is allowed).

### R2-8. LOW · Subscription plans: timeZone param + coupon discount applied on web only
- **Rule:** identical data-flow.
- **Web:** `apps/web/hooks/use-subscription-plans.ts:17-22` appends `?timeZone=${getClientTimeZone()}` for regional pricing; lines 33-38 expose `discountedAmount` via `applySubscriptionDiscount(unitAmount, plans?.couponPercentOff)`.
- **Mobile:** `apps/mobile/hooks/use-subscription-plans.ts:8-24` — queries `API.subscription.plans` with no timeZone (line 11), no `applySubscriptionDiscount` import, no `discountedAmount`. Mobile's backend-price fallback (`apps/mobile/app/upgrade.tsx`) therefore shows raw `unitAmount`, so a referral-coupon user can see an undiscounted / wrong-region price when Play pricing is unavailable. (Primary Play-offer pricing stays regional + referral-aware — divergence is the backend fallback only.)
- **Fix:** pass `getClientTimeZone()` to the mobile plans query and apply the coupon discount in the backend-price fallback.

### R2-9. LOW · profile.language sync: continuous on mobile, login-time-only on web
- **Rule:** identical behavior.
- **Mobile:** `apps/mobile/hooks/use-profile.ts:34-38` — effect calls `i18n.changeLanguage(profileLanguage)` whenever the fetched `profile.language` differs from `i18n.language`.
- **Web:** `apps/web/hooks/use-profile.ts` imports no `useTranslation`/locale sync; locale comes from the `i18n_locale` cookie, written only by `applyProfilePresentation` at login/auth-callback and the preferences page. A language change on another device never reaches an already-authenticated web session.
- **Fix:** refresh the cookie/locale from the profile query on web (mirror mobile), or make mobile login-time-only.

### R2-10. LOW · Calendar events: TanStack cached query on web vs imperative screen state on mobile
- **Rule:** identical data-flow.
- **Web:** `apps/web/hooks/use-calendar-events.ts` (51 lines) — `useCalendarEvents()` cached query (staleTime, `retry:false`, not-connected discriminated union), consumed by `apps/web/app/(app)/calendar-sync/page.tsx`.
- **Mobile:** no `apps/mobile/hooks/use-calendar-events.ts`. `apps/mobile/app/calendar-sync.tsx:72-86` defines an inline `fetchCalendarEvents` with local `[events]`/`[step]` state (lines ~125-126); no query cache, different refetch semantics (same not-connected detection via the shared util).
- **Fix:** extract a mobile `use-calendar-events` mirroring the web hook (cache + discriminated union).

### R2-11. LOW · Dead web `useInvalidateSummary` export with no consumer
- **Rule:** delete-unused (rule 2); mobile mirror intentionally omits it.
- **Web:** `apps/web/hooks/use-summary.ts:72-79` exports `useInvalidateSummary` — grep finds **only** the definition, no callers (summary invalidation happens via `habitKeys.summaryPrefix()` in mutation `onSettled` on both platforms).
- **Mobile:** `apps/mobile/hooks/use-summary.ts` (59 lines) deliberately omits the export.
- **Fix:** delete the dead web export.

### R2-12. MED · Mobile has no global ErrorBoundary; web ships designed error-recovery screens (decision D28 never landed)
- **Rule:** identical error-handling + one-sided user-facing surface. (Surfaced fresh this round; overlaps round-1 decision **D28**, whose platform-shell fix agent died with completeness "unknown" per `recovery-notes.md`.)
- **Web:** `apps/web/app/(app)/error.tsx` + `apps/web/app/(auth)/error.tsx` — App-Router error boundaries with a designed retry screen (alert orb, localized `auth.genericError`, `common.retry` reset). (The `(chat)` segment — `apps/web/app/(chat)/layout.tsx` + `chat/page.tsx` — has **no** `error.tsx`, an intra-web gap D28 also called for.)
- **Mobile:** **no** error boundary anywhere in `apps/mobile` — zero `ErrorBoundary` / `componentDidCatch` / `getDerivedStateFromError` matches; root `apps/mobile/app/_layout.tsx` exports no Expo-Router `ErrorBoundary`. A thrown render error has no caught designed recovery surface.
- **What diverges:** web degrades to a localized retry screen on render error; mobile has no equivalent (white screen / crash).
- **Fix:** export a global `ErrorBoundary` from mobile root `_layout.tsx` (Expo Router contract) with a retry screen mirroring web `error.tsx`; add `apps/web/app/(chat)/error.tsx` for the chat segment. (This is exactly decision D28 — the fix is already mandated; flagging because it did not land.)

---

## Non-findings (verified equivalent or allowed)

- **R1 #1 dismissCalendarImport** — FIXED: `apps/web/app/actions/calendar.ts:22` now PUT, matching mobile `calendar-import-prompt.tsx:48-55` and `CalendarController` `[HttpPut("dismiss")]`. (Test + layout imports rewired to `actions/calendar` per recovery notes.)
- **R1 #12 chat-store isStreaming** — FIXED: shared `packages/shared/src/stores/chat-store.ts` exposes only `messages/isTyping/...`; grep finds 0 `isStreaming`/`setIsStreaming` in either app.
- **Push notifications** — web `use-push-notification-preferences` (Web Push API + service worker) vs mobile `use-push-notifications` (Expo token + native permission) have different return shapes but are an explicitly-allowed platform adapter (push plumbing); both surface a settings toggle. Not a finding.
- **Allowed one-sided hooks** — web-only `use-calendar-events` (covered as R2-10), `use-color-scheme` (DOM/cookie theme), `use-is-client` (SSR guard), `use-popover-menu` (DOM positioning vs mobile bottom sheets); mobile-only `use-ad-mob`/`use-chat-reward` (ads — see R2-7), `use-horizontal-swipe`, `use-play-billing`, `use-push-notifications`, `use-review-reminder`, `use-version-check`, `use-tour-target`/`use-tour-scroll-container`. All allowed adapters.
- **Allowed one-sided stores** — mobile-only `app-toast-store` (toast adapter; web uses Sonner), `review-reminder-store` (Play review). `auth/chat/tour/ui` stores paired.
- **Endpoint verbs** — all shared endpoint HTTP verbs match across platforms (re-checked the calendar dismiss verb specifically; now aligned).

---

## Verdict

**13 findings: 0 HIGH · 6 MED · 7 LOW.**

- MED (6): R2-1 calendar-prompt tour-gating, R2-2 OTP auto-verify, R2-3 wasReactivated notice, R2-4 chat breakdown quantity editor, R2-5 retrospective regenerate, R2-12 mobile ErrorBoundary.
- LOW (7): R2-6 habit-mutation invalidation, R2-7 dead web claimAdReward, R2-8 subscription timeZone+coupon, R2-9 profile.language sync, R2-10 calendar-events query, R2-11 dead web useInvalidateSummary, R2-13 web (chat) error.tsx (rolled into R2-12).

Round-1 findings confirmed FIXED: **#1 (HIGH dismissCalendarImport POST→PUT)** and **#12 (LOW chat-store isStreaming)**. The other 11 round-1 findings remain open — #3 (OTP) and #11 (invalidation) only partially addressed by round-1 work. One new gap surfaced: **R2-12** (mobile global ErrorBoundary, = unimplemented decision D28).

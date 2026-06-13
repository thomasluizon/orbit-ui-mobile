# Round-3 sweep #2 — Web ↔ Mobile parity (issue #107) — VERIFICATION

Baseline: ui-mobile `6399d00` (committed green), branch `main`. Read-only re-verification of every round-2 `02-parity.md` finding (R2-1..R2-13) plus a fresh scan for one-sided surfaces introduced by the fixes. Allowed adapter differences (BFF/Server Actions vs apiClient, cookie vs SecureStore, shadcn vs StyleSheet, next-intl vs i18next, FlatList vs map, web public pages/proxy, mobile offline-queue/push/widget/Play/back-handling) excluded per brief. Deferral registers respected.

## Round-2 verification ledger

| R2 # | Sev | Round-2 finding | Round-3 status |
|---|---|---|---|
| R2-1 | MED | calendar-import prompt tour-gating (mobile) | **FIXED** |
| R2-2 | MED | OTP auto-verify convergence | **FIXED** |
| R2-3 | MED | wasReactivated notice (mobile) | **FIXED** |
| R2-4 | MED | chat breakdown frequency-quantity editor (mobile) | **FIXED** |
| R2-5 | MED | retrospective Regenerate (web) | **FIXED** |
| R2-6 | LOW | habit-mutation invalidation matrix | **FIXED** |
| R2-7 | LOW | dead web `claimAdReward` action | **STILL OPEN** |
| R2-8 | LOW | subscription timeZone + coupon (mobile) | **FIXED** |
| R2-9 | LOW | profile.language sync (web) | **STILL OPEN** |
| R2-10 | LOW | calendar-events query hook (mobile) | **FIXED** |
| R2-11 | LOW | dead web `useInvalidateSummary` export | **STILL OPEN** |
| R2-12 | MED | mobile global ErrorBoundary (D28) | **FIXED** |
| R2-13 | (in R2-12) | web `(chat)/error.tsx` | **FIXED** |

Resolved: **10 of 13** (R2-1..R2-6, R2-8, R2-10, R2-12, R2-13). Open: **3 LOW**, all dead-code/sync-policy (R2-7, R2-9, R2-11).

## Findings (still open)

- **LOW · apps/web/app/actions/subscription.ts:32 · rule 2 (delete-unused)** — `claimAdReward()` Server Action still exported with ZERO production consumers (grep: only the definition). Rewarded-ad earn is mobile-only by documented monetization intent (`use-chat-reward.ts` + `use-ad-mob.ts`); the orphaned web action contradicts that and is unreachable. Fix: delete the action (the API endpoint + mobile path stay; the asymmetry itself is allowed).
- **LOW · apps/web/hooks/use-summary.ts:72 · rule 2 (delete-unused)** — `useInvalidateSummary` still exported with ZERO callers (summary invalidation flows through `habitKeys.summaryPrefix()` in mutation `onSettled` on both platforms). Mobile `use-summary.ts` deliberately omits it. Fix: delete the dead web export.
- **LOW · apps/web/hooks/use-profile.ts (no language sync) vs apps/mobile/hooks/use-profile.ts:34-38 · identical-behavior** — mobile calls `i18n.changeLanguage(profile.language)` continuously when the fetched language differs; web's `use-profile.ts` effect (lines 37-49) syncs colorScheme + themePreference from the profile query but NOT `profile.language` (web locale is cookie-driven, written only at login / preferences page). A language change on another device never reaches an already-authenticated web session. Fix: refresh the locale/cookie from the profile query on web (mirror mobile), or make mobile login-time-only. Borderline LOW (web has `refetchOnWindowFocus`, so a focus event after a remote change would re-pull but not re-apply locale).

## Confirmed-FIXED detail (spot-verified by read)

- **R2-1** — mobile `components/onboarding/calendar-import-prompt.tsx:30-33` now gates `shouldShow` on `profile?.hasCompletedTour` (+ onboarding + !imported), matching web `layout.tsx`. Prompt no longer stacks over the running tour.
- **R2-2** — convergence achieved via the shared completeness effect. BOTH `apps/{web,mobile}/hooks/use-login-code-entry.ts:40-48` fire `onCompleteCode` whenever `isVerificationCodeComplete(codeDigits, VERIFICATION_CODE_LENGTH)` — covers manual 6th-digit, paste/autofill, AND deep-link (which sets `codeDigits` → same effect). Web `use-login-flow.ts:50-52` and mobile `login.tsx:166-168` both pass `verifyCode` to the same hook. Round-2's web-only paste-branch / mobile-only all-paths split is gone.
- **R2-3** — mobile `login.tsx:309-310`: `if (res.wasReactivated) setSuccessMessage(t('profile.deleteAccount.reactivated'))`, mirroring web `login-form-helpers.ts`.
- **R2-4** — mobile `components/chat/breakdown-suggestion.tsx:130-140` now renders the `habits.breakdown.every` label + numeric `AppTextInput` bound to `frequencyQuantity` (`keyboardType="number-pad"`, a11y `habits.breakdown.frequencyQuantityLabel`) + unit label `` t(`habits.form.unit${frequencyUnit}`) ``. Unit keys confirmed present both locales. Matches web.
- **R2-5** — web `retrospective/_components/retrospective-view.tsx:72-78` renders `RetrospectiveCard` with `onRegenerate={onGenerate}` when a result is present; `retrospective-card.tsx:74` is the `retrospective.regenerate` affordance. Web can now re-run without leaving the period.
- **R2-6** — invalidation matrices aligned. Mobile `lib/habit-mutation-helpers.ts`: `invalidateHabitMutationQueries` gained `includeCount` (line 657) and the `finalizeHabitMutation` short-circuit (line 688) now returns early ONLY on `isQueuedResult(data)` — the round-2 `error ||` half (which suppressed online-failure refetch) is removed. Mobile create/delete/bulk-create/bulk-delete pass `{ includeCount: true }` (use-habits.ts:347,773,822,…), matching web `habitKeys.count()`. Web `useLogHabit`/`useSkipHabit` onSettled now BOTH invalidate lists+summary+goals+gamification+profile (use-habits.ts:283-288, 330-335), matching mobile's `{includeGoals,includeProfile,includeGamification}`. All four round-2 sub-points (skip scope, log profile, count, online-error) resolved; the `isQueuedResult` offline short-circuit (allowed) preserved.
- **R2-8** — mobile `hooks/use-subscription-plans.ts` imports `getClientTimeZone` (:9) + appends `?timeZone=` (:16-18), imports `applySubscriptionDiscount` (:7) + exposes `discountedAmount` (:31-42). Backend-price fallback now regional + coupon-aware, matching web.
- **R2-10** — `apps/mobile/hooks/use-calendar-events.ts` now exists (cached query + not-connected discriminated union), mirroring the web hook.
- **R2-12 / R2-13** — mobile root `app/_layout.tsx:468` exports Expo-Router `ErrorBoundary` wiring `components/ui/app-error-boundary.tsx`'s `AppErrorScreen` (alert orb + localized `auth.genericError` / dev `error.message` + `common.retry` glow pill; resolves tokens+copy from `createTokensV2`/`i18n` singletons so it survives a thrown provider tree). Web `app/(chat)/error.tsx` now exists, closing the intra-web chat-segment gap. Both mirror web `(app)/error.tsx`.

## NEW one-sided surfaces from the fixes — swept

- **`use-overlay-escape` (web-only) ↔ `use-overlay-back` (mobile-only)** — complementary platform adapters introduced for overlay dismissal: web listens for keyboard Escape, mobile for the Android hardware back button. Same purpose, correct platform-specific implementations. **Allowed adapter, not a finding.**
- **web `ai-settings/_components/*` + `preferences/_components/use-preference-controls.ts` + `profile/_components/*` (use-user-facts, use-data-export, etc.)** — wave-3 function-size splits internal to web page files. The corresponding behavior already exists on mobile inside its single-file screens (`ai-settings.tsx`, `preferences.tsx`, `profile.tsx`). File-structure asymmetry, not feature/behavior asymmetry. **Not a finding.**
- Hooks/stores inventory otherwise unchanged from round-2's allowed-adapter set (web 40 hooks / mobile 45; mobile-only `app-toast-store` + `review-reminder-store`; 4 core stores paired). No new behavioral one-sided surfaces.

## Verdict

**3 LOW** (R2-7 dead `claimAdReward`, R2-11 dead `useInvalidateSummary`, R2-9 web profile.language sync). ZERO HIGH, ZERO MED.

Net vs round-2 (was 0 HIGH · 6 MED · 7 LOW = 13): **10 resolved.** All 6 MED (incl. mobile ErrorBoundary / D28) closed. The 3 survivors are LOW: two dead-export cleanups (rule 2) and one continuous-vs-login-time locale-sync policy choice — none is a user-facing behavioral divergence.

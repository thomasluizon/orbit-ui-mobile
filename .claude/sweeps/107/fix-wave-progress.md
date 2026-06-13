# Round-2 fix-wave progress (survives interruption)

Commits so far: api dec5bcc (API-FIX), ui-mobile 068aad8 (batch1: SHELL + HABITS-FORMS).

## Batch status
- [x] API-FIX (orbit-api) — committed dec5bcc. 36 controller sites ship errorCode; BulkSkip+count perf; D29 (deleted GetAllLogs controller action only, kept query for MCP).
- [x] SHELL-FIX — committed 068aad8. Overlay LIFO infra (use-overlay-escape web / use-overlay-back mobile), ErrorBoundary D28, motion D9 (dots/tour), 404 gradient, overlay ring, upgrade price parity.
- [x] HABITS-FORMS-FIX — committed 068aad8. Submit-gating F1/F2 parity, constants, D33 orphan-core rewire (tag-selection + dismiss-guard now 4 importers), D34 tooltip, collapsible motion, form a11y.
- [x] HABITS-TODAY-FIX — committed a946724. Invalidation matrix, F4/F8/F9/F14 keyboard, refetch motion, a11y, RNGH swipe (needs user QA).
- [x] PROFILE-FIX — committed a946724. API-key expiry parity, D24 supabase, error states, i18n keys (added to locales), aiKeys+paths, dead exports, account-deletion tests.
- [x] GOALS-CHAT-FIX — DONE (uncommitted, per brief). F16 inverted-error fixed both platforms (friendly i18n; raw only in dev). D33: both breakdown-suggestion now consume shared buildBreakdownCreateRequest + filterValidBreakdownHabits (app-local dup deleted). R2-4 mobile breakdown quantity editor added (every-N parity). R2-5 retrospective Regenerate added to web result card (judged: mobile's affordance is correct UX → add to web). Goal unit→MAX_GOAL_UNIT_LENGTH ×4; web goal forms noValidate + native min=0.01 removed (shared targetValueRequired surfaces). Chat offline copy → chat.offline.title/description (consumes pre-staged chat.json — CAL-NOTIF owns that merge). Goals status-text→-text token (detail-sections:184, create 381/523, edit 251/395 + mobile mirrors); placeholder fg-4→fg-3 in goal modals + progress-form; retrospective fg-4→fg-3 both. Mobile goal-list .map→FlatList (GoalList owns scroll; GoalsView threads sharedHeader as ListHeaderComponent + skeleton/empty as ListEmptyComponent; (tabs)/index.tsx goals branch de-nested — touched HABITS-TODAY file minimally, see handoff). actions/goals.ts 7 raw paths→API.goals.*. a11y: breakdown remove-X + freq-qty input labeled both platforms; mobile chips/buttons roles. Tests: mobile use-goal-queries (new, mirrors web), use-chat-reward (new), breakdown F16+quantity (web+mobile new). tsc green web+mobile; all my partition tests green (full mobile 526 green; full web 1496/1497 — the 1 fail is CAL-NOTIF's calendar-sync.test.tsx, concurrent, not mine).
- [ ] CAL-NOTIF-FIX — RUNNING (batch3).
- [ ] AUTH-FIX — batch4 (never launched in wave2: wasReactivated, OTP, BFF Zod D23, D32 client error-code).
- [ ] CLEANUP-FIX — batch4 (dead exports, @next/env D30, i18n.ts default, use-billing/use-summary inline keys, 'use client' removals, + ORPHANED F2 emoji-picker ESC + F9 checklist dnd from shell-to-habits-forms.md, + F15 cross-cutting offline copy on support/retrospective/upgrade surfaces).

## ORPHANED handoff (must be picked up — HABITS-FORMS finished before seeing it)
- `shell-to-habits-forms.md`: F2 emoji-picker ESC (habit-form-fields emoji picker → stack-register like shell did for date-picker) + F9 checklist dnd KeyboardSensor. → assign to CLEANUP-FIX or do directly. Files are HABITS-FORMS territory (now committed, safe to touch).

## i18n-additions emitted (central merge pending — W2.5 redo)
chat.json (chat.offline.* — never merged), habits-forms.json (habits.form.removeSubHabit — ALREADY merged to locales by that agent), shell.json ({}), + pending: habits-today.json, profile.json, goals.json, cal-notif.json, auth.json.
NOTE: central merge step must reconcile — some agents merge directly (habits-forms did), others emit-only. Verify parity after.

## DONE: all batches + i18n merge + Wave 3 committed. Commits:
- api dec5bcc; ui-mobile chain: 068aad8 (b1) → a946724 (b2) → 59ddd32 (b3) → 61739eb (b4) → 9bdcdff (i18n) → 45d6312 (wave3) → 6399d00 (register).
- Both repos green: type-check/lint/tests (ui-mobile 981+544+1511; api 3252).
- Wave 3: 28 fns split, 18+2 roots deferred (justified), ~29 not-a-function skips.

## NOW: round-3 verification battery running (14 sweeps / 6 agents). Reports → round-3/.
## ROUND-3 results (all 14 in): 0 HIGH except a11y(2) + quality(154 rule-7). MED ~30, LOW ~40.
- ZERO: contract, deps, security, design.
- Small MED/LOW: perf (SkipHabit×2 MED + N+1), arch (tags.ts/support.ts paths MED), ux (drill F1, login-offline F15 MED), keyboard/i18n/parity/validation/tests (LOW).
- a11y: 2 HIGH (contrast migration incomplete, ~27 fg-4-as-text/placeholder sites) + 13 MED + 8 LOW.
- quality: 154 rule-7 (web 81/mobile 73 — wave-3 split ~36, registered 62; tail unsplit incl. CalendarSyncScreen 718/useChatComposer 652-635/HabitFormFields 631/UpgradeScreen 592/TodayPage 580) + 24 MED rule-10 dup + 5 dead exports.

## ROUND-4 plan (sequenced to avoid component-file collision):
- R4a NOW (parallel, disjoint): R4-A11Y (component contrast/aria migration, all FE visual) + API-R4 (SkipHabit includes, N+1, v1 route).
- R4b after A11Y commits: SPLIT-WEB-2 + SPLIT-MOBILE-2 (split decomposable big fns + register genuine roots + handle that platform's rule-10 dup + rule-2 dead exports + small round-3 FE MED/LOW: paths, drill F1, login-offline, constants, dead claimAdReward/useInvalidateSummary). highlightText→shared core.
- Then round-5 sweep (quality + a11y focus) → until ZERO → Phase F.

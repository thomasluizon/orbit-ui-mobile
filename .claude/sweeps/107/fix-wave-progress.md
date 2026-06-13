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

## After all batches: central i18n merge → validate both → Wave 3 (206 fn splits) → round-3 battery.

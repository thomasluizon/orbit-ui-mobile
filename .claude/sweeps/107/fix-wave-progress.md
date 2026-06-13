# Round-2 fix-wave progress (survives interruption)

Commits so far: api dec5bcc (API-FIX), ui-mobile 068aad8 (batch1: SHELL + HABITS-FORMS).

## Batch status
- [x] API-FIX (orbit-api) — committed dec5bcc. 36 controller sites ship errorCode; BulkSkip+count perf; D29 (deleted GetAllLogs controller action only, kept query for MCP).
- [x] SHELL-FIX — committed 068aad8. Overlay LIFO infra (use-overlay-escape web / use-overlay-back mobile), ErrorBoundary D28, motion D9 (dots/tour), 404 gradient, overlay ring, upgrade price parity.
- [x] HABITS-FORMS-FIX — committed 068aad8. Submit-gating F1/F2 parity, constants, D33 orphan-core rewire (tag-selection + dismiss-guard now 4 importers), D34 tooltip, collapsible motion, form a11y.
- [ ] HABITS-TODAY-FIX — RUNNING (batch2). + handoff: F8 ControlsMenu, F9 habit-list dnd.
- [ ] PROFILE-FIX — RUNNING (batch2). + handoff: profile skeleton radii.
- [ ] GOALS-CHAT-FIX — batch3.
- [ ] CAL-NOTIF-FIX — batch3.
- [ ] AUTH-FIX — batch4 (never launched in wave2: wasReactivated, OTP, BFF Zod D23, D32 client error-code).
- [ ] CLEANUP-FIX — batch4 (dead exports, @next/env D30, i18n.ts default, use-billing/use-summary inline keys, 'use client' removals).

## ORPHANED handoff (must be picked up — HABITS-FORMS finished before seeing it)
- `shell-to-habits-forms.md`: F2 emoji-picker ESC (habit-form-fields emoji picker → stack-register like shell did for date-picker) + F9 checklist dnd KeyboardSensor. → assign to CLEANUP-FIX or do directly. Files are HABITS-FORMS territory (now committed, safe to touch).

## i18n-additions emitted (central merge pending — W2.5 redo)
chat.json (chat.offline.* — never merged), habits-forms.json (habits.form.removeSubHabit — ALREADY merged to locales by that agent), shell.json ({}), + pending: habits-today.json, profile.json, goals.json, cal-notif.json, auth.json.
NOTE: central merge step must reconcile — some agents merge directly (habits-forms did), others emit-only. Verify parity after.

## After all batches: central i18n merge → validate both → Wave 3 (206 fn splits) → round-3 battery.

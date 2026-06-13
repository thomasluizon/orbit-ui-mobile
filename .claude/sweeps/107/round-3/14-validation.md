# Round-3 sweep #14 — Frontend validation parity (issue #107, strand 5) — VERIFICATION

Baseline: ui-mobile `6399d00` (committed green), branch `main`. Read-only re-verification of all 14 round-2 `14-validation.md` findings (F1..F14) against current code. Source of truth: `packages/shared/src/validation/{constants,habit-form,goal-form,tag-form,api-key-form,index}.ts`.

## HIGH — submit-gating + API-key (F1, F2, F3) — ALL RESOLVED

- **F1 (habit create) — FIXED.** Both platforms now gate on the shared-schema `formState.isValid`:
  web `create-habit-modal.tsx:366` `disabled={isPending || !formHelpers.form.formState.isValid}`; mobile `create-habit-modal.tsx:302` `submitDisabled = isPending || !formHelpers.form.formState.isValid`. The mobile `!titleFilled` gate is gone. Both `use-habit-form.ts` hooks use `resolver: zodResolver(habitFormSchema)` (web :62, mobile :56) with no explicit `mode` (both default `onSubmit` + `reValidateMode:'onChange'`), so `isValid` behaves identically. Zero/empty frequency now disables the button on BOTH (no more mobile-toast-vs-web-silent split).
- **F2 (habit edit) — FIXED.** web `edit-habit-modal.tsx:183` + mobile `edit-habit-modal.tsx:197` both `!formHelpers.form.formState.isValid`. Grep confirms **no `titleFilled` gating remains in any of the four modals**.
- **F3 (API-key expiry parse + error key) — FIXED, now SYMMETRIC.** Mobile `components/ui/create-api-key-modal.tsx` fully adopted the shared module: imports `parseApiKeyExpiryUtc` + `MAX_API_KEY_NAME_LENGTH` (:16-19); `validate()` uses `parseApiKeyExpiryUtc(expiresAt)` → error key `t('orbitMcp.invalidExpiry')` (:333-336); submit builds `expiresAtUtc` via `parseApiKeyExpiryUtc(expiresAt)?.toISOString()` (:355-356). Web `create-api-key-modal.tsx:63-81,98-100` is byte-for-byte identical (same strict-UTC pattern, same `orbitMcp.invalidExpiry`/`orbitMcp.keyNameRequired`/`orbitMcp.keyNameMaxLength` keys). The round-2 asymmetry (web strict-UTC + `orbitMcp.invalidExpiry` vs mobile lenient-`new Date()` + `auth.genericError`) is eliminated.

## MED — sub-habit flow, reminders, constants (F4, F5, F8, F9, F10, F11, F13) — ALL RESOLVED

- **F4 (sub-habit non-pro flow) — FIXED, SYMMETRIC.** Both platforms now: non-pro → render the SAME upsell block (`habits.form.subHabits` label + `ProBadge` + `upgrade.features.subHabits.tooltip` hint + `upgrade.subscribe`), pro → render editable rows + add button. Mobile `sub-habit-editor.tsx:52-78` no longer renders editable rows for non-pro. The mobile `isSubHabitMode && !hasProAccess` → `/upgrade` redirect (create-habit-modal.tsx:131-135 effect + :230-234 submit) now has an EXACT web counterpart (web :113-118 effect + :195-199 submit). The asymmetric `hasTypedSubHabits` branch is gone.
- **F5 (scheduled reminders) — FIXED.** Both import `MAX_SCHEDULED_REMINDERS` + `validateScheduledReminders` from `@orbit/shared/validation` and call them (web `habit-form-fields.tsx:18,20,632,641`; mobile `scheduled-reminder-section.tsx:8,9,43,52`). No local `const MAX_SCHEDULED_REMINDERS = 5` re-declaration on either side.
- **F8 (sub-habit caps) — FIXED.** `MAX_HABIT_TITLE_LENGTH` + `MAX_SUB_HABITS` adopted (web `create-habit-modal.tsx:293,313`; mobile `sub-habit-editor.tsx:92,119`).
- **F9 (tag name) — FIXED.** `MAX_TAG_NAME_LENGTH` (web `habit-form-fields.tsx:158`; mobile `tag-editor-row.tsx:39`).
- **F10 (goal unit) — FIXED.** `MAX_GOAL_UNIT_LENGTH` in all four (web create `:312` / edit `:199`; mobile create `:195` / edit `:110`).
- **F11 (goals-limit) — FIXED.** `selectedGoalIds.length >= MAX_GOALS_PER_HABIT` in all four modals (web create `:97` / edit `:58`; mobile create `:110` / edit `:65`).
- **F13 (API-key name cap, mobile) — FIXED.** Mobile uses `MAX_API_KEY_NAME_LENGTH` in the validate guard (`:329`) and `maxLength` (`:170`), matching web.

## F7 (habit description) — RESOLVED

`MAX_HABIT_DESCRIPTION_LENGTH` adopted on both (web `habit-form-fields.tsx:1346`; mobile `advanced-section.tsx:98`).

## F14 (goal native-min bubble) — RESOLVED

Both web goal forms gained `noValidate` (create `create-goal-modal.tsx:231`, edit `edit-goal-modal.tsx:157`), so the shared `validateGoalForm` message (`goals.form.targetValueRequired`) owns 0/negative-target rejection on both platforms instead of an untranslated native `min={0.01}` browser bubble pre-empting it. Mobile already showed the shared message.

## Still-open (symmetric drift only — LOW, no behavioral divergence)

- **LOW · F6 (residual) · web `apps/web/components/onboarding/onboarding-create-habit.tsx:182` + mobile `apps/mobile/components/onboarding/onboarding-create-habit.tsx:195` · dim 2** — habit-title `maxLength={200}` LITERAL remains in BOTH onboarding screens (`MAX_HABIT_TITLE_LENGTH` exists + is adopted in the main habit-form-fields on both). Value is identical on both platforms → single-source drift risk, NOT a parity divergence. The other three F6 call sites (web/mobile habit-form-fields) were fixed. Fix: import the constant in both onboarding files.
- **LOW · F12 (drift, now one-sided) · mobile `apps/mobile/app/login.tsx:395` · dim 2** — `codeDigits.join('').length === 6` literal remains in the mobile code-submit guard. The web side fully adopted `isVerificationCodeComplete` / `VERIFICATION_CODE_LENGTH` (zero literal `6` in the web login flow), and BOTH `use-login-code-entry.ts` hooks use the shared helper for completeness. Behavior is identical (both require 6 digits) so this is a lone single-source nit, not a behavioral gap. Fix: replace with `isVerificationCodeComplete(codeDigits)` (already imported via the shared util) or `VERIFICATION_CODE_LENGTH`.

## Per-surface confirmation (compliant + identical, re-verified)

Habit create/edit (F1/F2 gate via shared `habitFormSchema` isValid), sub-habit editor (F4 symmetric), API-key create (F3/F13 shared `parseApiKeyExpiryUtc` + `MAX_API_KEY_NAME_LENGTH` + identical error keys), scheduled reminders (F5 shared validator+const), goal create/edit (F10 const + F14 noValidate), goal progress, tag create/edit (F9 const), checklist items/templates, offset reminders, due/end date+time, auth email, profile display name (`setNameRequestSchema.safeParse` both), support/contact — all gate identically on shared schemas/validators with shared error keys.

## Verdict

**2 LOW** (F6 onboarding-title literal — symmetric; F12 mobile code-length literal — one-sided drift). ZERO HIGH, ZERO MED.

Net vs round-2 (was 3 HIGH · 9 MED · 2 LOW = 14): **12 of 14 resolved.** Both HIGH submit-gating findings (F1, F2) and the HIGH API-key divergence (F3) are closed and now byte-symmetric; all 9 MED (sub-habit flow, reminders, every constant-literal) closed. The 2 survivors are LOW drift-only — identical or near-identical values that should reference a shared constant for single-source hygiene, with no user-facing behavioral difference between platforms.

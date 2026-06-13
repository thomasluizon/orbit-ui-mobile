# Round-5 sweep #14 — Frontend validation parity (issue #107) — FINAL VERIFICATION

Baseline: ui-mobile `3520d10` (committed green), branch `main`. Read-only. Verifies the two round-3 LOW survivors (F6 onboarding title literal, F12 mobile login length literal) landed in round 4, and that the resolved HIGH/MED parity (submit-gating, API-key) still holds after the r4 splits.

## Round-3 survivors — both RESOLVED in round 4

- **F6 (onboarding habit-title `maxLength` → constant, BOTH platforms)** — **FIXED.** The `maxLength={200}` literal is gone from both onboarding screens; both now import + use the shared constant:
  - web `apps/web/components/onboarding/onboarding-create-habit.tsx:16` imports `MAX_HABIT_TITLE_LENGTH`; `:183` `maxLength={MAX_HABIT_TITLE_LENGTH}`.
  - mobile `apps/mobile/components/onboarding/onboarding-create-habit.tsx:21` imports it; `:196` `maxLength={MAX_HABIT_TITLE_LENGTH}`.
  Single-source restored on both; the round-3 drift nit is closed.

- **F12 (mobile login code length `=== 6` → `VERIFICATION_CODE_LENGTH`)** — **FIXED.** `apps/mobile/app/login.tsx:396` submit-gate now `isVerificationCodeComplete(codeDigits) && !isSubmitting && isOnline` (imported `:22`). Grep for `=== 6` / `length === 6` / `join('').length` in `login.tsx`: ZERO. Matches the web side (which already used the shared helper) — the lone literal is gone.

## Resolved HIGH/MED still holding (post-r4-split spot-check)

- **Submit-gating (F1/F2) — holds, byte-symmetric.** All four modals gate on shared-schema `formState.isValid`: web create `create-habit-modal.tsx:366` / edit `edit-habit-modal.tsx:183`; mobile create `create-habit-modal.tsx:302` / edit `edit-habit-modal.tsx:197`. No `titleFilled` gating anywhere.
- **API-key (F3/F13) — holds, byte-symmetric.** Both `components/ui/create-api-key-modal.tsx` import `parseApiKeyExpiryUtc` + `MAX_API_KEY_NAME_LENGTH` (web :6, mobile :17-18), validate expiry via `parseApiKeyExpiryUtc` (web :75 / mobile :334), cap the name via `MAX_API_KEY_NAME_LENGTH` (web :70,221 / mobile :170,329), and build `expiresAtUtc` identically (web :99 / mobile :356). Same error keys.

The r4 chat/calendar refactors touched none of the validation surfaces; all per-surface gating (habit, sub-habit, goal create/edit, reminders, tag, checklist, auth, profile display name, support) remains on shared schemas/validators with shared error keys.

## Verdict

**ZERO FINDINGS.** Both round-3 LOW survivors (F6 onboarding-title literal both platforms; F12 mobile login length literal) landed in round 4 via the shared constants. Submit-gating + API-key parity remain byte-symmetric. Net: round-3's 2 LOW → 0.

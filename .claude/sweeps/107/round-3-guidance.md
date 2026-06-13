# Round-3 battery guidance (read before every round-3 sweep)

Baseline committed green: ui-mobile 6399d00, api dec5bcc. Both repos: build/type-check/lint/tests all pass (ui-mobile 981 shared + 544 mobile + 1511 web; orbit-api 3252).

This is the VERIFICATION pass after two full fix rounds. Most findings should be RESOLVED. Report ONLY new or still-open NON-DEFERRED findings. If your domain is clean, say ZERO FINDINGS.

## Binding deferral registers (NEVER report these as findings)
1. `triage-round-1.md` → DEF-1..DEF-8, DEF-2b (Lighthouse/runtime user-owned; orchestration-root file lengths; version-pin matrix; expo bump; postcss-in-next; Stripe.net major; xunit v3; <300-char dup).
2. `triage-round-2.md` → all D-decisions + deferral notes.
3. `wave3-deferrals.md` → every `DEFER:root` (18 + ui-store + DEF-2b's 4 = orchestration roots whose residual >100 lines is justified) and every `SKIP:not-a-function` (StyleSheet.create / data literals / Zustand store factories / static-JSX pages / vitest config — these are NOT rule-7 functions).

## Calibration corrections (learned in round 2 — do NOT repeat these false positives)
- **Dead-export detection MUST count `__tests__` importers.** Round-2 quality flagged 21 shared `types/*` exports as dead; ALL are imported + `.safeParse`-tested in `packages/shared/src/__tests__/types.test.ts` and re-exported through the barrel. A schema whose `z.infer` type is imported anywhere (incl. tests, barrels) is NOT dead. Grep test files too.
- **Function-size: count FUNCTIONS, not constructs.** StyleSheet.create objects, plain data/const object literals, Zustand store-state factories, and static-JSX legal pages are not rule-7 violations even if >100 lines. The genuine oversized-function set was split in wave 3; residual orchestrator roots are registered.
- **checkout route is NOT orphaned** (forwards X-Forwarded-For for geo-pricing) — don't re-flag.
- **GetAllHabitLogsQuery/Handler/Validator are KEPT** (MCP tool uses them); only the controller action was deleted.

## What each sweep should verify resolved (spot-check, don't re-report if fixed)
- i18n: key parity (was 1625=1625); the 5 merged keys (chat.offline.*, errors.offline, habits.breakdown.frequencyQuantityLabel/removeHabit); backend controllers now ship errorCode.
- validation: habit create+edit submit-gating parity (both gate on shared-schema isValid); API-key expiry shared helper both platforms; constants adopted.
- keyboard: overlay LIFO (date-picker/emoji/description-viewer/push-prompt/tour/level-up), ErrorBoundary, ControlsMenu, dnd KeyboardSensor, focus restore.
- a11y: fg-4→fg-3 text + status-text token consumers migrated; hit targets ≥44; accessibilityRole on mobile pressables; bad-habit checkbox focusable.
- ux: error states (no raw error.message), ErrorBoundary mobile+web(chat), offline copy.
- parity: dismissCalendarImport PUT; invalidation matrix; OTP convergence; wasReactivated; breakdown quantity.
- perf: BulkSkip filtered include; materialize-for-count→Any/CountAsync; FlatLists; RNGH swipe; FE motion transform-only.
- architecture: web Server Actions use API.* constants; aiKeys factory; mobile fetch→apiClient.
- security: supabase env-or-throw; BFF Zod; deletion rate-limits; 0 high vulns.
- design: D9 motion transform-only; status-text tokens; no accent literals.
- contract: pushToken deleted; config settings shape; habitScheduleChild fields.
- tests: backend gaps filled; FE mirror tests added; orphan cores rewired.
- deps: underscore HIGH gone; dead deps removed; @next/env removed.

Output: write `.claude/sweeps/107/round-3/<NN>-<domain>.md`; per finding `HIGH|MED|LOW · file:line · rule · fix`; end `## Verdict` (counts or the exact words ZERO FINDINGS). Final message: verdict + counts + (if any) top findings.

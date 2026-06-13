# Recovery notes — Wave-2 session-limit interruption

## What happened
All 8 Wave-2/1.5 agents hit the account session limit simultaneously mid-edit and died without validating/reporting. Working trees were left partially modified. Recovery done from the main session.

## Recovered to GREEN baseline (both repos)
- **orbit-api**: was 8 build errors (ERRORS-API incomplete `using Orbit.Application.Common;` on 7 converted files) + 70 test failures. Fixed:
  - Added missing usings to 7 command files.
  - 60 controller-test assertions `BeOfType<BadRequest/NotFoundObjectResult>()` → `BeAssignableTo<ObjectResult>().Which.StatusCode...` (uniform `ToErrorResult` now returns `ObjectResult{status}`; OAuth tests left alone — unconverted).
  - 2 `ErrorMessages_*` reflection tests cast `(string)` → `((AppError)…).Message` (fields are now AppError).
  - Extension test `ToPayGateAwareResult_Failure` same BeAssignableTo fix.
  - Deleted obsolete `GetCalendarMonthQueryHandlerTests.Handle_DateRangeExceeds62Days` (guard moved to validator, which has its own passing test).
  - Build 0 errors / 0 warnings; **3251 tests pass**.
- **ui-mobile**: was 4 type errors. Fixed:
  - `use-drill-navigation.ts` (web) rewired old `fetchDrillChildren` body to shared `loadDrillChildren`/`mergeDrillChildrenMap` (habits-today agent left it half-migrated).
  - `create-api-key-modal.tsx:176` `ScopeOption` → `AgentScopeOption`.
  - `layout.tsx` + `profile.test.ts` import `dismissCalendarImport` from `actions/calendar` (cal-notif moved it there with the POST→PUT fix).
  - type-check 3/3 green; lint exit 0; **1484 web + 900 shared + 459 mobile tests pass**.

## Known-incomplete items (NOT failures — won't all surface as sweep findings)
- **D3 client half (never launched auth-login agent)**: ERRORS-API died before emitting `error-codes.json`; the client-side `getErrorMessage`/`AUTH_BACKEND_ERROR_MAP` rewire to map `errorCode` → i18n was never done. Backend change is ADDITIVE on the wire (`error` string still present + `errorCode` added), so nothing is broken — clients still read `error`. This is an unfinished IMPROVEMENT. Decide in round-2 fix pass: either complete the client mapping (emit code catalog from orbit-api, map in shared) or DEFER with justification (additive, non-breaking).
- **4 missing i18n keys** (round-2 sweep #1 will catch): `upgrade.comparison.subHabits.tooltip` (mobile sub-habit-editor — namespace `upgrade.comparison` doesn't exist → investigate habits-forms non-pro sub-habit fix completeness), `orbitMcp.invalidExpiry` (web create-api-key-modal), `auth.minutesShort` (web expiry-warning, takes {minutes}), `updatePrompt.version` (web update-prompt, takes {previous,next}). Add to BOTH locales with proper copy in round-2.
- **Wave-2 partition completeness unknown**: each agent died after 53-112 tool calls; type-check+tests pass but whether each FINISHED all assigned fixes is unverified. Round-2 battery is the definitive check — unapplied fixes resurface as findings.

## Checkpoints
- Pre-repair: ui-mobile `a2ef611`, api `e9b06ca`.

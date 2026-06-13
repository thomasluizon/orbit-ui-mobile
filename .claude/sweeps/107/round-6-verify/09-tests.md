# Round-6 verify — Sweep #9 Test coverage & quality — issue #107

READ-ONLY. Baselines: ui-mobile **1dd5c3d** (committed green), orbit-api **fcfdc95**. Suites NOT run (declared green; brief forbids test-suite runs). Verifies the 3 NEW split-sub-hook test files exist and assert behavior (not stubs), and that the DEF-R6-TEST-1..4 registrations are accepted per brief.

## The 3 new split-sub-hook test files — EXIST and are behavior-asserting

All three round-4-split chat sub-hooks that round-5 flagged as the only genuinely-missing tests now have direct renderHook coverage:

- **`apps/web/__tests__/hooks/use-chat-pending-operations.test.ts`** (NEW, 7 `it`s) — read the full body: drives `confirmAndExecutePendingOperation` (confirm→execute→`onExecuted` forwarding + outcome), the confirm-failure short-circuit (asserts `executePendingOperation` NOT called + `chat.sendError`), `prepareStepUpForBubble` (confirm→issue with the active `pt-BR` locale forwarded; asserts `{ok, challengeId, confirmationToken}`), the challenge-issue failure branch, `verifyStepUpForBubble` (verify→execute→`onExecuted`), and the verify-failure branch (no execute). Mocks `@/app/actions/chat` + `next-intl`. Real assertions on call args + return shape.
- **`apps/web/__tests__/hooks/use-chat-image-attachment.test.tsx`** (NEW, 6 `it`s) — valid pick clears the error + builds a `blob:` preview, type rejection → `chat.imageError`, oversized (21 MB) → `chat.imageSizeError`, paste capture + `preventDefault` called once, wrong-type paste → `chat.imageError`, and `removeImage` → `revokeObjectURL` called with the preview URL. Stubs `URL.createObjectURL/revokeObjectURL`. Real assertions.
- **`apps/mobile/__tests__/hooks/use-pending-operation-execution.test.tsx`** (NEW, 4 `it`s) — `prepareStepUpForBubble` (confirm→step-up, asserts the `{language: 'pt-BR'}` body is forwarded to `API.ai.pendingOperationStepUp`), confirm-failure error branch, `verifyStepUpForBubble` (verify→execute→`appendExecutionMessage` with the agent response), and the verify-failure branch (no execute, no append). Mocks `@/lib/api-client` + `react-i18next`. Real assertions on `API.ai.*` endpoint call sequence + bodies.

These map exactly to the DEF-R4-deferral round-6 note (web 6+6, mobile 4 = 16 new tests) and close the consolidated round-5 LOW (the step-up / image-attachment / confirm-execute branches the r4 split surfaced as discrete units).

## DEF-R6-TEST-1..4 registrations — ACCEPTED (per brief; not reported)

Per the brief's binding instruction, the four registered test-quality nits are accepted and NOT reported as findings:
- **DEF-R6-TEST-1** — web class-name/CSS-selector assertions (~9 files); rewrite would require adding `data-*` to production source (surgical-changes violation).
- **DEF-R6-TEST-2** — thin-wrapper mobile hooks (`use-summary`, `use-habit-form`, `use-resolve-clarification`, `use-review-reminder`) whose shared cores are already tested.
- **DEF-R6-TEST-3** — hand-rolled `NormalizedHabit` fixtures vs `createMockHabit` (mechanical, zero behavior change).
- **DEF-R6-TEST-4** — orbit-api reflection/private-member tests (separate API repo/PR).

## Verdict

| Severity | Count |
|---|---|
| HIGH | 0 |
| MED | 0 |
| LOW | 0 |
| **Total** | **0** |

**ZERO FINDINGS.** All 3 new split-sub-hook test files exist and are real behavior-asserting renderHook tests (web pending-operations 7, web image-attachment 6, mobile pending-operation-execution 4 = the registered 16 new tests), closing the round-5 consolidated chat-coverage LOW. The DEF-R6-TEST-1..4 registrations are accepted per brief. No remaining non-deferred test gap.

# Stories: BRL Pricing End-to-End + AI Tools Expansion

*Source PRD: `.agents/PRDs/pricing-and-ai-tools.prd.md`. Generated 2026-05-18.*

All issues live in `thomasluizon/orbit-ui-mobile`. Each story gets one `repo:*` label and one `type:*` label; `parity-required` whenever a frontend hook/component change must land on both web and mobile.

## Summary

GitHub backlog filter: <https://github.com/thomasluizon/orbit-ui-mobile/issues?q=is%3Aissue+is%3Aopen+label%3Arepo%3Abackend%2Crepo%3Afrontend%2Crepo%3Aboth>

| # | Issue | Title | Phase | Repos | Type | Complexity | Depends on |
|---|-------|-------|-------|-------|------|------------|------------|
| 1 | [#78](https://github.com/thomasluizon/orbit-ui-mobile/issues/78) | Charge Brazilian users in BRL end-to-end via Stripe | 1 | backend | bug | M | — |
| 2 | [#79](https://github.com/thomasluizon/orbit-ui-mobile/issues/79) | Route MCP HabitTools through AgentOperationExecutor (establish pattern) | 2 | backend | tech | M | — |
| 3 | [#88](https://github.com/thomasluizon/orbit-ui-mobile/issues/88) | Apply executor pattern to remaining 10 MCP toolsets | 2 | backend | tech | M | #79 |
| 4 | [#80](https://github.com/thomasluizon/orbit-ui-mobile/issues/80) | Fix NotificationTools direct-DbContext bypass via MediatR | 2 | backend | bug | S | — |
| 5 | [#81](https://github.com/thomasluizon/orbit-ui-mobile/issues/81) | Add HTTP integration tests for /api/ai/pending-operations/* | 2 | backend | tech | M | — |
| 6 | [#91](https://github.com/thomasluizon/orbit-ui-mobile/issues/91) | Add read-only API-key mutation-denial integration test | 2 | backend | tech | S | #88 |
| 7 | [#92](https://github.com/thomasluizon/orbit-ui-mobile/issues/92) | Add lint/test rule preventing direct IMediator calls from MCP tools | 2 | backend | tech | S | #88 |
| 8 | [#89](https://github.com/thomasluizon/orbit-ui-mobile/issues/89) | Chat: fill habit/goal write gaps (reorder + checklist + bulk) | 3 | backend | feature | M | #79 |
| 9 | [#82](https://github.com/thomasluizon/orbit-ui-mobile/issues/82) | Chat: fill read gaps (daily_summary, retrospective, habit_metrics) | 3 | backend | feature | S | — |
| 10 | [#83](https://github.com/thomasluizon/orbit-ui-mobile/issues/83) | Chat: full tag CRUD (list/create/update/delete) | 3 | backend | feature | S | — |
| 11 | [#93](https://github.com/thomasluizon/orbit-ui-mobile/issues/93) | MCP: add chat-only managers (subscription, calendar sync, notifications, support, checklist templates) | 3 | backend | feature | L | #88 |
| 12 | [#94](https://github.com/thomasluizon/orbit-ui-mobile/issues/94) | MCP: add high-risk managers (account lifecycle, API keys) with step-up | 3 | backend | feature | M | #88 |
| 13 | [#97](https://github.com/thomasluizon/orbit-ui-mobile/issues/97) | Capability-parity test (chat ↔ MCP) | 3 | backend | tech | S | #89, #82, #83, #93, #94 |
| 14 | [#96](https://github.com/thomasluizon/orbit-ui-mobile/issues/96) | UI rendering for new chat tool responses (web + mobile) | 3 | frontend | feature | M | #89, #82, #83 |
| 15 | [#84](https://github.com/thomasluizon/orbit-ui-mobile/issues/84) | Author feature-explanation markdown bundle (8 topics) | 4 | backend | tech | M | — |
| 16 | [#90](https://github.com/thomasluizon/orbit-ui-mobile/issues/90) | Implement describe_feature tool + system-prompt trim | 4 | backend | feature | M | #84 |
| 17 | [#95](https://github.com/thomasluizon/orbit-ui-mobile/issues/95) | UI: render describe_feature markdown responses | 4 | frontend | feature | S | #90 |
| 18 | [#85](https://github.com/thomasluizon/orbit-ui-mobile/issues/85) | Extract chat composer to packages/shared, both apps consume | 5 | both | tech | L | — |
| 19 | [#86](https://github.com/thomasluizon/orbit-ui-mobile/issues/86) | Surface correlationId in ChatResponse + chat UI footer | 5 | both | tech | S | — |
| 20 | [#87](https://github.com/thomasluizon/orbit-ui-mobile/issues/87) | Replace hardcoded tool-ordering switch with declared attribute/graph | 5 | backend | tech | S | — |
| 21 | [#98](https://github.com/thomasluizon/orbit-ui-mobile/issues/98) | AI silently creates one-time tasks when habit frequency isn't specified | post-PRD | backend | bug | S | — |
| 22 | [#99](https://github.com/thomasluizon/orbit-ui-mobile/issues/99) | Add ActionStatus.NeedsClarification + chat UI question-card | post-PRD | both | feature | M | — |

**Total: 22 issues created in `thomasluizon/orbit-ui-mobile`** (issues #78–#99).

*Stories #21–#22 added 2026-05-18 after user feedback exposed a silent-default bug in chat habit creation. See investigation notes at the bottom of this file.*

---

## Story 1 — Charge Brazilian users in BRL end-to-end via Stripe

**Type**: bug
**Repos**: backend
**Priority**: high
**Complexity**: medium
**Phase**: 1
**Parity required**: no

### User Story

As a Brazilian Pro shopper, when I tap "Assinar Anual" showing R$ 99,90/ano, I want Stripe Checkout to show R$ 99,90 and charge my card in BRL, so I don't get sticker-shocked and abandon.

### Acceptance Criteria

- [ ] Given a user with `TimeZone = America/Sao_Paulo` (or any Brazilian IANA zone), when they create a checkout session for Pro Anual, then Stripe Checkout displays R$ 99,90 and the resulting subscription has `currency = "brl"`
- [ ] Given a user with any non-Brazilian timezone (or null), when they create a checkout session, then Stripe Checkout displays $39.99 USD and `currency = "usd"`
- [ ] Given the BRL or USD price IDs are missing from config at startup, then the API fails to start with a clear error
- [ ] Integration test covers both BR and non-BR paths

### Technical Notes

- New `IPriceResolver` in `Orbit.Application/Subscriptions/Services/`
- `static readonly HashSet<string>` of the 15 Brazilian IANA zones (see PRD Section 6)
- New config keys: `Stripe:Prices:BRL:Annual`, `Stripe:Prices:BRL:Monthly` (add to Render env + local dev)
- Checkout-session creation handler asks `IPriceResolver.Resolve(user.TimeZone, interval)` for the price ID
- Webhook handling unchanged (Stripe stamps currency on the subscription)
- AGENTS.md reference: "Add a new API endpoint" (existing endpoint, just changes the price)

### Dependencies

- Blocked by: none
- Blocks: none

---

## Story 2 — Route MCP HabitTools through AgentOperationExecutor (establish pattern)

**Type**: tech
**Repos**: backend
**Priority**: high
**Complexity**: medium
**Phase**: 2
**Parity required**: no

### User Story

As the owner, every habit-related MCP mutation writes an audit row and respects read-only credentials, so the v2 framework's "single policy surface" claim is true for the most-used MCP toolset.

### Acceptance Criteria

- [ ] Every `[McpServerTool]` method in `HabitTools.cs` calls `IAgentOperationExecutor.ExecuteAsync(...)` with `Surface = AgentExecutionSurface.Mcp` instead of `IMediator.Send(...)`
- [ ] An integration test confirms that an MCP `create_habit` call results in a row in `AgentAuditEntries`
- [ ] An integration test confirms that an MCP API key with `IsReadOnlyCredential = true` is denied with `read_only_credential` reason when calling `create_habit`
- [ ] All existing behavior preserved (MCP `create_habit` still works, errors still format the same way to the client)

### Technical Notes

- Read `AgentOperationExecutor.ExecuteAsync` signature; build a thin helper for MCP-side request construction (`AgentExecuteOperationRequest { OperationId, Surface, Arguments, Principal }`)
- The catalog already has the capability rows; this story doesn't add new capabilities
- Document the pattern in a code comment at the top of `HabitTools.cs` so #3 can mirror it
- Touches: `orbit-api/src/Orbit.Api/Mcp/Tools/HabitTools.cs`, maybe a small `Orbit.Api/Mcp/McpExecutorBridge.cs` helper

### Dependencies

- Blocked by: none
- Blocks: #3, #6, #7, #8, #11, #12

---

## Story 3 — Apply executor pattern to remaining 10 MCP toolsets

**Type**: tech
**Repos**: backend
**Priority**: high
**Complexity**: medium
**Phase**: 2
**Parity required**: no

### User Story

As the owner, every MCP mutation across all entities is audited and policy-checked, completing the framework's "single policy surface" claim.

### Acceptance Criteria

- [ ] All `[McpServerTool]` methods in these toolsets go through `IAgentOperationExecutor`: `GoalTools`, `TagTools`, `ProfileTools`, `UserFactTools`, `AchievementTools`, `StreakTools`, `NotificationTools`, `ReferralTools`, `SubscriptionTools`, `AgentTools`
- [ ] Integration tests sample at least one tool per toolset and confirm audit row + read-only enforcement
- [ ] No regression: all 10 toolsets pass their existing tests

### Technical Notes

- Mirrors pattern from #2 (`HabitTools`)
- Tedious but mechanical — keep diffs scannable by routing one toolset per commit, squash-merge at the end
- This story EXCLUDES the `NotificationTools` direct-DbContext bypass — that's #4

### Dependencies

- Blocked by: #2
- Blocks: #6, #7, #11, #12

---

## Story 4 — Fix NotificationTools direct-DbContext bypass via MediatR

**Type**: bug
**Repos**: backend
**Priority**: high
**Complexity**: small
**Phase**: 2
**Parity required**: no

### User Story

As the owner, MCP notification tools route through MediatR like every other tool, so business rules and validation aren't silently bypassed.

### Acceptance Criteria

- [ ] No method in `NotificationTools.cs` touches `DbContext` directly
- [ ] Each notification MCP tool sends an existing or newly-created MediatR command/query
- [ ] Existing notification MCP behavior preserved (mark read, mark all read, delete, get)

### Technical Notes

- Audit found: `NotificationTools.cs` lines 10, 19–34, 38–53, 56–66, 68–84 write directly via `DbContext.Notifications.Where(...)` — every other MCP tool uses `IMediator`
- May need new MediatR commands if equivalents don't exist; reuse existing where possible
- Independent of #2 and #3; can ship in parallel

### Dependencies

- Blocked by: none
- Blocks: none (could be a sub-task of #3 but kept separate because it's a different bug class)

---

## Story 5 — Add HTTP integration tests for /api/ai/pending-operations/*

**Type**: tech
**Repos**: backend
**Priority**: medium
**Complexity**: medium
**Phase**: 2
**Parity required**: no

### User Story

As the owner, the full confirm → step-up → verify → execute HTTP flow is covered by integration tests, so I find regressions before users do.

### Acceptance Criteria

- [ ] Integration test: POST `/api/ai/pending-operations/{id}/confirm` returns 200 and persists `ConfirmationToken`
- [ ] Integration test: POST `/api/ai/pending-operations/{id}/step-up` issues a challenge; rate limit + max-attempts enforced
- [ ] Integration test: POST `/api/ai/pending-operations/{id}/step-up/verify` succeeds with valid code, fails with invalid
- [ ] Integration test: POST `/api/ai/pending-operations/{id}/execute` requires `ConfirmationToken` and `StepUpSatisfied` for high-risk ops
- [ ] Lives in `tests/Orbit.IntegrationTests/`

### Technical Notes

- Reuses existing test fixtures (real DB, sequential, no mocks)
- Email-sending for step-up should be stubbed in tests — see if there's an existing test-mode toggle for `IEmailService`
- Independent of #2 and #3; can ship alongside

### Dependencies

- Blocked by: none
- Blocks: none

---

## Story 6 — Add read-only API-key mutation-denial integration test

**Type**: tech
**Repos**: backend
**Priority**: medium
**Complexity**: small
**Phase**: 2
**Parity required**: no

### User Story

As the owner, a read-only API-key credential cannot mutate via any MCP path, verified by automation so the guarantee doesn't drift.

### Acceptance Criteria

- [ ] Integration test: an MCP request authenticated with an API key marked `IsReadOnlyCredential = true` is denied with `read_only_credential` when calling `create_habit`
- [ ] Test repeats the assertion across at least 3 toolsets to catch a missing-route bug
- [ ] Test fails fast if any MCP tool routes around the executor

### Technical Notes

- Requires #3 to complete (otherwise some MCP tools still bypass the executor and the test would fail for the wrong reason)
- See `AgentPolicyEvaluator.cs` line 90–91 for `read_only_credential` denial

### Dependencies

- Blocked by: #3
- Blocks: none

---

## Story 7 — Add lint/test rule preventing direct IMediator calls from MCP tools

**Type**: tech
**Repos**: backend
**Priority**: low
**Complexity**: small
**Phase**: 2
**Parity required**: no

### User Story

As the owner, future PRs cannot accidentally re-introduce direct MediatR calls in MCP tools, so the executor-routing guarantee is enforced by tooling.

### Acceptance Criteria

- [ ] CI fails if any file in `orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` contains `IMediator.Send` (or `_mediator.Send`)
- [ ] The check accepts an explicit allowlist for any genuinely-exempt tools (none expected after #2 + #3)
- [ ] Rule documented in `AGENTS.md` so contributors see it

### Technical Notes

- Implementation options: (a) a Roslyn analyzer in the API project, (b) a small unit test that scans the files, (c) a shell script in CI. Recommend (b) for simplicity — a single xUnit test asserting the regex doesn't match.

### Dependencies

- Blocked by: #3
- Blocks: none

---

## Story 8 — Chat: fill habit/goal write gaps (reorder + checklist + bulk)

**Type**: feature
**Repos**: backend
**Priority**: high
**Complexity**: medium
**Phase**: 3
**Parity required**: no

### User Story

As an in-app chat user, when I say "reorder my habits so 'meditate' is first" or "create a morning routine with 4 habits", the AI executes it. Today it can't.

### Acceptance Criteria

- [ ] New `IAiTool` implementations registered for: `reorder_habits`, `reorder_goals`, `update_checklist`, `bulk_create_habits`, `bulk_delete_habits`
- [ ] Each tool is a thin wrapper around the existing MediatR command (reuse handlers from MCP tooling)
- [ ] Each tool registered in `AgentCatalogService.cs` with correct `risk_class`, `confirmation_requirement`, `scope`, `chat_tools[]`
- [ ] Unit tests for each tool's argument parsing and command dispatch
- [ ] Chat E2E: model can successfully call each new tool

### Technical Notes

- Pattern: copy `apps/api/.../Chat/Tools/Implementations/QueryHabitsTool.cs` as a template for `IAiTool` shape
- These are all WRITE operations — pending-confirmation flow applies; verify destructive ops trigger it correctly
- `update_checklist` is for checklist ITEMS, not templates (templates are a different domain — story #11 covers them on MCP side)

### Dependencies

- Blocked by: #2 (pattern established)
- Blocks: #13, #14

---

## Story 9 — Chat: fill read gaps (daily_summary, retrospective, habit_metrics)

**Type**: feature
**Repos**: backend
**Priority**: medium
**Complexity**: small
**Phase**: 3
**Parity required**: no

### User Story

As an in-app chat user, I can ask the AI "give me today's summary" or "show me last month's retrospective" or "how am I doing with 'meditate' specifically?" and get accurate data.

### Acceptance Criteria

- [ ] New `IAiTool` implementations for `get_daily_summary`, `get_retrospective`, `get_habit_metrics`
- [ ] Each tool registered in catalog with `risk_class: Low`, no confirmation
- [ ] Unit tests for each

### Technical Notes

- Wrappers around existing queries (`GetDailySummaryQuery`, `GetRetrospectiveQuery`, `GetHabitMetricsQuery`)
- Returns structured JSON; chat UI renders the message text from the model's natural-language response, so no UI changes needed unless the model surfaces structured data

### Dependencies

- Blocked by: none
- Blocks: #13, #14

---

## Story 10 — Chat: full tag CRUD (list/create/update/delete)

**Type**: feature
**Repos**: backend
**Priority**: medium
**Complexity**: small
**Phase**: 3
**Parity required**: no

### User Story

As an in-app chat user, I can ask "list my tags", "rename 'work' to 'job'", "create a 'personal' tag", or "delete 'old'" and the AI handles it. Today chat has only `assign_tags`.

### Acceptance Criteria

- [ ] New `IAiTool` implementations for `list_tags`, `create_tag`, `update_tag`, `delete_tag`
- [ ] `delete_tag` triggers pending-confirmation (destructive)
- [ ] Catalog updated; capability `TagsRead` and `TagsWrite` now have non-empty `chatTools[]`

### Technical Notes

- Reuses existing MCP-side handlers for tag CRUD
- Confirms that tag autocreation in `AssignTagsTool` still works alongside explicit tag CRUD

### Dependencies

- Blocked by: none
- Blocks: #13, #14

---

## Story 11 — MCP: add chat-only managers (subscription, calendar sync, notifications, support, checklist templates)

**Type**: feature
**Repos**: backend
**Priority**: medium
**Complexity**: large
**Phase**: 3
**Parity required**: no

### User Story

As a Claude.ai user, I can manage my Orbit subscription, calendar sync, push notifications, send a support request, and manage checklist templates — all the things in-app chat can do.

### Acceptance Criteria

- [ ] New `[McpServerTool]` methods routed through `AgentOperationExecutor` for: `manage_subscription`, `manage_calendar_sync`, `manage_notifications`, `send_support_request`, `get_checklist_templates`, `create_checklist_template`, `delete_checklist_template`
- [ ] Each tool registered in catalog with matching capability already present (these capabilities currently have empty `mcpTools[]`)
- [ ] Integration tests sample one operation per tool

### Technical Notes

- All tools route through the executor (per #2 + #3 pattern)
- `manage_subscription` covers create_checkout / create_portal / claim_ad_reward sub-ops
- `manage_calendar_sync` covers set_auto_sync / dismiss_import / dismiss_suggestion / run_sync
- `manage_notifications` covers subscribe / unsubscribe / test_push (push subscription management)

### Dependencies

- Blocked by: #3
- Blocks: #13

---

## Story 12 — MCP: add high-risk managers (account lifecycle, API keys) with step-up

**Type**: feature
**Repos**: backend
**Priority**: medium
**Complexity**: medium
**Phase**: 3
**Parity required**: no

### User Story

As a Claude.ai user, I can request account deletion or rotate API keys via MCP, gated by step-up auth, so destructive operations are safe.

### Acceptance Criteria

- [ ] New `[McpServerTool]` methods for `manage_account` (reset / request_deletion / confirm_deletion) and `manage_api_keys` + `get_api_keys`
- [ ] All four operations classified `AgentRiskClass.High` with `AgentConfirmationRequirement.StepUp` in catalog
- [ ] Integration test: a step-up flow against `manage_account.request_deletion` from MCP works end-to-end
- [ ] Integration test: an API key with read-only credential cannot use these tools at all

### Technical Notes

- Separated from #11 because of step-up — these have stricter safety requirements
- Email-based step-up code applies (existing `AgentStepUpService`)
- `manage_api_keys` itself is API-key-management; the AI cannot use it from an API-key credential — only from JWT (existing scope check applies)

### Dependencies

- Blocked by: #3
- Blocks: #13

---

## Story 13 — Capability-parity test (chat ↔ MCP)

**Type**: tech
**Repos**: backend
**Priority**: medium
**Complexity**: small
**Phase**: 3
**Parity required**: no

### User Story

As the owner, an automated test prevents new capabilities from landing on only one AI surface, locking in the parity gains from this PRD.

### Acceptance Criteria

- [ ] Unit test enumerates every `AgentCapability` in `AgentCatalogService`
- [ ] For each, asserts: if `chatTools[]` is non-empty then `mcpTools[]` is non-empty (and vice versa) UNLESS the capability is in an explicit exemption list
- [ ] Exemption list documented with rationale (e.g., direct-flow auth operations, surface-specific tools)
- [ ] Test fails clearly when a new capability is added on only one surface

### Technical Notes

- Lives in `tests/Orbit.Infrastructure.Tests/Mcp/` or `Application.Tests/Chat/`
- Exemption list as a `static readonly HashSet<string>` of capability IDs

### Dependencies

- Blocked by: #8, #9, #10, #11, #12 (otherwise the test would fail on the gaps this PRD closes)
- Blocks: none

---

## Story 14 — UI rendering for new chat tool responses (web + mobile)

**Type**: feature
**Repos**: frontend
**Priority**: medium
**Complexity**: medium
**Phase**: 3
**Parity required**: yes

### User Story

As an in-app chat user on web or mobile, when the AI uses a new tool, the response renders correctly without raw JSON or broken cards.

### Acceptance Criteria

- [ ] Web: every new chat tool from #8/#9/#10 renders an appropriate tool-call card or text response
- [ ] Mobile: same, with identical behavior
- [ ] Smoke test: trigger each new tool from chat on both platforms; observe no rendering bugs
- [ ] Cards for destructive ops (e.g., `bulk_delete_habits`) show pending-confirmation UX

### Technical Notes

- May not need much new code if existing tool-call card patterns generalize — confirm during `/plan`
- Parity-required: `apps/web/components/chat/...` and `apps/mobile/components/chat/...` must match

### Dependencies

- Blocked by: #8, #9, #10
- Blocks: none

---

## Story 15 — Author feature-explanation markdown bundle (8 topics)

**Type**: tech
**Repos**: backend
**Priority**: high
**Complexity**: medium
**Phase**: 4
**Parity required**: no

### User Story

As any user, when I ask the AI "how do streaks work" (or freezes, frequencies, gamification, paygate, schedule, notifications, AI memory), I get a concrete and accurate explanation grounded in the actual code.

### Acceptance Criteria

- [ ] 8 markdown files in `orbit-api/src/Orbit.Application/Chat/Content/FeatureExplanations/`: `streaks.md`, `frequencies.md`, `gamification.md`, `paygate.md`, `schedule-math.md`, `freezes.md`, `notifications.md`, `ai-memory.md`
- [ ] Each file has YAML frontmatter: `key`, `display_name`, `related_capabilities`, `related_surfaces`, `version`, `derived_from` (source file:line range)
- [ ] Content accurately reflects code behavior in `UserStreakService`, `HabitScheduleService`, gamification rules, PayGate logic, notification scheduler

### Technical Notes

- Claude authors this story (per OQ#4 resolution): reads each referenced service, extracts the rules, writes the explanation
- Pure content; no .cs code changes in this story
- Files copied into the API binary via project file `<EmbeddedResource>` so they ship with the deployment

### Dependencies

- Blocked by: none
- Blocks: #16

---

## Story 16 — Implement describe_feature tool + system-prompt trim

**Type**: feature
**Repos**: backend
**Priority**: high
**Complexity**: medium
**Phase**: 4
**Parity required**: no

### User Story

As a user, my chat AI (and Claude.ai via MCP) can answer "how does X work" by calling a tool that returns curated explanation content — no more hallucinated rules.

### Acceptance Criteria

- [ ] New `DescribeFeatureTool` implementing `IAiTool` and `[McpServerTool]` (both surfaces)
- [ ] Tool accepts `feature_key` enum and returns the matching markdown + metadata
- [ ] Unit test enumerates the enum and asserts a matching file exists with valid frontmatter
- [ ] Drift test: snapshots key constants from referenced services (e.g., max freezes, XP table) and fails if they change without a content update
- [ ] System prompt trimmed — static rule descriptions removed, replaced with a pointer to `describe_feature`
- [ ] Prompt token count drops by at least 20% vs baseline (measure via existing token counter or a one-off snapshot)

### Technical Notes

- The drift test is the key safeguard: it reads a constant (e.g., `MaxFreezes`) and compares to a snapshot stored alongside the content file. Mismatch = fail with "content might be stale, please review".
- Catalog registration: `DescribeFeature` capability, `risk_class: Low`, no confirmation, scope: open

### Dependencies

- Blocked by: #15
- Blocks: #17

---

## Story 17 — UI: render describe_feature markdown responses

**Type**: feature
**Repos**: frontend
**Priority**: medium
**Complexity**: small
**Phase**: 4
**Parity required**: yes

### User Story

As a chat user on web or mobile, when the AI calls `describe_feature` and returns markdown, my chat shows the content beautifully rendered (not as raw text or JSON).

### Acceptance Criteria

- [ ] Web: `describe_feature` response renders as a markdown block in chat
- [ ] Mobile: same rendering and behavior
- [ ] Optional: a "related" footer linking to the relevant app surface (from `related_surfaces` metadata)

### Technical Notes

- Existing chat surface likely already renders markdown for assistant messages — confirm during `/plan`
- If markdown rendering exists, this story may be tiny

### Dependencies

- Blocked by: #16
- Blocks: none

---

## Story 18 — Extract chat composer to packages/shared, both apps consume

**Type**: tech
**Repos**: both
**Priority**: medium
**Complexity**: large
**Phase**: 5
**Parity required**: yes

### User Story

As the owner, chat composer logic lives in one file (`packages/shared/hooks/use-chat-composer-core.ts`), and any chat improvement touches one codebase instead of two.

### Acceptance Criteria

- [ ] New `packages/shared/hooks/use-chat-composer-core.ts` containing platform-agnostic state machine, history merging, validation, retry policy. No I/O.
- [ ] `apps/web/hooks/use-chat-composer.ts` is a thin wrapper that injects web-side I/O (Server Action)
- [ ] `apps/mobile/hooks/use-chat-composer.ts` is a thin wrapper that injects mobile-side I/O (`apiClient`)
- [ ] `apps/mobile/app/chat.tsx` is under 300 lines and contains only layout/consumption
- [ ] Smoke test passes: image upload, history paging, tool-call rendering, retry, error states — all identical to before on both platforms
- [ ] `packages/shared` exports the new hook from its index

### Technical Notes

- The hard part is teasing apart pure state logic from I/O — the core hook must not know about Server Actions or `apiClient`
- Inject the chat-send function as a parameter to the core hook
- Audit before splitting: confirm web's existing `use-chat-composer.ts` actually mirrors what mobile does today, since mobile is 1641 lines and web is hook-based — possible behavior differences exist

### Dependencies

- Blocked by: none
- Blocks: none

---

## Story 19 — Surface correlationId in ChatResponse + chat UI footer

**Type**: tech
**Repos**: both
**Priority**: low
**Complexity**: small
**Phase**: 5
**Parity required**: yes

### User Story

As a user filing a support request, my chat session has a visible correlation ID I can paste into the bug report.

### Acceptance Criteria

- [ ] Backend: `ChatResponse` DTO includes `correlationId` (already in audit context — just expose it)
- [ ] Web: chat session shows a small "trace: X" footer with copy-to-clipboard
- [ ] Mobile: same
- [ ] When `send_support_request` is triggered from chat, the request body includes the correlationId

### Technical Notes

- Existing executor request has `CorrelationId` — see `AgentExecuteOperationRequest.CorrelationId`
- Tiny shared type update if `ChatResponse` lives in `packages/shared`

### Dependencies

- Blocked by: none
- Blocks: none

---

## Story 20 — Replace hardcoded tool-ordering switch with declared attribute/graph

**Type**: tech
**Repos**: backend
**Priority**: low
**Complexity**: small
**Phase**: 5
**Parity required**: no

### User Story

As a future contributor, adding a new chat tool with an ordering requirement is a one-line attribute, not a hidden edit to `ProcessUserChatCommand.cs`.

### Acceptance Criteria

- [ ] Hardcoded switch (`ProcessUserChatCommand.cs` lines 264–270: `create_habit → create_sub_habit → assign_tags → everything else`) removed
- [ ] Replacement uses one of: `[ToolOrder(N)]` attribute on `IAiTool` implementation, OR a declared dependency graph (`MustRunAfter<T>`)
- [ ] Existing ordering preserved (no behavior change)
- [ ] Unit test confirms ordering for the existing trio (`create_habit`, `create_sub_habit`, `assign_tags`)

### Technical Notes

- Attribute approach is simpler; dependency-graph is more expressive but probably overkill for 3 tools
- Document the new mechanism in `Chat/Tools/README.md` (or top of the file)

### Dependencies

- Blocked by: none
- Blocks: none

---

## Notes on Cross-Repo Behavior

- Every backend story above is in `repo:backend` and creates a PR in `thomasluizon/orbit-api`. The GitHub issue still lives in `orbit-ui-mobile` (the single backlog).
- Stories #18, #19, and #22 are `repo:both` — they touch both repos in one coordinated change.
- Stories #14, #17, and #22 are `parity-required: yes` — both `apps/web` and `apps/mobile` updated.
- `Closes #N` keyword goes on the `orbit-ui-mobile` PR (or, for backend-only stories, on the `orbit-api` PR with cross-repo close: `Closes thomasluizon/orbit-ui-mobile#N`).

---

## Post-PRD Stories (Added 2026-05-18)

### Story 21 — AI silently creates one-time tasks when habit frequency isn't specified

**Type**: bug
**Repos**: backend
**Priority**: high
**Complexity**: small
**Phase**: post-PRD (AI quality)
**Parity required**: no

#### Context

User feedback: a friend created a habit ("Tomar café da manhã") via chat without specifying frequency. The AI silently created it as a one-time task that auto-completes on first log. Investigation root cause:

- `CreateHabitTool.cs:25-140` marks `frequency_unit` optional
- Tool description (line 22-23) tells the model "Omit for one-time tasks"
- `Habit.cs:183-186`: `if (FrequencyUnit is null) { IsCompleted = true; }` — habit vanishes after one log
- `StructuringStrategySection.cs:37-49` has no rule covering "no frequency mentioned"

#### User Story

As a chat user creating a habit without specifying frequency, the AI should ask me what schedule I want, instead of silently creating a one-time task that vanishes after I check it off.

#### Acceptance Criteria

- [ ] `CreateHabitTool.Description` tightened: omitting `frequency_unit` requires explicit one-time-task language
- [ ] New prompt rule in `StructuringStrategySection.cs`: ask before calling `create_habit` when user uses "habit"/"hábito" without a schedule
- [ ] Manual test (PT): "Crie o hábito de tomar café da manhã" → AI asks
- [ ] Manual test (EN): "Create a meditation habit" → AI asks
- [ ] Regression-safe: "Create a one-time task for Friday" still skips the question

#### Technical Notes

- Pure prompt engineering — `.cs` prompt files only
- Mirrors the pattern from recent Rule 18 hardening commits (`793758c`, `0e77c9c`, `e3cb864`, `dc63cfa`)
- Fix relies on model adherence; structural fix lives in Story 22

#### Dependencies

- Blocked by: none
- Blocks: none
- Sibling: Story 22 (structural follow-up)

---

### Story 22 — Add ActionStatus.NeedsClarification + chat UI question-card

**Type**: feature
**Repos**: both
**Priority**: high
**Complexity**: medium
**Phase**: post-PRD (AI quality)
**Parity required**: yes

#### Context

The breakfast-habit bug (Story 21) exposes a structural gap: the chat AI has no way to return "I need to ask the user a question" as a structured response. Today's statuses (`ProcessUserChatCommand.cs:47`) are Success / Failed / Suggestion (used only by suggest_breakdown) / PendingConfirmation (destructive ops). Adding a `NeedsClarification` status with a quick-action card makes the contract correct so the silent-default bug class can't recur.

#### User Story

As a chat user, when the AI needs to clarify my intent before executing a tool, it shows a structured question card with quick-action choices. My answer drives the next tool call automatically.

#### Acceptance Criteria

- [ ] New `ActionStatus.NeedsClarification` enum value
- [ ] Structured payload: `ClarificationRequest { Question, OperationId, PartialArguments, QuickActions: [{Label, Value, Description?}] }`
- [ ] `CreateHabitTool` returns NeedsClarification when frequency missing and title implies recurrence
- [ ] New `<ClarificationCard>` component (web + mobile, parity-required) mirroring `BreakdownSuggestion`
- [ ] Smoke test on both platforms: "Crie o hábito de meditar" → card with Daily/Weekly/etc → clicking "Daily" creates habit with correct args
- [ ] Unit + integration tests for the new status path
- [ ] System prompt updated so model knows when to expect clarification

#### Technical Notes

- Pattern: mirror existing `Suggestion` + `BreakdownSuggestion` infra
- Resume mechanism decision in `/plan`: synthetic message vs server-side pending state
- Parity-required: web + mobile components visually + behaviorally identical
- Future leverage: same pattern for delete-habit-when-multiple-match, bulk ops on ambiguous tag sets, etc.

#### Dependencies

- Blocked by: none (ships independently of Story 21, complementary)
- Blocks: none
- Sibling: Story 21

# Sweep #8 — API contract drift, issue #107 ROUND 5 (final verification)

Read-only verification. Method: cross-checked every `packages/shared/src/api/endpoints.ts` constant against the matching `orbit-api` `Controllers/*.cs` route, both directions. Baselines: ui-mobile `3520d10`, orbit-api `fcfdc95`. Round-3 report + round-4-deferrals (DEF-R4-1) read first.

## No contract surface changed since round-3 — round-3 ZERO carries forward

- **`endpoints.ts` is byte-identical to the round-3 baseline.** `git diff 6399d00 3520d10 -- packages/shared/src/api/endpoints.ts` is EMPTY. No client constant added, removed, or repathed.
- **No controller routes changed.** `git diff --name-only dec5bcc fcfdc95 -- src/Orbit.Api/Controllers/` is EMPTY — the round-4 API commit touched only `Orbit.Application` command/tool files + tests, no `[Http*]` route edits.

Because both sides of the contract are unchanged from round-3 (which passed a full bidirectional scan with ZERO FINDINGS), the contract verdict is unchanged. Spot-re-verified the previously-resolved D-fixes still hold: notifications `pushToken` absent; config `settings = { syncIntervalSeconds, syncMaxBatchSize }`; habitScheduleChild `flexibleTarget`/`flexibleCompleted`/`isLoggedInRange`; `sync.changesV2`/`sync.batch` only (no v1 `changes` client constant); `habits.logs(id)` + `profile.tour` PUT/DELETE; `profile.name` PUT (#171). `chat.stream = '/api/chat/stream'` (`endpoints.ts:107`) matches the streaming controller route — the documented chat-stream send used by the round-4-split `useChatComposer`.

## DEF-R4-1 — v1 sync route KEPT (NOT drift, per binding deferral)

The v1 `SyncController.GetChanges` (`[HttpGet("changes")]`, `SyncController.cs:144`) and v2 `[HttpGet("v2/changes")]` (`:226`) are BOTH present server-side. The agent catalog still references it: `AgentCatalogService.cs:1234` lists `"SyncController.GetChanges"`. Per DEF-R4-1 this is a deliberate keep for old-app backward-compat (additive deprecation); no client constant points at v1, so it is not endpoints.ts↔controller drift. **NOT a finding** (binding register).

## Full bidirectional re-scan — clean

Every constant in `endpoints.ts` resolves to a live controller route; every client-facing controller route has a constant. Controller-only routes intentionally absent from `endpoints.ts` (server-to-server / MCP-only, not a client contract surface): `subscriptions/webhook`, `subscriptions/play/rtdn` (Stripe/Play callbacks), `referrals/code` + `referrals/stats` (MCP/server-side; only `referrals/dashboard` is client-facing), and the v1 `sync/changes` (DEF-R4-1). endpoints.ts being a strict subset of routes is allowed — not drift. Failure envelopes (`{ error, errorCode }`) remain un-Zod-wrapped — per guidance, NOT drift.

The round-4 N+1 batching (AssignTagsTool/CreateHabitTool/BulkDeleteUserFacts) and SkipHabit filtered-include changes are internal handler refactors — no DTO/route shape changed, so no client-type drift.

## Verdict

**ZERO FINDINGS.**

`endpoints.ts` unchanged since round-3; no controller route changed in `fcfdc95`. The round-3 full bidirectional endpoints↔controllers scan (ZERO drift) carries forward unaltered. The v1 `SyncController.GetChanges` route survives by design (DEF-R4-1) with its agent-catalog reference intact — a deliberate backward-compat keep, not drift.

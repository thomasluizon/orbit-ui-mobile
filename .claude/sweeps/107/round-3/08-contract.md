# Sweep 8 — API contract drift (ROUND 3, verification)

Read-only verification pass. Method: cross-checked every `packages/shared/src/api/endpoints.ts` constant against the matching `orbit-api` `Controllers/*.cs` route, in BOTH directions (every client constant → a real route; every controller route → either a constant or a documented server-only/MCP-only exception). Baselines: ui-mobile 6399d00, api dec5bcc. Round-2 report + round-3 guidance read first.

## Round-2 fixes verified RESOLVED (do not re-report)

- **D1 — notifications `pushToken` deleted.** `NotificationController` exposes only `read`, `read-all`, `{id}` delete, `all`, `subscribe`, `unsubscribe`, `test-push`; no `push-token` route. endpoints.ts `notifications.*` matches exactly. (The `pushToken` token in `SubscriptionController.cs:17,143` is `IPlayPushTokenValidator` for Play RTDN auth — unrelated false positive.) RESOLVED.
- **D2 — config settings shape.** `ConfigController.GetConfig` returns `settings = new { syncIntervalSeconds = 300, syncMaxBatchSize = 100 }`; `appConfigSchema.settings` matches. RESOLVED.
- **D3 — habitScheduleChild fields.** `flexibleTarget`/`flexibleCompleted`/`isLoggedInRange` present in `GetCalendarMonthQuery.cs` + `GetHabitScheduleQuery.cs`. RESOLVED.
- **D4 — legacy v1 sync schema deleted.** endpoints.ts has only `sync.changesV2 = '/api/sync/v2/changes'` and `sync.batch`; no v1 `changes` constant. No client references the v1 path. RESOLVED (see note below re: the surviving v1 *controller* route).
- **D5 — `habits.logs(id)` present; `profile.tour` covers PUT+DELETE.** `HabitsController` has `{id:guid}/logs` (GET, line 434); `ProfileController` has `PUT tour` (191) + `DELETE tour` (202). Both constants present. RESOLVED.
- **Round-2 LOW — dead `GET /api/habits/logs` (GetAllLogs).** RESOLVED. The controller action is deleted; `HabitsController` has no all-logs `[HttpGet]`. `GetAllHabitLogsQuery`/`Validator` are retained but referenced only by `Mcp/Tools/HabitTools.cs` (per guidance: KEPT for MCP, not drift). endpoints.ts correctly has no `allLogs` constant. No residual.

## Full bidirectional re-scan (all families clean)

Every constant in endpoints.ts resolves to a live controller route; every client-facing controller route has a constant. Controller-only routes that are intentionally NOT in endpoints.ts (server-to-server or MCP-only, never called by web/mobile, so not a contract surface): `subscriptions/webhook`, `subscriptions/play/rtdn` (Stripe/Play callbacks); `referrals/code` + `referrals/stats` (MCP/server-side; only `referrals/dashboard` is client-facing). These are not drift — endpoints.ts is allowed to be a strict subset of routes.

Spot-verified families: auth, profile (incl. new `name` PUT from #171, line 61), habits, goals, tags, notifications, subscription (incl. `ad-reward`, `play/verify`), gamification, chat, ai (all 9 routes), userFacts, calendar, support, referral, apiKeys, config, sync, checklistTemplates. All match.

Failure envelopes (`{ error, errorCode }`) remain un-Zod-wrapped — per guidance, NOT drift.

## Notes (not contract-drift findings)

- The v1 sync **controller** route `SyncController.GetChanges` (`[HttpGet("changes")]`, line 144) still exists server-side, even though its Zod schema and client constant were removed (D4). No client calls it (endpoints.ts has no `sync.changes`), so it is not contract drift between endpoints.ts and the controllers. It is a dead/unused server endpoint — a rule-2 server-cleanup concern owned by the API-side dead-code sweep, not sweep #8. Flagged here only for visibility; out of this sweep's scope.

## Verdict

ZERO FINDINGS

(All 5 round-2 D-fixes preserved; the 1 round-2 LOW resolved. Full bidirectional endpoints↔controllers scan clean — no new drift. One out-of-scope note: a dead v1 sync *controller* route survives but has no client contract pointing at it.)

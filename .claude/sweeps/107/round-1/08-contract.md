# Sweep 8 — API contract drift (round 1)

Scope: every endpoint family in packages/shared/src/api/endpoints.ts cross-checked against orbit-api Controllers + DTO shapes; all Zod schema fields diffed against serialized C# response shapes.

## Findings

- HIGH · packages/shared/src/api/endpoints.ts `API.notifications.pushToken` ('/api/notifications/push-token') ↔ NO controller action anywhere · PATH_DRIFT: constant points at a nonexistent route · Fix: implement POST /api/notifications/push-token in NotificationController OR delete the constant if web-push `subscribe` superseded it (check app usage first).
- HIGH · packages/shared/src/types/config.ts `appConfigSchema.settings` expects { colorSchemes, supportedLocales, weekStartDayOptions } ↔ ConfigController.GetConfig returns settings = { syncIntervalSeconds: 300, syncMaxBatchSize: 100 } · FIELD_DRIFT: completely different shape; `.parse()` at boundary would fail (DEFAULT_CONFIG fallback masks it) · Fix: decide canonical side and align.
- MED · packages/shared/src/types/habit.ts `habitScheduleChildSchema` missing flexibleTarget / flexibleCompleted / isLoggedInRange ↔ C# HabitScheduleChildItem returns all three · Fix side shared: add the three fields.
- MED · packages/shared/src/types/sync.ts legacy `syncChangesResponseSchema` (v1) `deleted: z.array(z.string())` ↔ C# SyncEntitySet.Deleted = IReadOnlyList<SyncDeletedRef> { id, deletedAtUtc } · v1 schema stale (v2 correct) · Fix side shared: use syncDeletedRefSchema like v2 (or delete v1 if unused).
- LOW · DELETE /api/profile/tour (ProfileController.ResetTour) has no endpoint constant · Fix: add API.profile.resetTour (check whether apps reach it via hardcoded path today).
- LOW · GET /api/habits/logs (GetAllLogs) + GET /api/habits/{id}/logs (GetLogs) have no endpoint constants · Fix: add API.habits constants (check app callsites).

## Verified non-drift exceptions (server-to-server / protocol / internal)

- POST /api/subscriptions/webhook (Stripe), POST /api/subscriptions/play/rtdn (Play RTDN)
- /.well-known/oauth-* + /oauth/* family (MCP OAuth PKCE flow)
- POST /api/auth/operations/* (agent-operation auth variants)
- GET /api/referrals/code, GET /api/referrals/stats (dashboard subsumes)

All other endpoint families (auth, profile, habits, goals, tags, notifications, subscription, gamification, chat, ai, userFacts, calendar, support, referral, apiKeys, config, sync, checklistTemplates): MATCH.

## Verdict

| Severity | Count |
|---|---|
| HIGH | 2 |
| MED | 2 |
| LOW | 2 |

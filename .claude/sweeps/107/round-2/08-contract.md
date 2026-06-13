# Sweep 8 — API contract drift (ROUND 2)

## Round-1 fixes verified FIXED
- D1 API.notifications.pushToken deleted ✓
- D2 appConfigSchema.settings = { syncIntervalSeconds, syncMaxBatchSize } matches ConfigController ✓
- D3 habitScheduleChildSchema has flexibleTarget/flexibleCompleted/isLoggedInRange ✓
- D4 legacy v1 syncChangesResponseSchema deleted (v2 only, uses syncDeletedRefSchema) ✓
- D5 API.habits.logs(id) added; API.profile.tour covers PUT+DELETE ✓
- profileSchema 32 ↔ ProfileResponse 32 fields MATCH; habitMetrics MATCH (no streakBucket drift); notification/sync/all controller families MATCH.
- Error-shape: failure envelopes `{ error, errorCode }` not wrapped by any Zod success schema → no schema drift.

## Remaining
- LOW · endpoints.ts has no constant for `GET /api/habits/logs` (HabitsController.GetAllLogs, returns Dictionary<Guid,List<HabitLogResponse>>) · no app callers found · Fix: either add `API.habits.allLogs` OR delete the unused controller action (rule 2). → triage: likely DELETE the dead endpoint.

## Verdict
HIGH 0 · MED 0 · LOW 1

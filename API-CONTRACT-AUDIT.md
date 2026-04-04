# API Contract Audit

Audit date: 2026-04-04
Backend: `orbit-api` (.NET 10)
Frontend: `orbit-ui-mobile/apps/web` (Next.js 15)

---

## Issues Fixed

### 1. Wrong endpoint paths: bulk log and bulk skip (CRITICAL)

**Files changed:**
- `apps/web/app/actions/habits.ts` lines 94, 101
- `packages/shared/src/api/endpoints.ts` lines 47-48

**Problem:** The frontend called `/api/habits/bulk-log` and `/api/habits/bulk-skip`, but the backend
routes these as `POST /api/habits/bulk/log` and `POST /api/habits/bulk/skip` (with a forward slash,
not a hyphen).

Backend (`HabitsController.cs` lines 496, 519):
```
[HttpPost("bulk/log")]
[HttpPost("bulk/skip")]
```

Frontend before fix:
```ts
authFetch('/api/habits/bulk-log', ...)
authFetch('/api/habits/bulk-skip', ...)
```

These calls returned 404 on every invocation.

**Fix:** Updated both `authFetch` call paths in `habits.ts` and both `bulkLog`/`bulkSkip` constants
in `endpoints.ts` to use `/api/habits/bulk/log` and `/api/habits/bulk/skip`.

---

### 2. Wrong endpoint: linkGoalsToHabit uses the update endpoint (CRITICAL)

**File changed:** `apps/web/app/actions/habits.ts` lines 150-158

**Problem:** `linkGoalsToHabit` sent `PUT /api/habits/{habitId}` with body `{ goalIds }`. That is
the general habit update endpoint (`UpdateHabitRequest`), which requires `title`, `isBadHabit`, and
other fields. The backend would reject the request with a 400 because required fields are missing.

The correct backend endpoint for linking goals to a habit is:
```
PUT /api/habits/{habitId}/goals   body: { goalIds: [...] }
```
This is defined in `HabitsController.cs` lines 632-648 with `LinkGoalsRequest(List<Guid> GoalIds)`.

**Fix:** Changed the path from `` `/api/habits/${habitId}` `` to `` `/api/habits/${habitId}/goals` ``.

---

### 3. Push notification body shape mismatch (HIGH)

**File changed:** `apps/web/app/actions/notifications.ts` lines 45-56

**Problem:** `subscribePush` and `unsubscribePush` passed the raw `PushSubscriptionJSON` object
directly to the backend. The Web Push API's `PushSubscriptionJSON` has this shape:
```json
{ "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
```

The backend `SubscribeRequest` expects flat fields:
```csharp
record SubscribeRequest(string Endpoint, string P256dh, string Auth)
```
(from `NotificationController.cs` line 20)

System.Text.Json serializes `p256dh` and `auth` as camelCase, meaning the backend received
`{ "endpoint": "...", "keys": { ... } }` and could not bind `p256dh` or `auth`.

**Fix:** Destructured the `keys` object and sent the flat structure the backend expects:
```ts
body: JSON.stringify({
  endpoint: subscription.endpoint,
  p256dh: subscription.keys?.p256dh ?? '',
  auth: subscription.keys?.auth ?? '',
})
```

---

### 4. GoalMetrics.trackingStatus type mismatch (MEDIUM)

**File changed:** `packages/shared/src/types/goal.ts` line 43

**Problem:** The backend `GoalMetrics` record (`Orbit.Domain/Models/GoalMetrics.cs` line 8) declares
`string TrackingStatus` as a non-nullable `string`. The frontend `goalMetricsSchema` had:
```ts
trackingStatus: trackingStatusSchema.nullable()
```
A `.nullable()` schema rejects a non-null value during strict parse if the enum value is unexpected,
and signals to consumers that null is a valid state when the backend never sends null.

**Fix:** Changed to `z.string()` to faithfully reflect the backend contract. This also avoids a
parse failure if the backend adds a new tracking status value before the frontend type is updated.

---

### 5. Missing entries in shared endpoint constants (LOW)

**File changed:** `packages/shared/src/api/endpoints.ts`

**Problem:** Several backend endpoints existed with no matching constant in `API`:
- `GET /api/goals/review` -- no `API.goals.review` constant
- `POST /api/notifications/test-push` -- no `API.notifications.testPush` constant
- `GET /api/gamification/achievements` -- no `API.gamification.achievements` constant
- `PUT /api/habits/{id}/goals` -- no `API.habits.goals` constant

**Fix:** Added all four missing constants so they can be consumed without hardcoding paths:
```ts
goals: { ..., review: '/api/goals/review' }
notifications: { ..., testPush: '/api/notifications/test-push' }
gamification: { ..., achievements: '/api/gamification/achievements' }
habits: { ..., goals: (id) => `/api/habits/${id}/goals` }
```

---

## Orphaned Backend Endpoints (no frontend consumer)

These backend endpoints are implemented and correct but are not currently called by the web frontend.
They are not bugs -- they may be consumed by the mobile app, or be intentionally reserved for future use.

| Backend Route | Controller | Notes |
|---|---|---|
| `GET /api/goals/review` | `GoalsController.GetGoalReview` | AI goal review; endpoint constant now added |
| `POST /api/notifications/test-push` | `NotificationController.TestPush` | Dev/debug tool; constant now added |
| `GET /api/gamification/achievements` | `GamificationController.GetAchievements` | Profile endpoint already embeds achievements; standalone consumer not present |

---

## Verified Correct (no changes needed)

The following were audited and found to be correct:

| Area | What was checked |
|---|---|
| All HTTP methods | POST/PUT/DELETE/GET match between frontend and backend for all endpoints |
| Proxy allowlist | `app/api/[...path]/route.ts` includes all needed prefixes (`habits/`, `goals/`, `tags/`, `notifications/`, `gamification/`, `chat/`, `profile/`, `referrals/`, `subscriptions/`, `config/`, `api-keys/`, `checklist-templates/`, `sync/`, `user-facts/`, `support/`, `calendar/`, `auth/`) |
| HabitScheduleItem fields | Backend DTO matches frontend `habitScheduleItemSchema` (all fields present including `flexibleTarget`, `flexibleCompleted`, `linkedGoals`, `instances`) |
| HabitScheduleChildItem fields | Backend includes `flexibleTarget`, `flexibleCompleted`, `isLoggedInRange` -- all present in frontend `habitScheduleChildSchema` |
| HabitInstanceItem fields | Backend `(Date, Status, LogId, Note)` maps to frontend `{ date, status, logId, note }` correctly |
| HabitDetailResponse | Backend `GET /api/habits/{id}` fields match frontend `habitDetailSchema` |
| HabitFullDetailResponse | Backend `GET /api/habits/{id}/detail` wraps `{ habit, metrics, logs }` matching frontend `habitFullDetailSchema` |
| GoalDto fields | Backend fields match frontend `goalSchema` |
| GoalStatus enum | Backend `Active | Completed | Abandoned` matches frontend `goalStatusSchema` |
| GoalDetailDto | Backend fields match frontend `goalDetailSchema` |
| GoalDetailWithMetrics | Backend `GoalDetailWithMetricsResponse(Goal, Metrics)` matches frontend `goalDetailWithMetricsSchema` |
| ProfileResponse | All 26 backend fields match frontend `profileSchema` field-for-field |
| NotificationItemDto | Backend `(Id, Title, Body, Url, HabitId, IsRead, CreatedAtUtc)` matches frontend `notificationItemSchema` |
| GetNotificationsResponse | `{ items, unreadCount }` matches frontend `notificationsResponseSchema` |
| GoalMetrics fields | All six fields (`progressPercentage`, `velocityPerDay`, `projectedCompletionDate`, `daysToDeadline`, `trackingStatus`, `habitAdherence`) match |
| GamificationProfileResponse | All 13 fields match frontend `gamificationProfileSchema` |
| StreakInfoResponse | All 8 fields match frontend `streakInfoSchema` |
| TagsController routes | GET/POST/PUT/DELETE and assign route all match frontend `tags.ts` action |
| BulkDeleteRequest body | Frontend sends `{ habitIds: [...] }` matching backend `BulkDeleteHabitsRequest(IReadOnlyList<Guid> HabitIds)` |
| AssignTagsRequest | Frontend sends `{ tagIds: [...] }` matching backend `AssignTagsRequest(IReadOnlyList<Guid> TagIds)` |
| LinkHabitsRequest | Frontend sends `{ habitIds: [...] }` matching backend `LinkHabitsRequest(List<Guid> HabitIds)` |
| ReorderGoalsRequest | Frontend sends `{ positions: [{id, position}] }` matching backend `ReorderGoalsRequest(IReadOnlyList<GoalPositionRequest>)` where `GoalPositionRequest(Guid Id, int Position)` |
| ChatController | Multipart form-data with `message`, `history`, `image` fields matches backend `[FromForm]` parameters |
| AuthController routes | All auth routes (send-code, verify-code, google, refresh, logout, request-deletion, confirm-deletion) match |
| HabitLog type | Backend `HabitLogResponse(Id, Date, Value, Note, CreatedAtUtc)` matches frontend `habitLogSchema` |

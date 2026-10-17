# Goal forecast surfaces

**At a glance:** reachable goal forecast owners, producer boundaries, mirrored states and verification.

## Surface inventory

| Surface | Web owner | Android owner |
|---|---|---|
| Goal detail opened from Progresso | `apps/web/app/(app)/progress/_components/progress-content.tsx` through `GoalDetailDrawer` inline | `apps/mobile/components/progress/progress-content.tsx` through `GoalDetailDrawer` inline |
| Goal detail opened from an Astra goal card | `apps/web/components/chat/conversation.tsx` through `GoalDetailDrawer` in a sheet | `apps/mobile/components/chat/conversation.tsx` through `GoalDetailDrawer` in a sheet |
| Forecast figures | `apps/web/components/goals/goal-metrics-panel.tsx` | `apps/mobile/components/goals/goal-metrics-panel.tsx` |

Both detail presentations share the same panel. The progress heading and ring remain the focal element;
forecast figures use plain label and value rows, with no card chrome or additional actions.

## Producer boundary

The existing goal detail query owns the metrics request. Both clients read its deadline days, daily
velocity, projected completion and weekly linked-habit adherence. Deadline days preserve zero and
negative values. A null deadline shows the no-deadline label. Nonpositive velocity and null projection
show the no-data label. The producer does not supply required daily progress, so no client estimate is
presented as a supplied metric.

## State coverage

- Standard and streak goals expose the same supplied forecast figures.
- Loading uses one labelled busy skeleton for the forecast rows.
- A failed detail request retains the existing retry action. List-cache fallback does not fabricate metrics.
- Closed detail disables its query through the existing null goal identifier and exposes no forecast.
- Empty adherence omits the weekly rate; supplied rates join their linked-habit rows.
- Linked-habit rows keep navigation, streak values and the full-title destination below the forecast.
- Both locales and theme token variants share the same content and structure.

## Verification owners

The drawer Vitest files on both platforms mount the owning composition and cover populated forecasts,
missing figures, deadline boundaries, loading, failed fetch and retry recovery. Existing drawer tests
cover closed detail, derived progress restrictions and linked-habit navigation. Rendered browser and
device inspection remain outside this verification scope.

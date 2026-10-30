# Empty-state surfaces

> **At a glance** - shared empty-state consumers, Astra thread composition and completed-day action spacing on web and Android.

The shared `EmptyState` uses one 48px identity carrier, a required title and at most one
caller-supplied action. The mark, title, action and optional disclosure share a 24px stack,
24px inline padding and symmetric 48px block padding. The mark stays neutral.

Paths below are relative to each platform's `components/` directory unless stated otherwise.

| Surface | Web owner | Android owner | Retained content |
|---|---|---|---|
| Empty Astra thread | `chat/chat-empty-state.tsx` | `chat/chat-empty-state.tsx` | Astra mark, title, one ghost browse action and disclosure |
| Empty calendar import and review | `calendar-sync/calendar-import-content.tsx` | `calendar-sync/calendar-import-content.tsx` | Orbit mark, mode-specific title and back action |
| Empty goal list | `app/(app)/progress/_components/progress-content.tsx` | `progress/progress-content.tsx` | Orbit mark, title and create action |
| Empty progress window | Same progress owner | Same progress owner | Orbit mark, title and habit entry |
| Empty achievements | Same progress owner | Same progress owner | Orbit mark, title and habit entry |
| Empty linked-habit picker | `goals/goal-habits-field.tsx` | `goals/goal-habits-field.tsx` | Orbit mark, title and create action |
| Linked-habit search miss | Same picker owner | Same picker owner | Orbit mark, query-miss title and close action |
| Empty share card | `share/share-card-sheet.tsx` | `share/share-card-sheet.tsx` | Orbit mark and existing title |

Astra centres the visible mark-to-disclosure group within the thread above the complete
composer block, including its live chips and any notices. The web empty owner itself carries
the 708px inner-column cap and full thread minimum height. Android's existing ShellContent
keeps its growing allocation and its ScrollView keeps symmetric 16px thread insets. The
disclosure follows the action within the shared component, so its 48px outer padding no longer
separates those two elements. Short threads scroll without clipping either end.

Hoje's `HabitListAllDone` pairs title and hint with 8px and separates that text block from
its optional See tomorrow pill by 24px. Web owns it in `habits/habit-list/empty-state.tsx`;
Android owns it in `habit-list/empty-state.tsx`. Both retain the same navigation callback.

Web `chat-empty-state-geometry.test.tsx` mounts the conversation owner and measures the
visible group's centre, 48px mark and 24px disclosure gap, including compact, foldable and
740px desktop columns in both locales. `habit-list-all-done-geometry.test.tsx` measures the
8px text pairing and 24px action clearance. Shared primitive geometry and behaviour tests
retain title fit, both identity carriers and the single supplied action.

Android `astra-full-screen-geometry.test.tsx` mounts Shell412 with the conversation, measures
the group against its thread and checks the mark size. The habit-list empty-state test measures
both completion gaps and invokes the retained action. Feedback primitive tests check both
48px identity carriers and the supplied action. These are style and Yoga checks, not device
rendering evidence.

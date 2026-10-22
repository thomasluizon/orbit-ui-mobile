# Create goal surfaces

**At a glance:** the direct goal creation entries and form states, mirrored on web and Android.

| Surface | Owners on both platforms | Coverage |
| --- | --- | --- |
| Progresso without progress | `progress-content`, page invitation | Opens the shared create sheet and retains Astra drafts |
| Progresso with an empty Metas section | `progress-content`, section invitation | Opens the shared create sheet; save replaces the invitation with the goal |
| Progresso with goals | `progress-content`, Metas action | Opens the same sheet; new goals remain visible through the all-goals filter |
| Habit create and edit | `goal-linking-field` | Empty and populated goal pickers open the same sheet; creation selects the new goal |
| Habit detail | `habit-detail-screen`, `edit-habit-modal`, `goal-linking-field` | The pencil opens the full editor, whose goal picker seeds the current habit; read facts open linked goals |
| Create goal sheet | `goals/create-goal-sheet` | Title, type, target, unit, optional deadline, linked habits; validation, pending, failed save, dismissal and discard |
| Linked habit picker | `goals/goal-habits-field` | Loading, failure and retry, habit creation and return with the goal draft retained, selection, capacity, long lists and search |

The shell create action creates habits directly. There is no separate create menu or goal item to reroute.
Astra conversation suggestion chips and accepted goal proposals retain their conversational flow.
The create sheet and linked habit picker explain how selected habits to avoid affect progress:
Streak goals count avoided days; Standard goals count logged slips. Changing type updates the note
while preserving the selected habits.
Habit edit and detail seed the current habit; successful creation selects its goal without a second write.
The existing create form is reused across these entries; editing remains the second form implementation.
The sheet primitive owns padding, scrolling, dismissal and focus. The footer keeps trailing ghost Cancelar
and the filled create action outside the scrolling body.

Visual inspection of the app and rendered screenshots require a separate runner. The worker uses
Vitest compositions and the existing geometry suites without starting an app server or emulator.

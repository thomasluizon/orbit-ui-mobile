# Create goal surfaces

**At a glance:** the direct goal creation entries and form states, mirrored on web and Android.

| Surface | Owners on both platforms | Coverage |
| --- | --- | --- |
| Progresso without progress | `progress-content`, page invitation | Opens the shared create sheet and retains Orbit drafts |
| Progresso with an empty Metas section | `progress-content`, section invitation | Opens the shared create sheet; save replaces the invitation with the goal |
| Progresso with goals | `progress-content`, Metas action | Opens the same sheet; new goals remain visible through the all-goals filter |
| Habit create and edit | `goal-linking-field` | Empty and populated goal pickers open the same sheet; creation selects the new goal |
| Habit detail | `habit-detail-screen`, `edit-habit-modal`, `goal-linking-field` | The pencil opens the full editor, whose goal picker seeds the current habit; read facts open linked goals |
| Create goal sheet | `goals/create-goal-sheet` | Type, title, target, unit, optional deadline, linked habits; validation, pending, failed save, dismissal and discard |
| Linked habit picker | `goals/goal-habits-field` | Loading, failure and retry, habit creation and return with the goal draft retained, selection, capacity, long lists and search |

The sheet asks How do you want to track it? first and What do you want to reach? second, so the
goal text placeholder always follows a visible type. A type choice, the goal text, a saved target,
unit or deadline, or a submit attempt reveals the target and deadline questions; they stay revealed and keep their
values if the title is cleared. Linked habits stay visible for every entry. Add deadline is a visible
field row. Edit goal and progress entry use the same question labels.

The shell create action creates habits directly. There is no separate create menu or goal item to reroute.
Orbit conversation suggestion chips and accepted goal proposals retain their conversational flow.
The create sheet and linked habit picker explain how selected habits to avoid affect progress:
Streak goals count avoided days; Standard goals count logged slips. Changing type updates the note
while preserving the selected habits.
Habit edit and detail seed the current habit; successful creation selects its goal without a second write.
The existing create form is reused across these entries; editing remains the second form implementation.
The sheet primitive owns padding, scrolling, dismissal and focus. The footer keeps trailing ghost Cancelar
and the filled create action outside the scrolling body.

## Guided goal flows (#2121)

With `orbit_guided_flows` on, `CreateGoalSheet` and `EditGoalModal` render the guided flow from
`components/goals/guided/` in `FlowScreen` on both platforms. With the flag off, they render the sheet
and the modal above, unchanged. The draft stays in `useGoalCreation`, so the create request equals the
request of the sheet for the same values. Edit sends the same update request as the modal.

| Step | Question | Quick options | Free path |
| --- | --- | --- | --- |
| What | O que você quer alcançar? | none | one text field, 200 characters |
| How to track | Como você quer acompanhar? | Progresso, Sequência | none |
| How much | Quanto? and De quê?; for a streak, Quantos dias seguidos? | none | the number and the unit, or the number of days |
| By when | Até quando? | Sem prazo, Fim do mês, Fim do ano | the person's words through `parseDatePhrase`, and the date picker |
| Which habits | Quais hábitos contam para essa meta? | the person's habits | search, and create a habit from the step |
| Summary | É isso? | none | each value is a control that opens its step and returns |

Fim do mês and Fim do ano resolve in the account time zone through
`packages/shared/src/utils/goal-deadline-options.ts`. A goal that starts from a habit skips Which
habits and shows the habit on the summary. Edit opens on the summary with the stored values; an
unchanged edit closes with no discard prompt. A save error stays on the summary. A save ends in the
result dialog, whose sentence states the goal and its deadline, or that it has no deadline. Its filled
action opens the goal, and its ghost action starts another goal.

Visual inspection of the app and rendered screenshots require a separate runner. The worker uses
Vitest compositions and the existing geometry suites without starting an app server or emulator.

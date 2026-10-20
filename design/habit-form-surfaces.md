> **At a glance** - paired habit create/edit owners, type and date semantics, retained production controls and verification boundaries.

# Habit form surfaces

| Surface | Web and Android owner | Behavior |
|---|---|---|
| Create and edit composition | `components/habits/create-habit-modal.tsx`, `edit-habit-modal.tsx` | Required unseeded type, persisted edit prefill, inherited General locks, retained drafts and unsaved-change guard |
| Type | `habit-form-fields/habit-type-field.tsx` | Two vertical RadioRow choices before the focal title, visible validation and group focus |
| Date | `habit-form-fields/habit-date-field.tsx` | When input, type-specific question and editable date before More details; General hides only the date group |
| Schedule | `habit-form-fields/habit-schedule-fields.tsx` | Fixed, count-based and No schedule choices with a reachable return and tree locks |
| Date interpretation | Shared `date-phrase-parser.ts`, `date-interpretation-session.ts`, `habit-date-editor.ts`; app `use-date-interpretation.ts` | Local calendar arithmetic, explicit metered request, separate candidate, acceptance, stale rejection, direct transport and terminal allowance refresh |
| Type readback | `habit-row-content.tsx`, `habit-detail-screen.tsx` | Whole quiet vocabulary beneath the full-width title; original controls and counts retained |

All component paths above are relative to each app's `components/habits/` unless another owner is
named. Timezone context distinguishes unloaded from known null and valid cached profile values.
Explicit dates remain calendar strings. Recurring/flexible root writes carry startDate; tasks and
direct-child creation retain dueDate. General carries no date. End-date clearing carries clearEndDate.

## Production capability audit

The comparison sources are pre-promotion web `dfc321dc1^` and Android release source
`b84bdc9ed91d57b147c7a8f76980c89cfe7ebdae`. Both expose the same capability families.

| Baseline capability | Disposition in both mirrors |
|---|---|
| Four schedule handlers | Restored with explicit Task/Habit and three Habit schedule choices |
| Editable date | Restored outside details, with account-local default and distinct due/start semantics |
| Clear selected end date | Retained explicit clear control and clearEndDate update contract |
| Title and emoji, manual and suggested | Retained; explicit type cannot be overwritten by cadence-looking text or late suggestion |
| Fixed weekdays, quantity, unit and interval | Retained manual corrections and interval controls |
| Start and end time | Retained ordering validation and clear actions; unset wire times remain null or omitted |
| Relative offsets and absolute clock reminders | Retained separate editors, validation and request stores; General excludes both |
| Checklist editing, templates, ordering and clearing | Retained existing checklist and template owners |
| Sub-habits and inherited constraints | Retained editor, creation gates and General tree constraints |
| Tag selection, create, rename, delete and suggestions | Retained existing tag picker and suggestion adapters |
| Goal links | Retained existing goal picker and request handling |
| Avoidance and slip alerts | Retained for dated items; forbidden General combinations remain unavailable |
| Description | Retained labelled field and backend validation |
| Unsaved changes, create/edit and backend validation | Retained existing guards; added visible required-type and unresolved-date validation |
| Habit and tag color controls, carousel and connector styling | Intentionally retired; no color picker restoration |

No additional dropped field was found outside the type/date/end-date family. Flexible creation also
carries a selected end date through the same request owner. Optimistic native creation and both
edit caches preserve the edited start anchor, including queued native saves. Mode drafts retain date, cadence,
times, reminders and avoidance independently of shared title, description and checklist text.

## Verification boundary

Vitest mounts the actual forms and request builders on both platforms. Shared guards cover local
phrases, impossible and ambiguous dates, leap/month/year/DST boundaries, context revisions, duplicate
paid actions, null/error responses, manual confirmation and accepted proposals. Transport guards
cover the web Server Action and native direct client, including allowance refresh after failure and
account replacement. The existing web layout specs carry both locales, themes, compact and wide
widths, large text and proposal/validation states for the orchestrator's frozen build.

Whole-page rendering, keyboard and assistive technology inspection, Android font rendering and
production create/edit/readback remain separate verification boundaries. API production promotion
precedes consumer publication. Web production and Android open-track release are owned by the
orchestrator; no Android production release or version floor change is implied.

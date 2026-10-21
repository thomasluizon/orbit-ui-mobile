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
Converting a dated habit to a task clears its persisted end date explicitly before returning the
task request. Untouched dated end dates keep their value.

The date editor stays mounted while General hides its controls. Returning to a dated draft retains
its phrase and picker value, reconstructs local parse availability and requires manual confirmation
when its context changed. Unsupported wording keeps the explicit Astra recovery; impossible and
ambiguous dates do not offer it. Consultation ownership includes the semantic cadence unit,
quantity, sorted distinct weekdays and interval, in addition to mode and type. A changed cadence
retires both delayed responses and visible candidates without another consultation.

Only a date candidate receives DateField's proposed appearance, using resting fg-3 inside the
existing dashed perimeter. Acceptance and manual picking restore normal ink. Use date sits in
ActionRow at the trailing edge and hugs its label on both platforms.

A valid date proposal retires unresolved feedback and the paid consultation action with its cost
and capacity notices. It retains the phrase and the previously owned date until acceptance or
manual selection. Submit validates the current candidate explicitly, focuses the date input and
asks the person to use the suggestion or choose another date. Acceptance and manual selection,
including the same calendar day, clear confirmation feedback and permit saving the owned date.

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
| Sub-habits and inherited constraints | Retained editor and General tree constraints; creation is available on every plan |
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
Owning form guards cover General return across account-day, timezone, locale and account changes,
cadence changes during and after consultation, task conversion requests and actual DateField ink.
Web jsdom resolves the foreground token and ActionRow ownership; rendered RGB and candidate-state
phone/desktop width remain frozen-build measurements. Native guards inspect flattened value color
in both themes and intrinsic action alignment; these are not device font or TalkBack evidence.

Whole-page rendering, keyboard and assistive technology inspection, Android font rendering and
production create/edit/readback remain separate verification boundaries. API production promotion
precedes consumer publication. Web production and Android open-track release are owned by the
orchestrator; no Android production release or version floor change is implied.

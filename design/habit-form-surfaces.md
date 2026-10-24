> **At a glance** - paired habit create/edit owners, type and date semantics, retained production controls and verification boundaries.

# Habit form surfaces

| Surface | Web and Android owner | Behavior |
|---|---|---|
| Create and edit composition | `components/habits/create-habit-modal.tsx`, `edit-habit-modal.tsx` | Required unseeded type, persisted edit prefill, inherited General locks, retained drafts and unsaved-change guard |
| Name and description | `habit-form-fields.tsx`, `habit-form-fields/habit-understanding.tsx` | Standard 54px growing name, equal mirror/input metrics, then one full description before all conditional content (#1607) |
| Type | `habit-form-fields/habit-type-field.tsx` | Two vertical RadioRow choices before the focal title, visible validation and group focus |
| Date | `habit-form-fields/habit-date-field.tsx` | When input, type-specific question and editable date before More details; General hides only the date group |
| Schedule | `habit-form-fields/habit-schedule-fields.tsx` | Fixed, count-based and No schedule choices with a reachable return and tree locks |
| Date interpretation | Shared `date-phrase-parser.ts`, `date-interpretation-session.ts`, `habit-date-editor.ts`; app `use-date-interpretation.ts` | Local calendar arithmetic, explicit metered request, separate candidate, acceptance, stale rejection, direct transport and terminal allowance refresh |
| Recurrence intent | Shared `habit-recurrence-phrase.ts`, `habit-phrase-parser.ts`, `habit-date-editor.ts`, `habit-form-helpers.ts`; paired date/type fields and form hooks | Bilingual daily, weekly count and weekday wording writes the existing schedule for a deliberately selected dated Habit; Task retains its date and one inline recovery toward the existing Habit choice |
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

English and Portuguese repetition phrases share the title parser's daily, weekly count and weekday
vocabulary through a complete-phrase reader, independent of the interface language. Weekdays and
dias úteis select Monday through Friday. Weekly equivalents retain fixed Week 1. Counts select the
count-based schedule and retain the stated quantity. Safe case, accents, spacing and edge punctuation
normalization do not consume unknown trailing words. A local explicit start suffix updates the
calendar anchor; recurrence alone preserves the chosen date. Unresolved starts retain date recovery.
Only typing or deliberately choosing Habit can apply cadence. Sync, validation, remount and account
replacement cannot apply it. Manual scheduling releases title cadence ownership; returning between
mode drafts keeps later corrections. Title and onboarding parser behavior stays unchanged.
Task mismatch uses the input's single error region and focuses the real named type group on
blocked Submit; the valid Task selection is retained. Choosing a date or clearing the wording
clears the mismatch. A deliberate Habit choice resolves retained Task recurrence wording before an older
General draft can win, using the current Task date as its start date. An inherited General lock
keeps the child General, shows the existing parent mismatch guidance and blocks Submit. Manual
General decisions otherwise retain their draft without replaying recognition.

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

## Astra affordance inventory (#1607)

| Paired control | Callback owner | Disposition |
|---|---|---|
| Setup fallback | `createHabitFormController.askAstra` to `use-habit-suggestion` | Corrected mark with existing visible Astra label |
| Emoji suggestion | `useEmojiProposal` to `onSuggestEmoji` / `use-habit-suggestion` | Corrected mark and Ask Astra wording in persistent Emoji context; manual picker unchanged |
| Date consultation | `HabitDateEditor.ask` to `use-date-interpretation` | Corrected mark; explicit, budgeted and guarded request unchanged |
| Tag generation | `TagSuggestions` to `useTagSuggestions.suggest` / `useSuggestTags` | Corrected mark and Ask Astra wording under Tags; acceptance remains deterministic |
| Compact and habit-detail composer entry | `onOpenConversation` to conversation store | Corrected visible Astra name beside existing mark; opens without sending |
| Composer send, retry and live suggestions | `onSend`, `onRetry`, suggestion `onSelect` to chat send owner | Corrected mark and visible wording; current request and retry ownership retained |
| Habit and goal detail entries | `AskAstraRow`, `openAstra` to `prepareChatRequest` and conversation store | Corrected mark; draft preparation opens without sending |
| Habit-list empty entry | `onAskAstra` to conversation store | Corrected mark with existing label |
| Follow-up and proactive actions | `onSelect` / `useProactiveAction.act` to `sendMessage` | Corrected mark and visible Astra name in each specific action target |
| Complete prompt-library and deferred ideas | `selectIdea` to `sendMessage` | Corrected mark and visible Astra name |
| Slotted prompt ideas | `selectIdea` to `preparePromptTemplate` | Deterministic draft preparation; no invocation mark |
| Reschedule menu and retries | Sheet opening / `refetch` to `useRescheduleSuggestion` | Corrected invocation identification; existing eligibility and GET/refetch policy retained |
| Wide navigation and conversation header | Existing conversation store entry / AppBar | Already conforming, preserved |
| Today Astra line | Caller-defined destination | Existing mark and visible sentence retained; no speculative navigation change |
| Date, tag and reschedule acceptance, ordinary Save | Existing form and mutation owners | Deterministic, no generation label or new request |
| Voice record, stop, cancel and transcription | Existing speech-to-text and recording owners | Separate transport and recording states retained; no inferred generation affordance |
| Pending-operation approval and execution | Existing operation controllers | Deterministic approval boundary retained, no generation label |

The selected date is displayed and accessibly labelled by DateField once; the form retains real
Proposed, pending, error and manual recovery feedback. Empty feedback has no occupied field gap.
The phrase placeholder is guidance only and never a default value. No external response field,
model, budget, event, queue or transport changes are introduced. Historical spending decisions
remain unchanged. Direct skill, agent, playbook and hook references contain no active superseded
form-size or invocation rule requiring an edit; the owning contradictions are in DESIGN and canvas.

## Detail read and draft ownership

| Previous section or action | Final paired owner and boundary |
|---|---|
| Inline title rename and emoji picker | One named type-aware pencil opens `edit-habit-modal.tsx`; title/emoji are draft fields in `habit-form-fields.tsx` |
| Task/Habit, fixed/count/General, weekdays, quantity, interval and tree constraints | Existing complete editor and shared mode drafts; no inline schedule writer |
| Editable start/due date, local phrase, picker and explicit Astra proposal | Existing date editor; accepted proposals update the draft; Save owns persistence |
| Exact/end time, relative offsets and absolute/scheduled reminders | Existing form reminder owners; local until Save |
| End date and description clears | Full update carries clearEndDate and the explicit empty description |
| Stored description read/copy | Detail header renders selectable source prose and Copy description without a collapsed preview |
| Checklist completion, final-item log question and Uncheck all | One read checklist and existing immediate completion endpoint |
| Checklist text/add/remove/duplicate/reorder/clear | Full editor's real checklist; local stable identity and checked state; one outer Save |
| Checklist templates | Loading selects draft structure; explicit template saving remains independent management |
| Goal/tag associations | Editor selection draft; optional tagIds joins the ordinary update, without a subsequent assignment write |
| Tag create/edit/delete and new suggested tag | Existing explicit management; new suggestions open the tag editor before Add; Cancel only discards habit associations |
| Independent goal/habit creation and sub-habit management | Existing explicit creation; sub-habits are available on every plan and created objects are independent of outer Cancel |
| Avoidance and slip alert | Existing full form and actual plan/General constraints |
| Activity strip, statistics, reminder readout, cadence/end/started facts and month history | Retained read owners; More details holds secondary facts and full month navigation |
| Linked-goal navigation | Read facts open the existing goal detail owner; association editing uses the pencil |
| Contextual Astra and rescue | Existing contextual entry and independently accepted proposal; no automatic new paid request |
| Navigation and deletion | Existing detail header/back and confirmed deletion paths |
| Loading/error/offline | Existing detail reads; editor validation and persistent error; native supported queue and persistent sync notice |

The editor owns one isolated draft per account and habit. Unloaded untouched tags remain omitted;
explicit empty selections clear. Confirmed Save closes through the sheet lifecycle and refreshes the
read owner. Queued native Save closes as accepted work with Waiting to sync and the existing persistent
queue notice, without invoking the confirmed-save callback. Uncertain writes retain the draft and
request fresh readback without claiming rollback or confirmation. Repeated submission is blocked.
The dirty body names only the habit or task draft; submitted uncertainty uses its own approved copy.

Paired component tests mount detail, the actual full editor, form and checklist for the draft/write
boundary. Shared request/schema guards cover explicit clears and optional UUID tags. Native tests
retain focused text through moves and rollback, and preserve the existing queue/replay adapters.
Removed inline autosave owners have no remaining runtime caller. Their obsolete writer assertions
are replaced at the actual full editor boundary; form weekday focus and geometry remain with the
existing form owners. Changed rendered layout, modal focus, both locales/themes, phone/wide and
200% text require frozen-build verification. Native device/AT and real combined save/readback/refusal
remain separate acceptance; source tests do not establish deployment or server persistence.

## Parent relationship draft

The complete editor adds Parent habit / Hábito principal beside tags and goals inside the existing
More details disclosure. Type remains first; title, description and date keep their owners. The
field reuses ListRow and the existing move-parent radio sheet in selection-only mode. Closing that
picker retains the local choice; outer Cancel discards it. Only outer Save writes the relationship.
The active Create drawing's edit state shows this amendment without changing create behavior.

The parent baseline is an authoritative UUID, verified null, or unknown. A list may supply display
context but cannot override a detail read. Untouched, unknown and same-parent choices omit both
ordinary-update keys. A changed destination sends parentId; explicit root sends clearParent true.
The nullable request keys accept null as unchanged, and false also preserves clearParent. No
standalone parent, goal-link or tag-assignment request follows the ordinary update.

The shared move-parent owner composes scheduled and General account queries only after both have
completed every page successfully. Picker demand uses those existing query caches without day,
search, tag, frequency or completion filters. Partial, failed and refetching inventories withhold
options and retain recovery. The editor explicitly includes completed one-time destinations;
standalone presentation retains its existing exclusion. Final General, self, descendant and full
subtree-depth checks use the complete inventory. Root capacity remains a server-owned refusal.

Android keeps a parent-changing update separate from pending Create, resolves source, parent and
tag references through the existing queue, and validates resolved parent UUIDs before transport.
Ordinary updates without parent keys retain Create compaction. The existing optimistic move owner
updates list membership alongside fields and the account-owned detail snapshot. Filtered lists
without the target remove the source from its former position until authoritative refresh. Parent
detail and full-detail membership roll back together after rejection. Optimism is not confirmation.
Uncertain Save retains every field and requires successful authoritative parent readback before an
explicit retry can send another update. Queued wording and confirmed-save callbacks stay distinct.

Owning Vitest cases cover real web menu and detail-pencil entrypoints, Android Today menu through
TodayModals and the detail pencil, local picker dismissal and Cancel, explicit set/clear/omit,
late reads, complete pagination, cache rollback and persisted queue resolution. The bounded parent
field/picker geometry cases extend the existing radio-text Chromium owner. Frozen combined-build
rendering, installed Android fonts and assistive technology, and staging combined write/readback
remain separate acceptance boundaries.

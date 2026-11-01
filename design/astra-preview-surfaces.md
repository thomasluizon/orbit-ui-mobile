# Astra preview surfaces

The conversation lets a person inspect each proposed item before approving a write.
The granted Astra conversation canvas defines the item rows, action order and outcomes.

| Surface | Web and Android behavior |
| --- | --- |
| Pending item preview | One named row per item with a localized cadence, date or time; only items marked `removesData: true` carry an irreversible mark. |
| Typed brain dump preview | One operation groups supplied `habitType` values under Tasks, Habits and General, in that order, using the paired localized labels. Item order inside each group and item identities remain intact. With fewer than two known types the preview stays flat without headings. Unknown, absent and null types stay unheaded, before named groups when grouping applies. Headings add no parent, placement or action. Reused items retain their field options and old/new adjustments. |
| Placement choice | Destination-aware radio choices show the selected placement, recommendation and supplied localized reason. A switch revises every retained item ID with only the chosen item's placement patch. Approval and other revisions wait for the returned preview. Checklist items show their destination's settings note instead of independent draft schedules or nested activities; full Edit retains those settings for switching back. Offline failures retain the selected placement for retry; expired previews require refresh before approval. |
| Compact preview actions | One filled Create or Save action, with counted accessible naming and icon-only Edit and Reject; whole controls reflow when the row cannot fit. |
| Wide preview actions | The same filled primary action and icon-only Edit and Reject; whole controls reflow when the panel cannot fit them. |
| Breakdown draft footer | Add habit, More actions and Approve are the three visible actions. Approve is primary with rows; Add habit is primary in an empty draft. More actions opens the shared compact sheet or wide anchored menu with Edit and Reject, keeping their accessible names. |
| Breakdown recovery footer | Pending disables editing and disclosure. Capacity feedback stays neutral, adding is disabled at the limit, no-write failures retain the draft, and partial failure keeps only Retry. Completed and rejected previews retain their terminal status. |
| Inline item title | A pending item with an editable title opens an in-place Input on title activation. Enter or blur revises the held preview; Escape discards the draft. Unchanged drafts leave the proposal intact; edited values use the existing revision validation. Approval stays disabled while any visible title draft differs from its accepted proposal, including after revision failure. Restoring the accepted name or completing the revision enables approval. Enter and Escape return focus to the title control; blur preserves the next focus destination. Busy, stale and terminal rows cannot rename. No item title carries a disclosure chevron. |
| Reading item title | Every title that cannot rename, including deletion and terminal rows, wraps to two lines and reveals its complete name on activation. Expanded web text scrolls beside its native control through PersonalTextAction. Android uses the existing PersonalText expansion adapter. |
| Proposed icon | The proposed icon sits beside the title in both locales, without a verb or redundant metadata label. Icon removal retains its summary. |
| Suggested fields | Suggestions appear once in the item's icon and localized summary, without separate field rows or letter tiles. Full Edit keeps a named removal control beside each removable suggestion; a grouped reminder uses one control for its supplied removal paths. A single one-time create uses the existing task heading. |
| Restart plan | Every reschedule item shows its proposed date from `items[].fields`, including dates omitted from `changes`. Today uses the existing localized date word against the account calendar day. Moved dates retain the compact before and after summary. Full Edit revises one date while retaining every other item; approval and rejection keep the whole operation. |
| Item editing sheet | Existing typed editing, per-item removal and batch revision remain available. |
| Irreversible confirmation and identity verification | Reversible previews approve directly; deletion confirmation names the deletion count and act, including in a mixed preview. Existing identity verification remains available. |
| Unresolved parent | Each affected item shows the existing Parent habit label and a single column of RadioRow options beneath its summary. Only API-offered parents appear; the offered null value uses the existing localized No parent label. Every option retains a 48px target. A choice revises the whole retained batch through its current fingerprint, replacing the preview before approval. Approval and identity verification stay disabled while required choices remain, with a visible localized reason and an approval hint. Busy, stale and terminal items cannot choose. Busy rows retain their focused control; success moves focus to the next unresolved group’s checked or first option, or to enabled approval after the last choice. Failure retains focus on the chosen option. Moving focus elsewhere cancels this continuation. Failed revisions retain the options and recovery; replacement previews discard the previous choices. Resolved and legacy items carry no choice control. |
| Revised preview | Removal and editing update the action count, irreversible marks and deletion count from the returned items. |
| Terminal operation outcomes | Failed, denied and policy-blocked outcomes retain their status and recovery without pending deletion marks or notes. |
| Busy, saved and failed preview | Every mutation action disables during work, every row shows progress and the frame announces busy. Completed-target navigation and retry remain available. |
| Stale preview | One sentence describes staleness, a failed refresh or an unavailable preview, with Refresh while the intent can still be previewed. |
| Empty preview | An unsettled preview with an explicit zero target count or an empty item list without a count renders one localized notice without a frame or approval action. Settled operations retain their outcome and recovery. Previews without item details retain their plain confirmation. |
| Repeated operation | One operation id renders once, with its original reply and saved operation state. |
| Legacy action labels | Checklist updates, parent changes and goal links use localized labels with the habit name for PascalCase and snake_case tool names. |
| Tool trace | Completed steps stay after their request and above their own reply blocks. |
| Frame geometry | The card keeps its 16 inset, 12 header gap and 12 record-row inset without reserving an absent description. The header count uses tabular sans numerals. |
| Rejected preview | Rows and actions collapse to the counted rejection sentence stating that nothing was saved. |
| Habit list pagination | Lists reveal up to twenty rows before an icon-only Show more control is needed. |
| Assistant introduction | Model prose remains intact; repeated confirmation requests require an API prompt change. |

Field diff labels, raw enums and redundant item names are removed from preview rows.
Item names, short summaries and the single action row establish the hierarchy.

`pending-operation-item-groups.ts` owns the pure grouping shared by the pending-operation
presenter. The paired BlockFrame owners render each group heading above its first row,
outside the proposed item surface, using the existing neutral type and spacing tokens.
Nested rows remain with their parent. Original producer indexes keep execution outcomes
attached to their items after display reordering. Approval, full Edit and rejection still
belong to the single operation. Shared and paired component suites cover mixed types,
legacy and single-type previews, retained editing and whole-operation actions.
The paired preview geometry suites measure grouped headings and retained rows at phone
and desktop widths in both locales, including enlarged text. Web uses isolated Chromium;
Android uses the existing Yoga measurement path. Device font and screen-reader acceptance
remain separate from these hermetic checks.

Breakdown footer owners are `apps/web/components/chat/breakdown-suggestion.tsx` and
`apps/mobile/components/chat/breakdown-suggestion.tsx`. Their behavior suites cover
removal confirmation, empty drafts, capacity, pending requests, errors and retry.
The localized action suites cover English and Brazilian Portuguese at compact and
wide widths, keyboard access on web, native dismissal before editing on Android,
and retained edited and added titles through disclosure dismissal and approval.

Vitest covers each recovery and presentation path on both platforms. Chromium measures
pending, completed, failed and stale previews at 390, 840 and 1352 in both locales and
appearances. Android Yoga cases measure the same frame inset and absent-description gap.
Native text rendering and TalkBack remain device-verification boundaries.

Preview title owners are `components/chat/preview-item-title.tsx` on both platforms.
They use Input, PersonalText and the native inset focus primitive with the existing
48px target, field perimeter and neutral tokens. Full Edit continues to open the
typed sheet for every other field. Inline title revisions use the current preview
fingerprint and invalidate prior authorization through the existing revision path.
Android hardware Escape uses the native key-down event enabled by the application
feature-flag adapter; the legacy TextInput soft-key event cannot deliver it.
The focused suites cover cancellation, submission deduplication, updated names,
retained full editing and approval. Staging rendering, persisted habit readback and
native keyboard delivery remain rollout verification boundaries.

The proposed row wrapper stays mounted when a revision accepts its title, preserving
the editor and its focus-return state across the change. Proposed title text uses
fg-2 on hover, press and focus fills. Approval and identity verification share the
unaccepted-title gate; failure feedback remains beside the held preview.

A successful refresh replaces the editor with the accepted preview and clears its
discarded title drafts, including when the returned item ids are unchanged. A failed
revision keeps the displayed draft and continues to block approval until the title
is accepted, restored or cancelled.

The `preview item titles` amendment in
`design/canvas/Orbit Astra Conversation.dc.html` retains full-name disclosure for
terminal rows and the stable Proposed wrapper. The Chromium preview geometry suite
measures the padded row inside that wrapper and includes the terminal title control
in its bounds. The 16px frame inset, 12px header gap, 12px record-row inset, first-line action
alignment and overflow bounds apply in every state. Android's BlockFrame style and
Yoga suites retain the matching row and frame contracts.

Create previews describe the proposed cadence and time with the habit row's frequency
formatter. Default booleans and an explicit null parent stay out of the summary.
Nested habits appear as indented named rows with their own cadence and time. Removing
one revises the parent's `sub_habits` field through the held preview fingerprint;
failed revisions retain every row. The header and approval count retain the producer's
top-level target count. Shared and paired component suites use the captured evening
routine proposal in both locales.

## Focused read surfaces

| Family | Paired owner and behavior |
| --- | --- |
| Habits and dated schedules | `chat/habit-list-card` and `chat/day-summary-card` retain requested rows and resolved dates. Day totals and rings follow live root-habit completion while preserving counts for unlisted rows. Each pending or failed check belongs to its own row. |
| Metrics and streaks | `chat/metrics-card` uses the declared period measures and shows a saved window once; `chat/streak-card` preserves its supplied figures and as-of window, with read-only FreezeBank facts below the figure. Current freeze management remains in Sequência. |
| Totals and comparisons | `chat/period-total-card` and `chat/period-comparison-card` expose the requested figure or both windows and supplied delta; zero baselines omit a relative percentage. |
| Logs and history | `chat/record-list-card` renders `habitHistory` as dated, numeric rows without hiding zero or negative values. |
| Goals | `chat/goal-list-card` retains saved progress and names actual linked sources once, with the existing detail action. |
| Calendar | `chat/calendar-card` retains event titles and timing while current connection, permissions and event availability govern import actions. |
| Records | `chat/record-list-card` keeps mark-read, safe key metadata and established navigation; tags and templates add no destination. |
| Account | `chat/account-rows-card` retains safe profile, plan and referral facts, copy/share and navigation. Plans add no purchasing content. |
| Retrospectives | `chat/period-insight-card` leads with dates and figures; Show more retains every supplied narrative section and habit detail, including stale saved recaps. Habit rows carry their percentage within the row and open the supplied habit id; legacy rows retain name disclosure. Signed paging stays withheld for stale reads. The Progresso destination retains the supported recap/share flow. |
| Recovery and paging | `chat/read-block-frame` adapts the existing BlockFrame to signed refresh and cursor paging. Failed refresh preserves the snapshot; mismatched query ids and changed page revisions are rejected. Account changes and unmounts discard late responses. |

New renderers remain below the existing lazy conversation import. Both locales and appearances
use the existing tokens. Vitest behavior cases cover registry rendering, null and zero semantics,
signed refresh/paging, recovery and account changes. The existing geometry suites cover compact
and wide figures with enlarged text. Actual Android text and TalkBack require device acceptance;
unit geometry does not establish native font rendering or spoken output. Real-call composition
acceptance belongs to #26. This inventory does not change preview editing or approval ownership.

## Lean composition ownership

Negotiated parts render their primary answer once and exclude duplicate legacy cards and prose.
Operation previews and outcomes lead before external text. Repeated pending ids retain their
original card; a later terminal response updates that card's presented persisted state. Failed,
denied, partial, rejected, stale and uncertain outcomes retain the existing localized recovery and
approval mechanics. No risk badge or purchase invitation is added.

Choice and pick-list questions stay inside their existing blocks. Completed steps use secondary
disclosure after the answer. Follow-ups use zero to two existing small pills with a hidden group
name and full contextual activation. Empty answers recover visibly; block-only answers announce
completion once. Read scopes survive history serialization without carrying refresh credentials.
The #26 bilingual real-pipeline gate remains required before broad composition activation.

Parent choices use the paired RadioRow and RadioGroup owners in the pending-operation
card. The full Edit sheet uses the same offered choices instead of an unrestricted
parent input. Explicit No parent sends a JSON null through the existing revision
route. Selection saves only the preview; the existing approval still owns execution.
Both locale behavior suites cover candidates, root selection, all-item gating,
replacement, rejection, revision failure, resolved names and historical responses.
The hermetic Chromium and Yoga cases cover parent controls at phone and desktop
widths in both locales and at enlarged text. Native fonts and TalkBack remain device
verification boundaries.


RadioRow has a focus-preserving busy state shared by inline choices, Full Edit item
selection and reminder choices, and Support subjects. Busy rows expose their reason
and block selection and commits without replacing the focused native control. Static
refusals keep their existing disabled disclosure. Other RadioGroup consumers do not
switch rows to disabled during requests; move-parent refusals describe inventory
constraints rather than request state.

## Compact answer blocks

All fifteen typed block kinds share the paired BlockFrame surface: a 16px inset,
12px content rhythm and a quiet Orbit mark in the header. Read blocks have no manual
refresh or shell-navigation footer. Every stale signed read retains a named refresh recovery icon;
disconnected calendar blocks retain their named reconnection icon. Signed paging,
actual record actions and expanded retrospective details retain named icon controls. Stale write previews retain their
existing authorization recovery, which prepares a replacement proposal before approval.

Habit lists, dated summaries, rankings, retrospective habit rows and metric habit rows
use the paired `chat/habit-block-row` with HabitRowLeading and HabitCheck where an
occurrence supplies completion state. The canonical emoji well supplies its letter
fallback. Completion stays in the check, with no repeated Done metadata. Habit list and
day-summary checks use the same useLogHabit cache update and rollback as Hoje. Ranking
and retrospective counts describe a period, so they do not invent a single-day toggle.
Pick-list options use the same row and check for selection, retaining title disclosure
and proposed-state feedback. History records retain their dated numeric meaning; the
record contract does not carry habit identity or an emoji.

Totals, comparisons, metrics and streaks use the paired CompactFigure for a value and
unit on one line. Totals put the figure in the marked header and name the specific measure
once. Comparisons name supplied month windows, mark partial months as so
far, lead with their supplied completion comparison and use bars on one shared scale.
The total reads `card.value`, and comparisonPresentation reads currentValue and
baselineValue. Each figure names its declared metric; completed-habit counts stay
distinct from completion logs.
Profile-only account payloads without a plan row remain a producer limitation. Supplied
plan rows use Orbit Pro or Free and retain their trial and expiry dates. Time zones use
the locale database's long generic name, falling back to the supplied id when unavailable.

Write previews retain inline rename, editing, rejection, parent resolution and approval.
The preview title names a create count or the habit being edited. The emoji well and
short schedule summary share the row. Enabled reminders add one summary token with the
supplied timing, or the reminder action when timing is absent. Summary tokens wrap only
at their separators on both platforms. Creates omit default tracking flags and root
identity; schedule edits show supplied before and after values. Proposed semantics and
feedback remain while the dashed outline is removed from the framed rows.

Paired component suites cover the block registry, paging, failures, account changes,
selection and preview authorization. The rendered web mutation case holds a log request
open, observes the completed check, then rejects it and observes rollback. Chromium
Vitest measures title/check centres in the day-summary rows at phone and desktop widths;
native Yoga covers the corresponding blocks and named actions. Staging screenshots,
Android rendering and per-kind independent design and copy approval remain coordinator
verification tasks.

## Habit suggestion drafts

`components/chat/habit-suggestions-card.tsx` and `habit-suggestion-editor.tsx` own the
paired web and Android suggestion surfaces. Each draft reuses `HabitBlockRow` and its
emoji tile, title and schedule metadata, with the supplied reason on one quiet line.
Schedule times use the account clock preference. The proposed row retains its inset dashed outline. Its four named icon actions are
Add, Edit, Tweak and Swap. Add all is the primary pill below the remaining drafts.

| Surface | States and behavior |
| --- | --- |
| Add | Requests one pending preview through the single-draft endpoint, focuses the existing preview and waits for approval. Pending and uncertain previews keep their slots reserved. Rejection makes the draft available again. |
| Add all | Sends all available drafts in one request for one pending preview. Applied drafts and slots already held by another preview are excluded. An indexed conflict stays under its draft with Retry; every draft remains intact. |
| Edit | Opens the existing complete creation or edit form with the draft's type, emoji, schedule, reminder and checklist prefilled. Existing-habit identity and unrelated settings stay with the edit form. Unloaded relationship fields retain the form's unknown state and are omitted unless explicitly edited. The person's explicit form submission retains the ordinary form save behavior. |
| Tweak | Opens the single-line prompt under its draft. Submission sends that draft and instruction, replaces only that slot and retains neighboring rows and an instruction being typed under another card. Failure keeps the draft and instruction with a visible Retry. |
| Swap | Sends the localized request for another idea for the same slot through refinement. The replacement cross-fades at the fast motion duration to prevent a jarring change; reduced motion settles immediately. |
| Existing habit | Shows the localized Already exists label and the loaded current schedule beside the proposed schedule. A failed current read has its own Retry; editing waits for the current habit. |
| Completed and offline | Completed slots leave the available draft set. Offline keeps the ideas visible and disables remote actions with a localized reason. |

The paired suggestion-card suites exercise Add, the existing approval card, Edit form
handoff, Tweak, Swap, Add all, indexed conflicts, existing schedules and refinement retry.
The paired create/edit form suites verify the actual draft initialization. Shared tests
cover negotiation, boundary parsing, independent replacement, preview reservation,
rejection, completion, uncertainty, concurrent requests and account replacement.
The coordinator owns the per-state design and copy approval rounds.

Restart plan summaries live in shared pending-operation item logic. Both pending-operation
cards supply the account day from the profile time zone and reuse the existing typed date
editor and batch revision path. Shared and paired component cases cover unchanged today,
overdue habits kept today, deferred dates, single-item reschedules and one-item editing in
English and Brazilian Portuguese. The account-day cases run across the UTC day boundary.

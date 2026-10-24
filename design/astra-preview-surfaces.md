# Astra preview surfaces

The conversation lets a person inspect each proposed item before approving a write.
The granted Astra conversation canvas defines the item rows, action order and outcomes.

| Surface | Web and Android behavior |
| --- | --- |
| Pending item preview | One named row per item with a localized cadence, date or time; only items marked `removesData: true` carry an irreversible mark. |
| Compact preview actions | Primary action named from `actionKey` with the target count, ghost Edit, a spacer and ghost Reject; whole controls reflow when the row cannot fit. |
| Wide preview actions | Secondary action named from `actionKey` with the target count, ghost Edit, a spacer and ghost Reject; whole controls reflow when the panel cannot fit them. |
| Breakdown draft footer | Add habit, More actions and Approve are the three visible actions. Approve is primary with rows; Add habit is primary in an empty draft. More actions opens the shared compact sheet or wide anchored menu with Edit and Reject, keeping their accessible names. |
| Breakdown recovery footer | Pending disables editing and disclosure. Capacity feedback stays neutral, adding is disabled at the limit, no-write failures retain the draft, and partial failure keeps only Retry. Completed and rejected previews retain their terminal status. |
| Inline item title | A pending item with an editable title opens an in-place Input on title activation. Enter or blur revises the held preview; Escape discards the draft. Unchanged drafts leave the proposal intact; edited values use the existing revision validation. Approval stays disabled while any visible title draft differs from its accepted proposal, including after revision failure. Restoring the accepted name or completing the revision enables approval. Enter and Escape return focus to the title control; blur preserves the next focus destination. Busy, stale and terminal rows cannot rename. No item title carries a disclosure chevron. |
| Reading item title | Every title that cannot rename, including deletion and terminal rows, wraps to two lines and reveals its complete name on activation. Expanded web text scrolls beside its native control through PersonalTextAction. Android uses the existing PersonalText expansion adapter. |
| Proposed icon | The proposed icon sits beside the title in both locales, without a verb or redundant metadata label. Icon removal retains its summary. |
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
| Frame geometry | The card keeps its 24 inset, 24 header gap and 12 row inset without reserving an absent description. The header count uses tabular sans numerals. |
| Rejected preview | Rows and actions collapse to the counted rejection sentence stating that nothing was saved. |
| Habit list pagination | The ghost Show more control hugs its content and reveals the next page in place. |
| Assistant introduction | Model prose remains intact; repeated confirmation requests require an API prompt change. |

Field diff labels, raw enums and redundant item names are removed from preview rows.
Item names, short summaries and the single action row establish the hierarchy.

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
in its bounds. The 24px frame inset, 24px header gap, 12px row inset, first-line action
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
| Habits and dated schedules | `chat/habit-list-card` and `chat/day-summary-card` retain requested rows and resolved dates; live completion eligibility is separate from the saved totals. |
| Metrics and streaks | `chat/metrics-card` uses the declared period measures; `chat/streak-card` preserves its supplied figures and as-of window. Current freeze management remains in Sequência. |
| Totals and comparisons | `chat/period-total-card` and `chat/period-comparison-card` expose the requested figure or both windows and supplied delta; zero baselines omit a relative percentage. |
| Logs and history | `chat/record-list-card` renders `habitHistory` as dated, numeric rows without hiding zero or negative values. |
| Goals | `chat/goal-list-card` retains saved progress and names actual linked sources once, with the existing detail action. |
| Calendar | `chat/calendar-card` retains event titles and timing while current connection, permissions and event availability govern import actions. |
| Records | `chat/record-list-card` keeps mark-read, safe key metadata and established navigation; tags and templates add no destination. |
| Account | `chat/account-rows-card` retains safe profile, plan and referral facts, copy/share and navigation. Plans add no purchasing content. |
| Retrospectives | `chat/period-insight-card` leads with dates and figures; Show more retains every supplied narrative section and habit detail, including stale saved recaps. Disclosure and the Progresso link share the stale refresh footer; signed paging stays withheld. The Progresso destination retains the supported recap/share flow. |
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

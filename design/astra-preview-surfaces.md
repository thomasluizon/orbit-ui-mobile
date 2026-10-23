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

# Astra action marks and composer disclosure

> **At a glance** - assistant action owners, localized prompts, accessible action names and the habit-detail composer disclosure on web and Android.

A standalone assistant action uses the canonical Astra mark alone in a 48px icon target. Date,
emoji, tag and reschedule requests have distinct localized accessible names. Habit and goal
analysis, interpretation fallback, retry, empty-list entries and the reschedule menu use the same
mark-only treatment. Loading retains the mark and busy announcement without an invisible spinner
slot beside it. The mark is decorative within the named control.

Suggestion chips, idea cards and proactive prose retain their request text without an appended
brand name. Their accessible names contain the request once. These suggestions describe what a
selection sends; they are distinct from the standalone form and object actions.

Composer send shows one upward arrow, replaced by one spinner while sending. It has no Astra mark
or visible text and keeps the localized Send name. Its 48px target shares zero gap with the other
48px trailing targets, matching the adjacent targets in the composer drawing. The shared composer
owns Hoje, habit detail and the full-screen conversation.

| Surface | Web owner | Android owner |
|---|---|---|
| Suggestion strip, conversation entry, submit and retry | `components/shell/composer.tsx` | `components/shell/composer.tsx` |
| Wide sidebar conversation entry, including onboarding | `components/shell/shell-wide.tsx`, `components/shell/destination-shell.tsx`, `components/onboarding/onboarding-flow.tsx` | Shell composer entry |
| Habit-detail disclosure registration | `app/(app)/layout.tsx` | `app/_layout.tsx` |
| Complete ideas and live requests | `components/chat/prompt-idea.tsx` | `components/chat/prompt-idea.tsx` |
| Deferred complete idea above the composer | `components/chat/conversation.tsx` | `components/chat/conversation.tsx` |
| Follow-up requests | `components/chat/follow-up-chips.tsx` | `components/chat/follow-up-chips.tsx` |
| Proactive requests | `components/chat/proactive-action.tsx` | `components/chat/proactive-action.tsx` |
| Habit interpretation fallback | `components/habits/habit-form-fields.tsx` | `components/habits/habit-form-fields.tsx` |
| Date interpretation | `components/habits/habit-form-fields/habit-date-field.tsx` | `components/habits/habit-form-fields/habit-date-field.tsx` |
| Emoji and tag suggestions | `components/habits/habit-form-fields/habit-emoji-selector.tsx`, `components/habits/habit-form-fields/tag-suggestions.tsx` | `components/habits/habit-form-fields/habit-emoji-selector.tsx`, `components/habits/habit-form-fields/tag-suggestions.tsx` |
| Habit analysis and rescue retry | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` |
| Reschedule retry | `components/habits/reschedule-sheet.tsx` | `components/habits/reschedule-sheet.tsx` |
| Overdue reschedule menu item | `components/habits/habit-row-trailing.tsx` | `components/habits/habit-row.tsx` |
| Goal analysis | `components/goals/goal-detail-drawer.tsx` | `components/goals/goal-detail-drawer.tsx` |
| Empty habit list conversation entry | `components/habits/habit-list/empty-state.tsx` | `components/habit-list/empty-state.tsx` |
| Conversation empty heading | `components/chat/chat-empty-state.tsx` | `components/chat/chat-empty-state.tsx` |
| Onboarding import action | `app/(app)/layout.tsx` | `components/onboarding/astra-import-prompt.tsx` |
| Setup checklist conversation prompt | `components/today/setup-checklist-card.tsx` | `components/today/setup-checklist-card.tsx` |

Owner paths are relative to each app. The sidebar's `SidebarAstraRow` owns only its glyph color;
`SidebarItem` retains paired resting and hover text colors for named destinations. Follow-up requests
use the shared lean-answer selection, at most two small ghost pills and one dispatch per selection.
Their useful labels and accessible names each contain the action once, with no appended brand name.

The form's reading preview retains its schedule sentence and proposed-field treatment. It omits
the redundant visible understood status, so no status label floats beside the emoji control.

Shared copy lives in both `packages/shared/src/i18n/en.json` and `pt-BR.json`. The composer asks
what the person wants to do. Accessible action names use contextual verbs; date, emoji, tag and
reschedule names identify their request and name Astra once. Interpretation, habit, goal, summary
and import actions retain their contextual meanings. Explanatory prose, AI disclosures, conversation participant
names and settings that name the assistant retain their meaning. The summary action's
`summary.askAstra` catalog entry has the approved contextual verb even though the current summary
entry is the proactive line. The Perfil settings entry retains its assistant name and neutral
`MessageCircle` icon through `PROFILE_SUBMENUS`; it has no adjacent Astra mark.

Habit detail adds one disclosure control. Collapsed, it occupies one compact row with the mark.
Expanded, the collapse icon shares the suggestion row, leaving the scroll strip room beside it.
Without suggestions it occupies the input row's reserved text-action slot, with Clear and Paste in
the existing actions menu. Neither placement adds a row. The compact row remains 48px at enlarged
text. Web uses the global focus indicator; Android retains InsetFocusPressable.
The input, attachments and requests remain
mounted. The local UI preference persists through the existing device storage adapter. Other
composer surfaces stay expanded. The shell continues to allocate the pinned content outside the
habit scroller, preserving the final content row in narrow and short viewports.

The leading mark and input reflow as one group, with the trailing controls on a separate line when
needed. Enlarged text keeps the mark aligned with the input's bottom edge. The static web
placeholder uses normal word wrapping; typed drafts retain their spaces and line breaks.

Vitest covers mark-only controls, localized action names, retained callbacks, disclosure state,
draft retention and device persistence. The form, reschedule, habit, goal, empty-list and menu
component cases reject visible action labels. Composer cases reject a send mark or text and measure
adjacent targets on both platforms. Native geometry covers the Fold cover width. Hermetic
Chromium composition covers the shell allocation, compact disclosure and mark-only actions.
The hermetic layout specs resolve these controls from their current localized action names.
They preserve their viewport, spacing, fit, focus and clearance assertions; mark-only entries assert
that the brand word is absent beside the glyph. A wide habit-detail opener is scoped to its pinned
composer because the sidebar and composer intentionally share the same accessible action name.
Device font rendering and production web and Android Open rollout remain release verification.

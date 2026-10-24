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
or visible text and keeps the localized Send name. Its 48px target shares one equal gap of the shared
fill clearance (`INTERACTION_FILL_CLEARANCE`) with the other 48px trailing targets, including the
text-action slot or disclosure and the attach control. The composer drawing uses the matching
`--s-1` spacing token. The shared composer owns Hoje, habit detail and the full-screen conversation.

Other action owners retain clearance on both platforms: the emoji picker and suggestion targets
have a 12px gap; date, tag, interpretation and analysis actions occupy separate rows; reschedule
and rescue retry use the 12px ActionRow gap. Menu Astra items occupy their own row, with the mark
centred inside its 48px target and neighbouring row content inset by at least 8px.

| Surface | Web owner | Android owner |
|---|---|---|
| Suggestion strip, conversation entry, submit and retry | `components/shell/composer.tsx` | `components/shell/composer.tsx` |
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

Owner paths are relative to each app. Named navigation rows are inventoried separately below.
`SidebarAstraRow` and `SidebarItem` share row geometry, label styling and interaction treatment. Follow-up requests
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
They preserve their viewport, spacing, fit, focus and clearance assertions; mark-only actions and composer entries assert
that the brand word is absent beside the glyph. The wide sidebar retains visible `Astra` text and
its accessible name once; the composer keeps its contextual conversation-entry name.
Device font rendering and production web and Android Open rollout remain release verification.


## Named Astra navigation entries

The copy authority for #1687 is the owner's instruction: "i asked you to top putting Consultar
astra string everywhere / what you did: removed the astra word from the app, including on the
sidebar / fix this". Navigation rows keep `Astra` wherever sibling destinations show their names.
Only actions drop appended branding. This corrects the #1668 inventory's inclusion of the sidebar
among mark-only controls. It does not add an Astra route or Android tab.

| Entry | Web owner | Android owner | Visible name and behavior |
|---|---|---|---|
| Wide sidebar conversation row | `components/shell/shell-wide.tsx`, `components/shell/destination-shell.tsx` | No sidebar; composer owns the front door | `nav.astra` supplies `Astra` beside the glyph, with sibling row treatment; opens the conversation layer |
| Onboarding shell conversation row | `components/onboarding/onboarding-flow.tsx`, rendered by `components/shell/shell-wide.tsx` | No sidebar | Uses the same `nav.astra` row; selects the existing Astra onboarding entry |
| Command palette | `components/shell/destination-shell.tsx`, `components/command/command-groups.tsx` | No command palette | No Astra conversation entry exists; the supplied destinations are Hoje, Calendário, Progresso, Perfil, Todos and Geral |
| Perfil settings navigation | `app/(app)/profile/_components/profile-settings-content.tsx` | `app/(tabs)/profile/_components/profile-settings-content.tsx` | `PROFILE_SUBMENUS` in `packages/shared/src/utils/profile-navigation.ts` supplies `profile.groups.astra`, already `Astra` in both locales; opens `/profile/astra` settings with the neutral `MessageCircle` icon |
| Compact Hoje and habit-detail conversation entry | `components/shell/composer.tsx` | `components/shell/composer.tsx` | Retains the mark-only composer control and contextual accessible name; this input accessory has no sibling destination names |

Android component coverage mounts Perfil with both locale catalogs, checks its visible and
accessible `Astra` name and follows the row to `/profile/astra`. Web navigation coverage checks
one named sidebar row before the four destinations and its retained open/close behavior.
Chromium coverage checks visible text, matching sibling row geometry, hover, press, focus and
active styling in both locales and appearances. Action-copy and composer tests retain the
#1668 exclusions.

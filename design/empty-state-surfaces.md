# Empty-state surfaces

> **At a glance** - shared empty-state consumers, Orbit thread composition and completed-day action spacing on web and Android.

The shared `EmptyState` uses one 48px identity carrier, a required title and at most one
caller-supplied action. The mark, title, action and optional disclosure share a 24px stack,
24px inline padding and symmetric 48px block padding. The mark stays neutral.

Paths below are relative to each platform's `components/` directory unless stated otherwise.

| Surface | Web owner | Android owner | Retained content |
|---|---|---|---|
| Empty Orbit thread | `chat/chat-empty-state.tsx` | `chat/chat-empty-state.tsx` | Orbit mascot, title, one ghost browse action and disclosure |
| Empty calendar import and review | `calendar-sync/calendar-import-content.tsx` | `calendar-sync/calendar-import-content.tsx` | Orbit mark, mode-specific title and back action |
| Empty goal list | `app/(app)/progress/_components/progress-content.tsx` | `progress/progress-content.tsx` | Orbit mark, title and create action |
| Empty progress window | Same progress owner | Same progress owner | Orbit mark, title and habit entry |
| Empty achievements | Same progress owner | Same progress owner | Orbit mark, title and habit entry |
| Empty linked-habit picker | `goals/goal-habits-field.tsx` | `goals/goal-habits-field.tsx` | Orbit mark, title and create action |
| Linked-habit search miss | Same picker owner | Same picker owner | Orbit mark, query-miss title and close action |
| Empty share card | `share/share-card-sheet.tsx` | `share/share-card-sheet.tsx` | Orbit mark and existing title |
| Empty and failed Avisos inbox | `navigation/notification-list.tsx` | `navigation/notification-list.tsx` | 96px Orbit mark and one line, or the load error and retry |

A full-screen empty state centres its group vertically in the free height of the compact shell
scroller, between the shell header and the bottom chrome (#2051). `shell/shell-centred-region.tsx`
on each platform owns this. It fills the rest of the scroll content and mirrors the shell's bottom
scroller clearance as its top padding. The Avisos inbox and the Progresso Metas subscreen use it.
On web, `[data-shell-page-content]` becomes a flex column when it holds a centred region or a flow
shell, so the fill chain also resolves in a standards-mode document.
Empty states inside other content keep their place: the Progresso window and achievements sections,
the goal list section of the Progresso overview, the calendar import sheet, the linked-habit picker,
the share card sheet, and Hoje. Web `notification-empty-centre-geometry.test.tsx` and
`progress-goals-empty-centre-geometry.test.tsx` measure the group centre within 1px of the free
area centre at compact widths in both themes. The Android tests of the same names measure the same
centre in Shell412.

Orbit centres the visible mark-to-disclosure group within the thread above the complete
composer block, including its live chips and any notices. The web empty owner itself carries
the 708px inner-column cap and full thread minimum height. Android's existing ShellContent
keeps its growing allocation and its ScrollView keeps symmetric 16px thread insets. The
disclosure follows the action within the shared component, so its 48px outer padding no longer
separates those two elements. Short threads scroll without clipping either end.

Under D42, the owner's order in #2008 amends the granted drawing:
"que cacete de logo é essa, coloca a do orbit".
Hoje's `HabitListAllDone` centres the normal still 48px monochrome `--fg-1` Orbit logo
itself, without a surrounding ring, followed by a display 22px acknowledgement and one factual
line paired with 8px. The mark, text group and optional See tomorrow ghost pill use a 24px stack,
24px inline padding and symmetric 48px block padding. Completion carries no accent or
entrance animation, including under reduced motion. Web owns it in
`habits/habit-list/empty-state.tsx`; Android owns it in `habit-list/empty-state.tsx`.
Both retain the same navigation callback and the existing completed-day eligibility.
The Hoje screen owner suppresses its Orbit slot while this completion state applies,
so a proactive item or summary cannot repeat the completion message. Undo restores the
normal line and list in the next render, without a dismissal delay.

Web `chat-empty-state-geometry.test.tsx` mounts the conversation owner and measures the
visible group's centre, 48px mark and 24px disclosure gap, including compact, foldable and
740px desktop columns in both locales. `habit-list-all-done-geometry.test.tsx` measures the
normal logo paths, 48px size, absence of a second ring, centring, whole labels, 8px text pairing,
24px action clearance and the static reduced-motion state. Shared primitive geometry and behaviour tests
retain title fit, both identity carriers and the single supplied action.

Android `astra-full-screen-geometry.test.tsx` mounts Shell412 with the conversation, measures
the group against its thread and checks the mark size. The habit-list empty-state test measures
completion geometry at compact and wide widths, checks localized label fit and invokes
the retained action. Feedback primitive tests check both
48px identity carriers and the supplied action. These are style and Yoga checks, not device
rendering evidence.

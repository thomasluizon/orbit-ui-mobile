# Headless menu surfaces

> **At a glance** - the menu owners, retained presentations, behavior coverage and platform adapters.

The menu parts are `Root`, `Trigger`, `Portal`, `Content` and `Item` in each platform's
`components/ui/dropdown-menu.tsx`. The headless layer owns anchoring, item semantics,
keyboard navigation and dismissal. Orbit retains its menu paint and the compact Sheet presentation.

| Surface | Web owner | Android owner |
|---|---|---|
| Habit actions | `components/habits/habit-row-trailing.tsx` | `components/habits/habit-row.tsx`, `habit-row-trailing.tsx` |
| Today options and frequency | `app/(app)/today-shell.tsx` | `components/today/today-date-control.tsx` |
| Composer actions, paste and clear | `components/shell/composer.tsx` | `components/shell/composer.tsx` |
| Notification inbox actions | `components/navigation/notification-inbox.tsx` | `components/navigation/notification-inbox.tsx` |
| Breakdown preview actions | `components/chat/breakdown-suggestion.tsx` | `components/chat/breakdown-suggestion.tsx` |
| Goal filter | `app/(app)/progress/_components/progress-content.tsx` | `components/progress/progress-content.tsx` |
| Calendar wide options | `app/(app)/calendar/_components/calendar-options.tsx` | The calendar options Sheet remains the compact platform owner |
| Onboarding decisions, completion and plan | `components/onboarding/onboarding-flow.tsx` | `components/onboarding/onboarding-flow.tsx`, through `ui/native-dialog.tsx` and `ui/native-window-host.tsx` |
| Required upgrade and request throttle | The existing blocking error surfaces | `components/upgrade-required-screen.tsx`, `components/throttle-screen.tsx`, through the same native dialog and window host |
| Destructive confirmation | `components/ui/confirm-sheet.tsx`, `components/ui/sheet.tsx` | Same owners |

Menus retain their compact sheet below the configured wide breakpoint, the explicit goal-filter
sheet and the wide anchored panel. Existing short and typed headings, full-title disclosure,
checked items, disabled actions, actionable plan badges and destructive ordering remain available.
The composer recording control remains a voice action.

The native adapter bridges controlled open state through the headless Trigger because its Root
is uncontrolled. Menu ownership remains exclusive, including replacements during a sheet exit.
Native menu panels render through the root PortalHost without React Native Modal.
The root host isolates its screen siblings while an anchored menu is registered. Native sheet
owners and screen reservations retain their own presentation and remain reachable.

Web triggers retain their focus and identity while menu content loads on pointer intent or focus.
The headless root, item behavior, positioning and focus modules load with that content. The
headless trigger receives the existing button as its anchor without replacing the button.
Within a Sheet, the headless positioner uses `display: contents`, leaving its menu in the
primitive's single body scroller. The panel's viewport height bound, nonshrinking header and
shrinkable body preserve scrolling and safe-area clearance at zero and nonzero insets.
The opening gesture consumes both a synthesized item click and the following pointer click,
so releasing over a newly presented action cannot select it or dismiss the sheet.
The content module is cached, and a failed prefetch can retry when the menu opens. Its first
presentation uses the current breakpoint, so a wide menu never briefly mounts a compact sheet.
Escape and outside presses cancel a pending opening before the content arrives. A canceled load
never opens the menu or moves focus; the next opening can use the cached module. The rendered
item labels remain statically connected to their callers while the headless item behavior loads
with the content. Menus and shell breakpoints share the same server-safe viewport subscription.

The web positioning helper remains for the select family. Its former menu-only anchored wrapper
is removed. There is no separate popover component sharing the migrated menu callers.

Vitest covers menu names, item state, selection, dismissal, focus, replacement ownership and the
existing interaction geometry. Native keyboard, TalkBack and native window stacking still require
installed-device verification; host mocks cannot establish those outcomes.

All ten surface groups have their behavior owners migrated. The native full-screen owners use
rn-primitives Dialog Root, Portal, Overlay, Content and Title. A single app-owned native window
contains their named PortalHost and is visible only while a dialog targets it. Its Back request
reaches the topmost dialog's current open-change callback. Upgrade and throttle retain their
blocking close policy, and onboarding retains its step and completion transitions.
The host isolates background touch and accessibility without dismissing or re-presenting a
TrueSheet.
The full-screen owners retain their existing canvas, safe areas, content geometry and strings.
Destructive confirmations focus Cancel after native presentation completes, and sheets and dialogs
restore the captured focus target on close when no replacement overlay has taken ownership,
with the same focus rules on web. Component coverage includes all three full-screen owners,
topmost Back, focus return and a TrueSheet double that drops its edited subtree on dismissal;
that subtree survives dialog opening and closing without a second presentation.

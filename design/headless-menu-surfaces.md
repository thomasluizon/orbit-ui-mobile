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

The separate overlay work remains: onboarding, the upgrade and throttle blocking screens,
confirmation focus on Android and the stale date-field overlay comment.

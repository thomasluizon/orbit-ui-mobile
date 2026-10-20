# Hoje row alignment inventory

The scope is the proactive line, grouped date navigation and habit content on Hoje, on Android and web. These surfaces share the list inset and one text edge. Disclosure and selection stay separate actions without shifting that text edge.

| Surface | Android owner | Web owner | States |
|---|---|---|---|
| Proactive line | `components/today/today-astra.tsx` inside the habit-list header | `components/today/today-astra.tsx` inside the Hoje page | Present, absent, suppressed, destination action |
| Date navigation | `components/today/today-date-control.tsx` inside the habit-list header | `app/(app)/today-shell.tsx` | Today, another date, disabled next action, full and short weekday |
| Habit content | `components/habits/habit-row.tsx` inside `components/habit-list.tsx` | `components/habits/habit-row.tsx` inside `components/habits/habit-list.tsx` | Childless root, collapsed and expanded parent, inline child, selected and unselected, completed and read-only |

The body fill starts at the list inset and leaves 8 before the emoji well at both depths. The shared text edge is 84 from the list container, including the 16 list inset, 8 body padding, 48 leading slot and 12 content gap. The large-text parent supporting line keeps that same content edge.

Geometry coverage uses 320, 384 and 600 widths, normal and 200% text, and normal and selection modes. The fixtures include a root leaf, parent and child together. Above 130% text, parent progress uses the supporting line across the row content width and the trailing controls stay beside the first title line. Normal text retains the existing row composition. Row interaction tests cover disclosure, selection, completion, details and overflow actions.

Empty, loading and error list states carry no habit rows. The proactive line can disappear while the date navigation keeps its edge. Existing sheets and menus remain the destinations of their respective row actions.

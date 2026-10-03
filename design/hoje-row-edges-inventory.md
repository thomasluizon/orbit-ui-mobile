# Hoje row alignment inventory

The scope is the proactive line, grouped date navigation and habit content on Hoje, on Android and web. These surfaces share the list inset and one text edge. Disclosure and selection stay separate actions without shifting that text edge.

| Surface | Android owner | Web owner | States |
|---|---|---|---|
| Proactive line | `components/today/today-astra.tsx` inside the habit-list header | `components/today/today-astra.tsx` inside the Hoje page | Present, absent, suppressed, destination action |
| Date navigation | `components/today/today-date-control.tsx` inside the habit-list header | `app/(app)/today-shell.tsx` | Today, another date, disabled next action, full and short weekday |
| Habit content | `components/habits/habit-row.tsx` inside `components/habit-list.tsx` | `components/habits/habit-row.tsx` inside `components/habits/habit-list.tsx` | Childless root, collapsed and expanded parent, inline child, selected and unselected, completed and read-only |

Geometry coverage uses 320 and 384 widths, normal and 200% text, and normal and selection modes. The fixtures include a root leaf, parent and child together. Row interaction tests cover disclosure, selection, completion, details and overflow actions.

Empty, loading and error list states carry no habit rows. The proactive line can disappear while the date navigation keeps its edge. Existing sheets and menus remain the destinations of their respective row actions.

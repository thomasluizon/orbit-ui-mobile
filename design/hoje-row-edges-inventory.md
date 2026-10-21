# Hoje row alignment inventory

The scope is the proactive line, grouped date navigation and habit content on Hoje, on Android and web. These surfaces share the list inset and text edges per display depth. Disclosure and selection stay separate actions without shifting those text edges.

| Surface | Android owner | Web owner | States |
|---|---|---|---|
| Proactive line | `components/today/today-astra.tsx` inside the habit-list header | `components/today/today-astra.tsx` inside the Hoje page | Present, absent, suppressed, destination action |
| Date navigation | `components/today/today-date-control.tsx` inside the habit-list header | `app/(app)/today-shell.tsx` | Today, another date, disabled next action, full and short weekday |
| Habit content | `components/habits/habit-row.tsx` inside `components/habit-list.tsx` | `components/habits/habit-row.tsx` inside `components/habits/habit-list.tsx` | Childless root, collapsed and expanded parent, inline child, selected and unselected, completed and read-only |

The body fill starts at the list inset at both depths. Depth 0 leaves 8 before the emoji well; depth 1 leaves 24, adding one 16px inset from the granted spacing scale. The canonical row owns this padding, including its large-text supporting line; lists and leading wells add no second inset. The text edges are 84 for roots and 100 for children from the list container, including the 16 list inset, depth-specific body padding, 48 leading slot and 12 content gap. The proactive line shares the root text edge.

Leaf children and children with descendants share the child edge in Hoje, Todos and Geral. Habit detail uses the same depth-1 row. A drill resets its direct children to display depth 0, retaining its existing navigation and two display levels without accumulating ancestry offsets. Child rows keep independent radius-20 bodies, current fills, inset hairlines, smaller wells and dimmer titles, with no connector lines.

Geometry coverage uses 320, 412 and 1352 widths, with additional native leading-edge cases at 384 and 600, normal and 200% text, and normal and selection modes. The fixtures include root leaves, parents and both child kinds. Above 130% text, parent progress uses the supporting line across the row content width and the trailing controls stay beside the first title line. Normal text retains the existing row composition. Row interaction tests cover disclosure, selection, completion, details and overflow actions. Chromium Vitest measures rendered production rows and list compositions; native Vitest measures host styles with Yoga. The hermetic layout workflow owns whole-page web evidence; physical Android rendering remains outside these guards.

Empty, loading and error list states carry no habit rows. The proactive line can disappear while the date navigation keeps its edge. Existing sheets and menus remain the destinations of their respective row actions.

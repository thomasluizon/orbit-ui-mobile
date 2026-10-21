# Hoje row alignment inventory

The scope is the proactive line, grouped date navigation and habit content on Hoje, on Android and web. These surfaces share the list inset and text edges per display depth. Disclosure and selection stay separate actions without shifting those text edges.

| Surface | Android owner | Web owner | States |
|---|---|---|---|
| Proactive line | `components/today/today-astra.tsx` inside the habit-list header | `components/today/today-astra.tsx` inside the Hoje page | Present, absent, suppressed, destination action |
| Date navigation | `components/today/today-date-control.tsx` inside the habit-list header | `app/(app)/today-shell.tsx` | Today, another date, disabled next action, full and short weekday |
| Habit content | `components/habits/habit-row.tsx` inside `components/habit-list.tsx` | `components/habits/habit-row.tsx` inside `components/habits/habit-list.tsx` | Childless root, collapsed and expanded parent, inline child, selected and unselected, completed and read-only |

The body fill starts at the list inset at every depth. Canonical body padding is `8 + 16 × depth`, using one shared-scale 16px step per visible ancestor. Well edges are 8, 24 and 40 for roots, children and grandchildren relative to the row; text edges are 84, 100 and 116 relative to the list, including its 16 gutter, 48 leading slot and 12 content gap. Description, type and supporting metadata share the title edge. The proactive line shares the root text edge. Lists and leading wells add no second inset.

Leaf descendants and descendants with children share their depth's edge in Hoje, Todos and Geral. Habit detail uses depth 1 once. Drill direct children reset to depth 0. At narrow widths the list stops inline expansion before controls and text collide; its boundary parent's disclosure opens the existing drill. At 320, depths 0 through 2 remain distinct in normal and selection modes, including 200% text. Wider contexts can show further depths within the existing data limit. Child rows retain independent radius-20 bodies, fills, inset hairlines, smaller wells and dimmer titles, without connector lines.

Geometry coverage uses 320, 412 and 1352 widths, with additional native leading-edge cases at 384 and 600, normal and 200% text, and normal and selection modes. The fixtures include root leaves, parents and both child and grandchild kinds. Above 130% text, parent progress uses the supporting line across the row content width and the trailing controls stay beside the first title line. Normal text retains the existing row composition. Row interaction tests cover disclosure, selection, completion, details and overflow actions. Chromium Vitest measures rendered production rows and list compositions; native Vitest measures host styles with Yoga. The hermetic layout workflow owns whole-page web evidence; physical Android rendering remains outside these guards.

Empty, loading and error list states carry no habit rows. The proactive line can disappear while the date navigation keeps its edge. Existing sheets and menus remain the destinations of their respective row actions.

At the narrow inline boundary, supporting type and metadata use the existing full-width footer even at normal text size. This keeps complete type words clear of the trailing controls. Boundary rows align controls with the first title line; other normal rows retain whole-row centring.

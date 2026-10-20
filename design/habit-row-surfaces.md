# Habit row surfaces

The owner standard in landing Figma file `aLwwyaY3Dtw1NVesAWsNO7`, rows `7:72` and `7:84`, is “esse e o novo padrao dos habitos”. A habit row owns its radius 20 body, current card surface fill and an inset 1px hairline outline that consumes no layout space. Web uses an inset box shadow; Android uses a noninteractive absolute outline over the body. Its 28px check has radius 12 and retains a separate 48px target.

| Surface | Web owner | Android owner | Coverage |
|---|---|---|---|
| Hoje root and drill lists | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | Root leaf, parent, inline child, deeper drill row, expanded and collapsed family |
| Habit detail child list | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` | Each child owns its fill and border; the group adds neither |
| Row completion | `components/habits/habit-check.tsx`, `habit-row-check-circle.tsx`, `habit-row-trailing.tsx` | Same paths | Empty, done, overdue, bad habit slip, partial parent progress, completed parent, disabled and unavailable |
| Selection mode | `components/habits/habit-row-trailing.tsx` | Same path | Leaf and parent status glyphs retain the shape without becoming another action |
| Keyboard focus | Habit check target and `app/globals.css` | Habit check target through `components/ui/inset-focus-pressable.tsx` | One inset indicator follows the check perimeter; no glyph indicator |

Independently bordered rows have 4px separation within a Hoje family and 12px between families. Habit detail child rows retain 12px separation. Android spacing belongs to the unpainted wrapper so it does not enlarge the bordered body.

Depth-1 wells and titles add one 16px leading inset: canonical body padding is 24 for a child and 8 for a root. This keeps the independent body at the list edge and the trailing 48px targets in place, preserving the available title width without a reserved disclosure column on leaves. Both the primary content and large-text supporting metadata use that depth-specific edge. List, detail and leading-slot owners add no further indentation. Drill rows reset to display depth 0; ancestry never adds another offset. The reference HabitRow contracts already accept depth 0 or 1 and need no public prop change.

Both platforms retain row minimum heights, typography, emoji wells, disclosure, selection, completion, detail, overflow, drag and long-press behavior. Skipping advances the schedule and removes the row from that day; it does not add a skipped check state. Empty, loading and failed lists contain no row checks and keep their existing state surfaces. Their sheets, dialogs and menus retain their existing actions.

`StatusRing`, `ParentRing` and `ProgressRing` remain circular outside the habit row. Calendar event and time-grid status glyphs, the habit detail header, goals, Progresso, Astra blocks and onboarding previews retain their separate components.

Web Vitest measures the production row with compiled CSS at 320, 412 and 1352, in both themes, at normal and 200% text. It checks the depth-specific well inset, visible check, inset outline token, zero layout borders, row fill, zero and partial parent progress and focus. The paired list suites cover Hoje, Todos, Geral, drill resets and selection with leaf and parent children. Android Vitest mounts the row across the same width, theme and text-scale axes and measures the well through Yoga alongside the noninteractive absolute outline, zero body border width, accessible parent counts, state colours and focus. Habit detail composition tests measure its single child inset and retain the group spacing and native fill coverage. The hermetic layout workflow measures production web child wells in both locales and themes at normal and 200% text. Device rendering and whole-screen visual inspection remain outside the component tests.

## Item type metadata

The shared row content owners render `Tarefa única` / `One-time task` or `Hábito` / `Habit` on
its own quiet line beneath the full-width title. Type never ellipsizes or becomes a badge. The
existing time, status and parent counts remain beneath it. The same content reaches Hoje, Todos,
Geral, search, inline children, drill lists, detail children and Astra-owned shared rows. Detail
headers use the same selector beneath their full-width rename heading. Large text grows the row.

Stored description rendering is owned by its separate row amendment. When carried together, its
order is title, description, type and existing metadata. This amendment adds no description copy,
hover redesign or row inset change.

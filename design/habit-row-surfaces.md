# Habit row surfaces

The owner standard in landing Figma file `aLwwyaY3Dtw1NVesAWsNO7`, rows `7:72` and `7:84`, is “esse e o novo padrao dos habitos”. A habit row owns its radius 20 body, current card surface fill and 1px hairline border. Its 28px check has radius 12 and retains a separate 48px target.

| Surface | Web owner | Android owner | Coverage |
|---|---|---|---|
| Hoje root and drill lists | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | Root leaf, parent, inline child, deeper drill row, expanded and collapsed family |
| Habit detail child list | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` | Each child owns its fill and border; the group adds neither |
| Row completion | `components/habits/habit-check.tsx`, `habit-row-check-circle.tsx`, `habit-row-trailing.tsx` | Same paths | Empty, done, overdue, bad habit slip, partial parent progress, completed parent, disabled and unavailable |
| Selection mode | `components/habits/habit-row-trailing.tsx` | Same path | Leaf and parent status glyphs retain the shape without becoming another action |
| Keyboard focus | Habit check target and `app/globals.css` | Habit check target through `components/ui/inset-focus-pressable.tsx` | One inset indicator follows the check perimeter; no glyph indicator |

Independently bordered rows have 4px separation within a Hoje family and 12px between families. Habit detail child rows retain 12px separation. Android spacing belongs to the unpainted wrapper so it does not enlarge the bordered body.

Both platforms retain row minimum heights, typography, emoji wells, disclosure, selection, completion, detail, overflow, drag and long-press behavior. Skipping advances the schedule and removes the row from that day; it does not add a skipped check state. Empty, loading and failed lists contain no row checks and keep their existing state surfaces. Their sheets, dialogs and menus retain their existing actions.

`StatusRing`, `ParentRing` and `ProgressRing` remain circular outside the habit row. Calendar event and time-grid status glyphs, the habit detail header, goals, Progresso, Astra blocks and onboarding previews retain their separate components.

Web Vitest measures the production row with compiled CSS at 320 and 1352, in both themes, at normal and 200% text. It checks the visible check, border token, row fill, partial progress and focus. Android Vitest mounts the row across the same width, theme and text-scale axes and checks native styles, state colours and focus. Habit detail composition tests cover the wrapper and native fill override. Device rendering and whole-screen visual inspection remain outside these component tests.

# Habit view surfaces

The Hoje, Todos and Geral restoration follows production behaviour and the existing redesign
primitives. Each surface below has a web and Android owner. The shared account fixture includes
overdue, current, future, recurring, completed, general and nested habits.

| Surface | Web owner | Android owner | Required states and behaviour |
| --- | --- | --- | --- |
| View switch | `components/today/habit-view-switch.tsx` | `components/today/habit-view-switch.tsx` | Three localized single-word segments, selected state, keyboard navigation, phone and foldable widths |
| Header and date navigation | `app/(app)/today-page-view.tsx`, `today-shell.tsx` | `app/(tabs)/index.tsx`, `components/today/today-date-control.tsx` | Pager, boundary notice and proactive line only in Hoje; search and list menu in every view |
| Saved view and entry points | `app/(app)/use-today-page.tsx`, `components/shell/destination-shell.tsx` | `app/(tabs)/index.tsx`, `components/navigation/destination-tab-bar.tsx` | Persisted active view, return from another destination, explicit date links, web command palette |
| Scoped search | `app/(app)/today-shell.tsx`, `today-page-view.tsx`, `use-today-habits-data.ts` | `app/(tabs)/index.tsx`, `components/today/today-date-control.tsx` | Header entry at every width, separate from the web sidebar command palette; in-place debounced search preserves view, date and frequency; filtered rows retain selection and actions; clear on account, view or selected-day changes; close clears filtering |
| Todos membership and ordering | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | Scheduled roots, overdue group first, due-date groups, completed one-time habits behind Show completed |
| Geral membership | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | No-set-day roots independent of the Hoje preference, completed habits behind Show completed |
| Nested habit panels | `components/habits/habit-list.tsx`, `habit-list/tree-helpers.ts` | `components/habit-list.tsx` | Child position order, collapse, drill navigation, child progress and parent settlement including future children in list views |
| Row actions | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | Existing log, unlog, skip, reschedule, edit, duplicate, delete, move-parent, add-child, detail and selection handlers; eligibility and offline refusals retained |
| Selection and bulk actions | `app/(app)/use-today-selection.ts` | `app/(tabs)/use-today-selection.ts` | Visible-tree select all, cascade, confirmation, current account day in Todos and Geral, clear when changing view |
| Creation | `components/habits/create-habit-modal.tsx` | `components/habits/create-habit-modal.tsx` | Existing creation surface; no-set-day default only in Geral; no stale Hoje date in list views |
| Loading, error and empty lists | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | Existing skeleton and retry; view-specific empty title, create and Astra actions; day completion state only in Hoje |
| Design contract and regression evidence | `DESIGN.md`, `canvas/Orbit Hoje.dc.html`, web behaviour and geometry tests, layout guard | Android behaviour and geometry tests | Shared normalized fixtures for all three views, persisted selection, default creation and widths from compact phones through foldables |

Row action and creation surfaces retain their existing redesign components. Restoring their view
inputs and handlers is the required change; the restoration does not restyle those components.

At 21 roots, web Todos and Geral virtualize offscreen family rendering with `content-visibility`
and an intrinsic size reservation, retaining natural family height and keyboard access. Geral
temporarily renders every panel while dragging so reorder measurements use the whole list.
Android retains its virtualized FlatList owners.

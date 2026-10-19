> **At a glance** - interaction fill owners, neighbour clearance and platform geometry coverage.

# Interaction fill clearance

`INTERACTION_FILL_CLEARANCE` in `packages/shared/src/theme/interaction.ts` is the existing 4px
spacing step. Hover, held press and keyboard focus share the same clearance contract in `DESIGN.md`.

| Surface | Web owner | Android owner | Reserved clearance |
|---|---|---|---|
| Habit rename heading | `components/habits/habit-detail-screen.tsx`, `app/globals.css` | `components/habits/habit-detail-screen.tsx` | 12px between text rows permits the 8px block fill extension; the 12px inline extension leaves 4px inside the page inset |
| Column list rows and column check rows | `components/ui/list-row.tsx`, `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx`, `components/ui/check-row.tsx` | 12px inline extension leaves 4px inside the page inset; a trailing row action gets a 4px gap and no fill extension toward it |
| Personal check rows, including calendar selection | `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/check-row.tsx` | A real 48px checkbox target, a 4px label gap and an internal fill; the label reserves its block padding in layout |
| About account fact | `app/(app)/about/page.tsx`, shared column CSS | `app/about.tsx` | 12px inline extension leaves 4px inside the page inset |
| Calendar import events | `components/calendar-sync/calendar-sync-event-row.tsx`, shared column CSS | `components/calendar-sync/calendar-sync-event-row.tsx` | 12px inline extension leaves 4px inside the page inset |
| Pills and icon pills | `components/ui/pill-button.tsx`, `app/globals.css` | `components/ui/pill-button.tsx` | Existing 12px action gaps accommodate focus rings; the 2px hit extension paints nothing |
| Compact focus groups | Weekday pills, segmented controls, profile theme choices and explicit control focus utilities | Existing inset focus pressables on the corresponding surfaces | Explicit outward focus offsets become inset where adjacent controls can have a 4px gap |
| Chips | `components/ui/chip.tsx`, `app/globals.css` | `components/ui/chip.tsx` | Existing internal fills and inset focus indicators |
| Narrow month grid | `components/dates/month-grid.tsx`, `components/dates/day-cell.tsx`, `app/globals.css` | `components/dates/month-grid.tsx`, `components/dates/day-cell.tsx` | A 4px inset on each side of the circular paint preserves full-column targets at every width; the 34px status disc shrinks with the circle on narrow columns |
| Calendar day detail | `components/calendar/calendar-day-detail.tsx` | `app/(tabs)/calendar/_components/calendar-day-detail.tsx` | A 4px row gap separates contained label and checkbox fills; the card retains 24px padding |
| Calendar time grid | `components/calendar/calendar-time-grid.tsx` | `app/(tabs)/calendar/_components/calendar-time-grid.tsx` | Timed lanes retain 4px separation and inset focus; all-day rows retain 4px gaps and column padding; full-column date headers paint inside their own grid cells |
| Calendar import selection | `components/calendar-sync/calendar-picker-section.tsx`, `components/ui/check-row.tsx` | Same paths | Shared personal rows reserve label padding and a 4px checkbox gap; event fills retain 4px before their separate trailing action |
| Goal titles and expanded personal text | `components/chat/goal-list-card.tsx`, `components/ui/personal-text-details.tsx` | Same paths | The 8px negative inline margin is part of the control box; the adjacent 12px content gap retains 4px and focus stays inset |
| Toast text action | `components/ui/toast.tsx` | `components/ui/app-toast.tsx` | The 4px negative margin on the text action is inside the toast padding and retains clearance from adjacent content; the close control is a PillButton |

Owners are relative to each app. Negative offsets on calendar time markers and decorative habit
progress SVGs do not paint interaction fills. ActionRow's negative vertical margin compensates its
transparent hit padding. Small pill hit pseudo-elements remain transparent in every interaction state.

The web layout inventory visits destination, pushed, authentication, onboarding and public screens
at 320, 412, 600, 1024 and 1352px in both locales. It checks hover, held press and focus-visible using
computed paint and geometry. Structural wrappers are not separate visual neighbours; their text,
graphics and painted controls are. PersonalTextAction's visual copy belongs to its overlaid control.
The title's Chromium unit regression exercises the same inspector without an app server.

The inspector measures painted boxes and visible text or graphics on both sides. Transparent
target-only geometry is excluded. Text neighbours use their text ranges rather than transparent
control boxes. Adjacent time-grid date headers are explicitly marked as contained cell paint:
their fills and inset focus indicators remain inside their unchanged column boxes. The exemption
permits adjoining cell boundaries, never a fill extending outside its cell or covering content.

Android's style regression renders the actual habit header with its emoji selector and summary,
and the shared row, pill, icon pill and chip with adjacent controls. Yoga measures the resolved
pressed and focused styles, including their painted descendants and outlines. This proves the
style layout contract; it does not claim device rendering evidence.

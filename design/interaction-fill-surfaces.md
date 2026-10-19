> **At a glance** - interaction fill owners, neighbour clearance and platform geometry coverage.

# Interaction fill clearance

`INTERACTION_FILL_CLEARANCE` in `packages/shared/src/theme/interaction.ts` is the existing 4px
spacing step. Hover, held press and keyboard focus share the same clearance contract in `DESIGN.md`.

| Surface | Web owner | Android owner | Reserved clearance |
|---|---|---|---|
| Habit rename heading | `components/habits/habit-detail-screen.tsx`, `app/globals.css` | `components/habits/habit-detail-screen.tsx` | 12px between text rows permits the 8px block fill extension; the 12px inline extension leaves 4px inside the page inset |
| Grouped list rows | `components/ui/list-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx` | Paint and the single focus indicator sit 4px inside each row, retaining the full target and existing content padding |
| Column list rows and column check rows | `components/ui/list-row.tsx`, `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx`, `components/ui/check-row.tsx` | 12px inline extension leaves 4px inside the page inset; a trailing row action gets a 4px gap and no fill extension toward it |
| Personal check rows, including calendar selection | `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/check-row.tsx` | A real 48px checkbox target, a 4px label gap and an internal fill; the label reserves its block padding in layout |
| About account fact | `app/(app)/about/page.tsx`, shared column CSS | `app/about.tsx` | 12px inline extension leaves 4px inside the page inset |
| Calendar import events | `components/calendar-sync/calendar-sync-event-row.tsx`, shared column CSS | `components/calendar-sync/calendar-sync-event-row.tsx` | 12px inline extension leaves 4px inside the page inset |
| Pills and icon pills | `components/ui/pill-button.tsx`, `app/globals.css` | `components/ui/pill-button.tsx` | Existing 12px action gaps accommodate focus rings; the 2px hit extension paints nothing |
| Compact focus groups | Weekday pills, segmented controls, profile theme choices and explicit control focus utilities | Existing inset focus pressables on the corresponding surfaces | Explicit outward focus offsets become inset where adjacent controls can have a 4px gap |
| Chips | `components/ui/chip.tsx`, `app/globals.css` | `components/ui/chip.tsx` | Existing internal fills and inset focus indicators |
| Month and range day grids | `components/calendar/calendar-grid.tsx`, `components/calendar/calendar-range-view.tsx`, `components/dates/month-grid.tsx`, `components/dates/day-cell.tsx` | `app/(tabs)/calendar/_components/calendar-grid.tsx`, `app/(tabs)/calendar/_components/calendar-range-view.tsx`, `components/dates/month-grid.tsx`, `components/dates/day-cell.tsx` | Full-column targets stay transparent; circular position rings and 34px status discs retain their size, and every state paints inside its column |
| Calendar day detail | `components/calendar/calendar-day-detail.tsx` | `app/(tabs)/calendar/_components/calendar-day-detail.tsx` | A 4px row gap separates contained label and checkbox fills; the card retains 24px padding |
| Calendar month navigation | `app/(app)/calendar/_components/calendar-shell.tsx` | `app/(tabs)/calendar/_components/calendar-shell.tsx` | 4px between previous, title group and next controls, and between the title and picker; every target remains at least 48px |
| Composer trailing actions | `components/shell/composer.tsx` | `components/shell/composer.tsx` | Add or Stop and Send share a 4px gap inside the field; each target remains 48px, with an inset focus indicator |
| Destination tab focus | `components/navigation/bottom-tab-bar.tsx`, `app/globals.css` | `components/navigation/bottom-tab-bar.tsx` | The single focus perimeter sits 4px inside the full-column target, including at the page edge and in forced colors |
| Unscheduled habit child explanation | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-row.tsx` | Web reserves 4px above the explanation; Android's existing row spacing already reserves the same clearance |
| Calendar time grid | `components/calendar/calendar-time-grid.tsx` | `app/(tabs)/calendar/_components/calendar-time-grid.tsx` | Timed lanes retain 4px separation and inset focus; all-day rows retain 4px gaps and column padding; full-column date headers paint inside their own grid cells |
| Calendar import selection | `components/calendar-sync/calendar-picker-section.tsx`, `components/ui/check-row.tsx` | Same paths | Shared personal rows reserve label padding and a 4px checkbox gap; event fills retain 4px before their separate trailing action |
| Goal titles and expanded personal text | `components/chat/goal-list-card.tsx`, `components/ui/personal-text-details.tsx` | Same paths | The 8px negative inline margin is part of the control box; the adjacent 12px content gap retains 4px and focus stays inset |
| Toast text action | `components/ui/toast.tsx` | `components/ui/app-toast.tsx` | The 4px negative margin on the text action is inside the toast padding and retains clearance from adjacent content; the close control is a PillButton |
| Login legal sentence, including the callback email step | `app/(auth)/login/email-step.tsx` | `components/auth/email-step.tsx`, `app/login-styles.ts` | Terms and privacy links share 24px line spacing; web labels stay whole so their native focus outlines cannot span neighbouring links |

Owners are relative to each app. Negative offsets on calendar time markers and decorative habit
progress SVGs do not paint interaction fills. ActionRow's negative vertical margin compensates its
transparent hit padding. Small pill hit pseudo-elements remain transparent in every interaction state. Habit rename and
column rows retain separate transparent 16px inline hit extensions around their 12px paint.
The row action boundary keeps the transparent extension inside its separate action gap.

The web layout inventory visits destination, pushed, authentication, onboarding and public screens
at 320, 412, 600, 1024 and 1352px in both locales. It checks hover, held press and focus-visible using
computed paint and geometry. Structural wrappers are not separate visual neighbours; their text,
graphics and painted controls are. PersonalTextAction's visual copy belongs to its overlaid control.
The title's Chromium unit regression exercises the same inspector without an app server.
Neighbours share the nearest fixed-position ancestor, including the control itself, or the
document when there is none. Shell scroller content and pinned bottom chrome are separate paint
regions. An aria-hidden, non-interactive SVG inside the same input wrapper belongs to that field.
Only explicitly marked library focus guards are skipped. Captured control identities survive
focus-opened overlays; the reached control is measured and the overlay dismissed before continuing.
Keyboard modality does not traverse an unrelated input. Each case reports the inspected-control
and skipped-sentinel counts, and bounded active-control reads retry once before failing.

The inspector measures painted boxes and visible text or graphics on both sides. Transparent
target-only geometry is excluded. Text neighbours use their text ranges rather than transparent
control boxes. Adjacent time-grid date headers are explicitly marked as contained cell paint:
their fills and inset focus indicators remain inside their unchanged column boxes. The exemption
permits adjoining cell boundaries, never a fill extending outside its cell or covering content.

Android's style regression renders the actual habit header with its emoji selector and summary,
and the shared row, pill, icon pill and chip with adjacent controls. Yoga measures the resolved
pressed and focused styles, including their painted descendants and outlines. This proves the
style layout contract; it does not claim device rendering evidence.

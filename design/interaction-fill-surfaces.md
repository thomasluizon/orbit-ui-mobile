> **At a glance** - interaction fill owners, neighbour clearance and platform geometry coverage.

# Interaction fill clearance

`INTERACTION_FILL_CLEARANCE` in `packages/shared/src/theme/interaction.ts` is the existing 4px
spacing step. Hover, held press and keyboard focus share the same clearance contract in `DESIGN.md`.

| Surface | Web owner | Android owner | Reserved clearance |
|---|---|---|---|
| Habit rename heading | `components/habits/habit-detail-screen.tsx`, `app/globals.css` | `components/habits/habit-detail-screen.tsx` | The 8px row gaps reserve the 4px block fill extension without growing the header; the 12px inline extension leaves 4px inside the page inset |
| Grouped list rows | `components/ui/list-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx` | Paint and the single focus indicator sit 4px inside each row, retaining the full target and existing content padding |
| Column list rows and column check rows | `components/ui/list-row.tsx`, `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx`, `components/ui/check-row.tsx` | 12px inline extension leaves 4px inside the page inset; a trailing row action gets a 4px gap and no fill extension toward it |
| Personal check rows, including calendar selection | `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/check-row.tsx` | A 48px checkbox target, a 4px paint gap and reserved label block padding; the calendar day circle keeps its 24px layout width and 16px end inset, with transparent hit expansion into the row padding |
| About account fact | `app/(app)/about/page.tsx`, shared column CSS | `app/about.tsx` | 12px inline extension leaves 4px inside the page inset |
| Calendar import events | `components/calendar-sync/calendar-sync-event-row.tsx`, shared column CSS | `components/calendar-sync/calendar-sync-event-row.tsx` | 12px inline extension leaves 4px inside the page inset |
| Pills and icon pills | `components/ui/pill-button.tsx`, `app/globals.css` | `components/ui/pill-button.tsx` | Existing 12px action gaps accommodate focus rings; the 2px hit extension paints nothing |
| Daily summary and proactive Astra line | `components/today/today-astra-line.tsx`, `app/globals.css` | `components/today/today-astra-line.tsx` | The full-line action contains its hover and pressed overlay and uses an inset focus indicator |
| Compact focus groups | Weekday pills, segmented controls, profile theme choices and explicit control focus utilities | Existing inset focus pressables on the corresponding surfaces | Explicit outward focus offsets become inset where adjacent controls can have a 4px gap |
| Chips | `components/ui/chip.tsx`, `app/globals.css` | `components/ui/chip.tsx` | Existing internal fills and inset focus indicators |
| Month and range day grids | `components/calendar/calendar-grid.tsx`, `components/calendar/calendar-range-view.tsx`, `components/dates/month-grid.tsx`, `components/dates/day-cell.tsx` | `app/(tabs)/calendar/_components/calendar-grid.tsx`, `app/(tabs)/calendar/_components/calendar-range-view.tsx`, `components/dates/month-grid.tsx`, `components/dates/day-cell.tsx` | Full-column targets stay transparent; circular position rings and 34px status discs retain their size, and every state paints inside its column |
| Calendar day detail | `components/calendar/calendar-day-detail.tsx` | `app/(tabs)/calendar/_components/calendar-day-detail.tsx` | Touching rows retain their drawn layout and 16px inline label insets; paint sits 4px inside the block edges and checkbox target; the card retains 24px padding |
| Calendar month navigation | `app/(app)/calendar/_components/calendar-shell.tsx` | `app/(tabs)/calendar/_components/calendar-shell.tsx` | Month targets keep their gapless layout; chevron and picker paint sits 4px inside each target, which remains at least 48px |
| Composer trailing actions | `components/shell/composer.tsx` | `components/shell/composer.tsx` | Add or Stop and Send share a 4px gap inside the field; each target remains 48px, with one inset primary focus indicator and an opaque canvas separator on accent fills |
| Destination tab focus | `components/navigation/bottom-tab-bar.tsx`, `app/globals.css` | `components/navigation/bottom-tab-bar.tsx` | The single focus perimeter sits 4px inside the full-column target, including at the page edge and in forced colors |
| Wide sidebar brand controls | `components/shell/shell-wide.tsx` | Web-only navigation chrome | The 48px bell and collapse targets retain their 12px gap; a 4px trailing row inset reserves clearance from the lockup, and focus stays inset |
| Unscheduled habit child explanation | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` | Both platforms reserve 8px above the explanation, covering the menu control's outward focus indicator plus the shared clearance |
| Progresso bar chart | `components/ui/bar-chart.tsx` | `components/ui/bar-chart.tsx` | Shared bar geometry reserves 4px at both block edges inside the unchanged full-height targets; narrow slots inset their fill enough to retain 4px before neighbouring bars |
| Calendar time grid | `components/calendar/calendar-time-grid.tsx` | `app/(tabs)/calendar/_components/calendar-time-grid.tsx` | Timed lanes retain 4px separation and inset focus; all-day rows retain 4px gaps and column padding; full-column date targets keep rounded hover, press and focus paint inset by the shared 4px clearance from their own cell edges and the pinned time gutter |
| Calendar import selection | `components/calendar-sync/calendar-picker-section.tsx`, `components/ui/check-row.tsx` | Same paths | Shared personal rows reserve label padding and a 4px checkbox gap; event fills retain 4px before their separate trailing action |
| Goal titles and expanded personal text | `components/chat/goal-list-card.tsx`, `components/ui/personal-text-details.tsx` | Same paths | The 8px negative inline margin is part of the control box; the adjacent 12px content gap retains 4px and focus stays inset |
| Toast text action | `components/ui/toast.tsx` | `components/ui/app-toast.tsx` | The 4px negative margin on the text action is inside the toast padding and retains clearance from adjacent content; the close control is a PillButton |
| Login legal sentence, including the callback email step | `app/(auth)/login/email-step.tsx` | `components/auth/email-step.tsx`, `app/login-styles.ts` | Terms and privacy links share 24px line spacing; web labels stay whole so their native focus outlines cannot span neighbouring links |

Owners are relative to each app. Negative offsets on calendar time markers and decorative habit
progress SVGs do not paint interaction fills. ActionRow's negative vertical margin compensates its
transparent hit padding. Small pill hit pseudo-elements remain transparent in every interaction state. Habit rename and
column rows retain separate transparent 16px inline hit extensions around their 12px paint.
The row action boundary keeps the transparent extension inside its separate action gap.
Geometry checks measure transparent reach separately from paint. Fill and focus inspectors follow
the actual element or pseudo-element owner, including in forced colors, while row content keeps
its drawn insets and calendar navigation keeps its drawn position.

The web layout inventory visits destination, pushed, authentication, onboarding and public screens
at 320, 412, 600, 1024 and 1352px in both locales. It checks hover, held press and focus-visible using
computed paint and geometry. Structural wrappers are not separate visual neighbours; their text,
graphics and painted controls are. PersonalTextAction's visual copy belongs to its overlaid control.
The title's Chromium unit regression exercises the same inspector without an app server.
Neighbours share the nearest fixed-position ancestor, including the control itself, or the
document when there is none. Shell scroller content and pinned bottom chrome are separate paint
regions. An aria-hidden, non-interactive SVG inside the same input wrapper belongs to that field.
Only explicitly marked library focus guards are skipped. The inventory captures each control's
role, accessible name and occurrence order. A control recreated after an overlay closes is rebound
once against that inventory; a missing identity fails. Every captured control is visited once.
The reached control is measured and the overlay dismissed before continuing.
A new conversation closes through its localized header control, preserving the draft and underlying
route; other entered overlays use Escape. Focus transfers wait for the reached control, and an
off-screen skip link is measured at that destination rather than treated as still visible.
Composer textareas measure their explicitly marked input-row paint owner, including after either
focus transfer; the mounted-owner regression rejects a neighbour within 2px of that row.
When the conversation loads on demand, its dialog temporarily holds focus. The guard waits for
the focused composer input or disabled-state composer root before measuring its paint. The wait
retains the bounded action timeout, and a collision after loading still fails.
Graphics clipped by a screen-reader-only ancestor are not visible neighbours.
Keyboard modality does not traverse an unrelated input. Each case reports the inspected-control
and skipped-sentinel counts, and bounded active-control reads retry once before failing.

The inspector measures painted boxes and visible text or graphics on both sides. Transparent
target-only geometry is excluded. Text neighbours use their text ranges rather than transparent
control boxes. Adjacent time-grid date headers are explicitly marked as contained cell paint:
their fills and inset focus indicators remain inside their unchanged column boxes. The header's
empty pinned gutter corner is a painted neighbour when horizontal scrolling brings it under a
column. Header feedback sits 4px inside the target with the target's 8px radius; static grid lines
belong to the containing cell on both platforms. The exemption permits adjoining cell boundaries, never a
fill extending outside its cell or covering content. Chromium unit cases measure all seven week
headers in both locales at 320, 412, 600, 1024 and 1352px during hover, held press and keyboard
focus. Android presses each mounted header and checks all four resolved fill insets against the
shared clearance while keeping the column width and day action.

Android's style regression renders the actual habit header with its emoji selector and summary,
and the shared row, pill, icon pill and chip with adjacent controls. Yoga measures the resolved
pressed and focused styles, including their painted descendants and outlines. This proves the
style layout contract; it does not claim device rendering evidence.
The habit detail composer retains the screen gutter on both sides of its field at every width,
including in the capped wide column. The mounted shell style cases cover both locales while
pressed and focused, retain the field's size and measure its 12px gap to the retry action.

The Progresso fixture supplies zero, partial and complete bars. The inspector measures the marked
SVG paths, including block clearance inside the active column, rather than the transparent SVG
viewport. Chromium unit cases exercise hover and held press in both locales and reject a bar
translated into the fill edge. The calendar inventory also opens Semana and measures all seven
header controls. Android presses the mounted chart and measures its resolved fill against the
rendered bar paths and both neighbours at compact and wide plot widths.

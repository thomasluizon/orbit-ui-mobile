> **At a glance** - interaction fill owners, neighbour clearance and platform geometry coverage.

# Interaction fill clearance

`INTERACTION_FILL_CLEARANCE` in `packages/shared/src/theme/interaction.ts` is the existing 8px
spacing step. Hover, held press and keyboard focus share the same clearance contract in `DESIGN.md`.

| Surface | Web owner | Android owner | Reserved clearance |
|---|---|---|---|
| Habit row body and sibling actions | `components/habits/habit-row.tsx`, `app/globals.css` | `components/habits/habit-row.tsx`, `habit-row-styles.ts` | Body feedback replaces the complete radius-20 row surface; at least 8px inline and 4px block content clearance, existing family neighbour gaps, independent check/disclosure/menu/selection feedback, strong body-feedback hairline, reversible web surface transition and immediate press/reduced-motion paint and a centred 28px check inside its 48px target; enlarged text and measured narrow metadata overflow retain first-title-line controls in the existing supporting-footer composition |
| Habit detail pencil, reading heading and history | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` | One 48px pencil owns its own fill; the static reading title retains 8px group gaps and has no rename fill. History's past, future, unavailable and loading branches share the main calendar's distributed 34px disc allocation inside unchanged full-column targets |
| Grouped list rows | `components/ui/list-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx` | Paint and the single focus indicator sit 8px inside each row, retaining the full target and existing content padding |
| Column list rows and column check rows | `components/ui/list-row.tsx`, `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/list-row.tsx`, `components/ui/check-row.tsx` | 8px inline extension leaves 8px inside the page inset; a trailing row action gets an 8px gap and no fill extension toward it |
| Personal check rows, including calendar selection | `components/ui/check-row.tsx`, `app/globals.css` | `components/ui/check-row.tsx` | A 48px checkbox target, an 8px paint gap and reserved label block padding; the calendar day circle keeps its 24px layout width and 16px end inset, with transparent hit expansion into the row padding |
| About account fact | `app/(app)/about/page.tsx`, shared column CSS | `app/about.tsx` | 8px inline extension leaves 8px inside the page inset |
| Calendar import events | `components/calendar-sync/calendar-sync-event-row.tsx`, shared column CSS | `components/calendar-sync/calendar-sync-event-row.tsx` | 8px inline extension leaves 8px inside the page inset |
| Pills and icon pills | `components/ui/pill-button.tsx`, `app/globals.css` | `components/ui/pill-button.tsx` | Existing 12px action gaps accommodate focus rings; the 2px hit extension paints nothing |
| Daily summary and proactive Astra line | `components/today/today-astra-line.tsx`, `app/globals.css` | `components/today/today-astra-line.tsx` | The full-line action contains its hover and pressed overlay and uses an inset focus indicator |
| Compact focus groups | Weekday pills, segmented controls, profile theme choices and explicit control focus utilities | Existing inset focus pressables on the corresponding surfaces | Explicit outward focus offsets become inset where adjacent controls can have an 8px gap |
| Menu item focus | `components/ui/dropdown-menu-content.tsx`, `app/globals.css` | `components/ui/dropdown-menu.tsx` | Web keeps the single focus indicator inside the existing row fill, preserving 8px before the account header and adjacent content; native row press paint remains inside its existing target |
| Chips | `components/ui/chip.tsx`, `app/globals.css` | `components/ui/chip.tsx` | Existing internal fills and inset focus indicators |
| Month and range day grids | `app/(app)/calendar/page.tsx`, `app/globals.css`, `components/calendar/calendar-grid.tsx`, `components/calendar/calendar-range-view.tsx`, `components/dates/month-grid.tsx`, `components/dates/month-selection.ts`, `components/dates/day-cell.tsx` | `app/(tabs)/calendar/_components/calendar-grid.tsx`, `app/(tabs)/calendar/_components/calendar-range-view.tsx`, `components/dates/month-grid.tsx`, `components/dates/month-selection.ts`, `components/dates/day-cell.tsx` | Full-column targets stay transparent; hover, press, focus and position rings paint on the existing 34px discs. Disc centres distribute within the existing 44px allocation. Seven 34px discs require at least 286px for 8px gaps. Below 364px, the web destination grid reclaims exactly 4px from its trailing inset, leaving 12px there and preserving the leading 16px gutter. The frame remains inside the 316px client column with no horizontal overflow, providing a 288px grid at 320px without changing the shell's 4px stable scrollbar |
| Calendar day detail | `components/calendar/calendar-day-detail.tsx` | `app/(tabs)/calendar/_components/calendar-day-detail.tsx` | Touching rows retain their drawn layout and 16px inline label insets; paint sits 8px inside the block edges and checkbox target; the card retains 24px padding |
| Calendar month navigation | `app/(app)/calendar/_components/calendar-shell.tsx` | `app/(tabs)/calendar/_components/calendar-shell.tsx` | Month targets keep their gapless layout; chevron and picker paint sits 8px inside each target, which remains at least 48px |
| Composer trailing actions | `components/shell/composer.tsx` | `components/shell/composer.tsx` | Paste or Clear, Add or Stop and Send share an 8px gap inside the field; the first slot shows Paste with empty text when clipboard reading is available and Clear with typed text while idle; each target remains 48px, with one inset primary focus indicator and an opaque canvas separator on accent fills |
| Destination tab focus | `components/navigation/bottom-tab-bar.tsx`, `app/globals.css` | `components/navigation/bottom-tab-bar.tsx` | The single focus perimeter sits 8px inside the full-column target, including at the page edge and in forced colors |
| Wide sidebar brand controls | `components/shell/shell-wide.tsx`, `components/navigation/notification-bell.tsx` | Web-only navigation chrome | The bell and collapse use IconButton: centred glyphs in 44px round paint with transparent 2px hit extensions. Their 12px paint gap and 14px lockup gap reserve at least 8px around interaction feedback inside the unchanged 232px and 96px rails. The passive inbox bell keeps the same 44px box and glyph and count placement, without an interactive target |
| Unscheduled habit child explanation | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` | Both platforms reserve 8px above the explanation, covering the menu control's outward focus indicator plus the shared clearance |
| Progresso bar chart and Astra metrics and period insight | `components/ui/bar-chart.tsx` | `components/ui/bar-chart.tsx` | Transparent full-height columns paint feedback only on their own bar using the existing selected-bar foreground. No column background or column focus box approaches a neighbour. One inset focus indicator follows the padded moving readout and the live radio `:focus-visible` state, including a keyboard press after pointer focus and dense series; all columns remain visible without horizontal scrolling |
| Calendar time grid | `components/calendar/calendar-time-grid.tsx` | `app/(tabs)/calendar/_components/calendar-time-grid.tsx` | Timed lanes retain 8px separation and inset focus; all-day rows retain 8px gaps and column padding; full-column date headers compose rounded hover, held press and focus paint inset by the shared 8px clearance from their cell edges and the pinned time gutter, with one inset focus indicator and press-only scale suppressed by reduced motion |
| Calendar import selection | `components/calendar-sync/calendar-picker-section.tsx`, `components/ui/check-row.tsx` | Same paths | Shared personal rows reserve label padding and an 8px checkbox gap; event fills retain 8px before their separate trailing action |
| Goal titles and expanded personal text | `components/chat/goal-list-card.tsx`, `components/ui/personal-text-details.tsx` | Same paths | The 8px negative inline margin is part of the control box; the adjacent content reserves 8px and focus stays inset |
| Toast text action | `components/ui/toast.tsx` | `components/ui/app-toast.tsx` | The 4px negative margin on the text action is inside the toast padding and retains clearance from adjacent content; the close control is a PillButton |
| Login legal sentence, including the callback email step | `app/(auth)/login/email-step.tsx` | `components/auth/email-step.tsx`, `app/login-styles.ts` | Terms and privacy links share 24px line spacing; web labels stay whole so their native focus outlines cannot span neighbouring links |

The composer slot reaches three surfaces on both platforms: the Hoje dock and habit detail dock
owned by `app/(app)/layout.tsx` on web and `app/_layout.tsx` on Android, and the full-screen Astra
conversation owned by `components/chat/conversation.tsx`. They all use `components/shell/composer.tsx`.
The slot swaps Paste and Clear without changing the attachment tray, Send target or pill radius.
When the whole placeholder cannot fit beside the text-action slot, both text actions move into the
existing Add menu: Paste is its first item with empty text, and Clear is its first item with typed
text. Empty and typed fields keep the same width. Placement
follows the measured placeholder at the current column width and text size. Recording, transcribing,
sending, offline and limit states omit both text actions.

Owners are relative to each app. Negative offsets on calendar time markers and decorative habit
progress SVGs do not paint interaction fills. ActionRow's negative vertical margin compensates its
transparent hit padding. Small pill hit pseudo-elements remain transparent in every interaction state. The habit pencil and
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
The destination sweep waits for interaction and overlay animations to settle, and measures each
dialog or menu as a foreground paint region. Its backdrop belongs behind that region. The shell
root in `components/shell/shell-wide.tsx` isolates page stacking so floating actions cannot cover
portalled menu items.
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
column. Header feedback sits 8px inside the target with the target's 8px radius; static grid lines
belong to the containing cell on both platforms. The exemption permits adjoining cell boundaries, never a
fill extending outside its cell or covering content. Chromium unit cases measure all seven week
headers in both locales at 320, 412, 600, 1024 and 1352px during hover, held press and keyboard
focus. Android presses each mounted header and checks all four resolved fill insets against the
shared clearance while keeping the column width and day action.

The web time grid uses horizontal snapping with the time gutter as scroll padding.
A day that fits the gutter-adjusted viewport, allowing its existing 4px trailing fill inset,
uses mandatory snapping and a leading-edge snap area to prevent a narrow free-pan strip. Its fractional, mid-column and
terminal offsets settle on a day boundary, retaining the header fill's 8px clearance.
A wider day uses proximity snapping and keeps its full header, any-time cell and hour column as covering snap areas, so the
reader can pan within the day to reach enlarged dates and every concurrent lane.
Vertical scrolling remains unsnapped. The opening position still selects today's column;
trailing space keeps the last boundary reachable in every week.
Android places the time gutter beside a separate, clipped horizontal column scroller in a flex row;
its columns cannot scroll beneath the gutter. Chromium shell cases mount the live week grid at
compact and wide widths, including 320px and doubled text, after small, mid-column and terminal
offsets while retaining arbitrary vertical offsets. Wheel, keyboard and scroll-into-view cases
retain their settled position through a refetch and a viewport-height change.
When a refetch shortens the pinned pane, web extends the hour tail and restores a clamped offset.
Android reserves the retained offset plus viewport height in both synchronized scroll containers.
Both retain upward scrolling after the pane or viewport changes.

The mounted native `calendar-time-grid.test.tsx` exercises the actual header and InsetFocusPressable
in both themes and locales. Its real installed Hover gesture uses the registry and event receiver
boundary, with guards for attachment to the complete header, non-canceling JS routing and lifecycle
cleanup. Cases retain overlapping hover, press and focus, cancellation, failure, independent columns,
remount, reduced motion and exact date activation. The detector attaches directly to the full control
inside the static grid-line wrapper; its states paint the separate radius-8 child with four-edge
clearance while the target stays transparent. The paired web owner test retains the
contained-cell and inset-focus markers and verifies that pointer and focus transitions leave date
selection unchanged until activation. Computed web hover and cell geometry remain owned by the
existing Chromium and layout checks; the native receiver and host styles do not execute Android
MotionEvents or prove device rendering.

Android's style regression renders the actual habit header with its static emoji, named pencil and summary,
and the shared row, pill, icon pill and chip with adjacent controls. Yoga measures the resolved
pressed and focused styles, including their painted descendants and outlines. This proves the
style layout contract; it does not claim device rendering evidence.
The habit detail composer retains the screen gutter on both sides of its field at every width,
including in the capped wide column. The mounted shell style cases cover both locales while
pressed and focused, retain the field's size and measure its 12px gap to the retry action.

The Progresso fixture supplies zero, partial and complete bars. Chromium checks that every hover
and held-press feedback mark has exactly its own bar bounds, including dense daily and weekly
series in both locales and forced colors. Each full-height target remains transparent. One visible
keyboard indicator follows the bounded moving readout, with space around its text. Android checks
the same bar ownership and foreground changes through mounted radio pressables and installed hover
gestures. The calendar inventory measures every month and range disc without exempting adjoining
cells from neighbour clearance.
Each native chart column keeps its existing radio Pressable inside a memoized installed Hover
gesture, attached to the complete target without a layout wrapper. Manual activation,
non-canceling JS callbacks and terminal cleanup keep hover separate from touch and keyboard
selection. The mounted chart owner routes complete events through the real registry and receiver,
covering independent columns, overlapping press and focus, stable date keys and removed-handler
cleanup. Feedback stays static, including under reduced motion. This JS boundary does not execute
native attachment or Android MotionEvents; physical pointer and accessibility acceptance remain
device checks.

## Habit completion shape

Completion hover and press paint only inside the visible 28px radius-12 check, never a halo.
Leaf completion and parent progress share this shape inside a transparent 48px target. Empty
checks use `bg-hover` while retaining their 1px status border and readable partial progress;
completed checks layer `bg-hover-opaque` over their resting neutral fill, beneath the checkmark.
One 2px focus outline follows the check shape with a 2px outward offset, inside the target.
Press retains scale 0.96 when motion is enabled and stays still with reduced motion. Disabled,
read-only and presentational selection checks add no interaction paint.

The clearance amendment also touches the paired `ui/pill-button`, web `ui/pill-action-style`,
`ui/list-row`, `ui/check-row`, `ui/segmented-control`, `ui/weekday-picker`, `shell/composer`,
calendar header owners and profile preference content. Focus feedback stays within pill paint;
composer content reserves the shared clearance at its field edges. Wide sidebar search and
collapsed navigation centre their glyphs, with 8px between row fills.

Loading month and range grids use the paired `dates/day-column-content.tsx` allocation, matching
the loaded disc size and centre without changing transparent columns. The paired notification
bell owners use the shared IconButton for every interactive placement, with a centred glyph and
an independent corner count. Web `interaction-surface-sweep.test.tsx` mounts all four destinations
and discovers their controls and opened sheets from the rendered DOM; it rejects adjoining cells
that fail clearance instead of exempting contained paint. Native style cases discover glyphs in
the mounted bell, icon primitive, calendar header, row actions and composer alongside the fill
owners above. These checks prove rendered web geometry and resolved native styles, not device paint.

The paired `navigation/root-notification-header.tsx` owners retain a 48px content allocation above
the existing 24px bottom inset when the bell paint becomes 44px; its transparent reach remains 48px.

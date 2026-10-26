# Calendar day surfaces

The day target spans its column and stays at least 44 high. DayCell owns the visible
circle, capped at 44 and centred in the column, with a concentric 34 status mark.
The calendar drawing governs the geometry; existing fill tokens retain their roles.

| Surface | Web owner | Android owner | States |
| --- | --- | --- | --- |
| Calendar month | calendar-grid and DayCell | calendar-grid and DayCell | none, partial, full, not scheduled, future, outside month, loggable, today, selected, today with selection, hover, press, keyboard focus |
| Astra habit month | chat/habit-month-card and calendar-grid | chat/habit-month-card and calendar-grid | done, missed, skipped, not scheduled, future, today, partial month, multiple months, signed refresh, stale and failed recovery |
| Calendar period | calendar-range-view and DayCell | calendar-range-view and DayCell | none, partial, full, not scheduled, today, leading empty slot |
| Habit month history | habit-detail-screen and DayCell | habit-detail-screen and DayCell | completed, missed, not scheduled, today, future, unavailable, outside month |
| Month loading grid | calendar-grid and Skeleton | calendar-grid and Skeleton | circular placeholders in full-column slots, seven tracks while profile preferences load |
| Period loading grid | calendar-range-view and Skeleton | calendar-range-view and Skeleton | circular placeholders in full-column slots |
| Weekday header | MonthGrid | MonthGrid | constant 8 gap to day rows, including narrow grids with no column gap |

Selected and focused controls have one position indicator. The calendar slot paints
nothing. Read-only dates retain selection targets in the month view; logging remains
bounded by the existing write window. The period figures retain their drawn 16 gap.
The unused range-picker presentation is removed.

The selected day loading card sizes each placeholder with the same habit row and
personal title as the loaded card. Complete dated lists already cached by Hoje supply
that shape while the month request is pending. Filtered and incomplete lists cannot
reserve a day. Recurring visibility and row ordering follow the loaded path.
Sizing entries travel only through the month loading map and its disabled skeleton
rows. Loaded day maps and week ranges use the range response and its logs. A week
day sheet keeps the loading state until that response arrives.

A day without cached schedule information reserves the empty-day line from the
calendar drawing. Its row count and title wrapping remain unknown until the response,
so an uncached nonempty day can still grow. Known empty days retain the same line.
Events pending an empty response reserve the localized empty-events line, including
its wrapping; incoming events may grow the section. Hidden sizing content is excluded
from accessibility and interaction, with named visible skeletons above it.

The web loggable day well transitions its background with the same control duration
and easing as the hover fill. Press keeps its immediate well removal. Selected,
future and today indicators retain their paint.

Astra habit-month blocks reuse the calendar projection, month grid and day cells.
The supplied local today and week start govern the saved snapshot. Compact grids
omit screen insets; each queried month keeps seven columns, and dates outside the
absolute query stay unavailable. Selecting a day opens that date on Calendário.
The dedicated habit-month refresh replaces the card and signed read metadata
together, with the existing named refresh icon and retained failure recovery.
Shared contract tests cover legacy text and range boundaries. Paired component
tests cover day states, navigation and refresh; the native screen test covers
routed dates, later requests and account changes.

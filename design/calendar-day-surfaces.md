# Calendar day surfaces

The day target spans its column and stays at least 44 high. DayCell owns the visible
circle, capped at 44 and centred in the column, with a concentric 34 status mark.
The calendar drawing governs the geometry; existing fill tokens retain their roles.

| Surface | Web owner | Android owner | States |
| --- | --- | --- | --- |
| Calendar month | calendar-grid and DayCell | calendar-grid and DayCell | none, partial, full, not scheduled, future, outside month, loggable, today, selected, today with selection, hover, press, keyboard focus |
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

A day without cached schedule information reserves the empty-day line from the
calendar drawing. Its row count and title wrapping remain unknown until the response,
so an uncached nonempty day can still grow. Known empty days retain the same line.
Events pending an empty response reserve the localized empty-events line, including
its wrapping; incoming events may grow the section. Hidden sizing content is excluded
from accessibility and interaction, with named visible skeletons above it.

The web loggable day well transitions its background with the same control duration
and easing as the hover fill. Press keeps its immediate well removal. Selected,
future and today indicators retain their paint.

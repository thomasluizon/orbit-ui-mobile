# Calendar day surfaces

The day target spans its column and stays at least 44 high. DayCell owns the visible
circle, capped at 44 and centred in the column, with a concentric 34 status mark.
The calendar drawing governs the geometry; existing fill tokens retain their roles.

| Surface | Web owner | Android owner | States |
| --- | --- | --- | --- |
| Calendar month | calendar-grid and DayCell | calendar-grid and DayCell | none, partial, full, not scheduled, future, outside month, loggable, today, selected, today with selection, hover, press, keyboard focus |
| Calendar period | calendar-range-view and DayCell | calendar-range-view and DayCell | none, partial, full, not scheduled, today, leading empty slot |
| Habit month history | habit-detail-screen and DayCell | habit-detail-screen and DayCell | completed, missed, not scheduled, today, future, unavailable, outside month |
| Month loading grid | calendar-grid and Skeleton | calendar-grid and Skeleton | circular placeholders in full-column slots |
| Period loading grid | calendar-range-view and Skeleton | calendar-range-view and Skeleton | circular placeholders in full-column slots |
| Weekday header | MonthGrid | MonthGrid | constant 8 gap to day rows, including narrow grids with no column gap |

Selected and focused controls have one position indicator. The calendar slot paints
nothing. Read-only dates retain selection targets in the month view; logging remains
bounded by the existing write window. The period figures retain their drawn 16 gap.
The unused range-picker presentation is removed.

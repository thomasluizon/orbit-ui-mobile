# Calendar header surface inventory

The header contract covers web and Android. Each view keeps a navigation row above the
selector and a shared clearance below it. The following states use that composition:

| Surface | Web owner | Android owner | Header responsibility |
| --- | --- | --- | --- |
| Month, ready/loading/empty/error | Calendar page, CalendarGrid | CalendarScreen, CalendarGrid | Month navigation, selector, body clearance |
| Week, ready/loading/empty/error | Calendar page, CalendarWeekView | CalendarScreen, CalendarWeekView | Week navigation, selector, body clearance |
| Range, ready/loading/empty/error | Calendar page, CalendarRangeView | CalendarScreen, CalendarRangeView | Fourteen-day navigation, selector, body clearance |
| Agenda, ready/loading/empty/error | Calendar page, CalendarAgendaView | CalendarScreen, CalendarAgendaView | Seven-day navigation, selector, body clearance |
| Profile loading, every selected view | CalendarProfileState | CalendarProfileState | Month skeleton navigation, selector, body clearance |
| Month picker | CalendarHeader, CalendarMonthPicker | CalendarHeader, CalendarMonthPicker | Preserve month selection and dismissal |
| Year picker | CalendarHeader, YearPicker | CalendarHeader, YearPicker | Preserve year selection, focus return and dismissal |

This is 38 platform-state surfaces: four view states in four views on two platforms,
plus profile loading and two pickers on each platform. Profile-load failure replaces the
calendar with its existing retry surface and has no calendar header.

Verification uses the owning screen tests, native layout measurements and Vitest Chromium
geometry checks. The hermetic layout spec covers all four ready views at 320, 412, 600 and
840 in both locales and themes. Its runner is the pull request layout workflow.

# Calendar day card surface inventory

This inventory covers the day card spacing contract on web and Android. Shared
row changes also reach the calendar picker and event disclosure sheet.

1. Selected-day card in the compact layout.
2. Selected-day card in the desktop layout.
3. Loggable habit rows with separate disclosure and checkbox controls.
4. Read-only habit rows.
5. Day title and mono completion summary.
6. Empty-day message.
7. Link row opening the selected day on Today.
8. Events heading.
9. Events loading skeleton.
10. Ready events with an empty result.
11. Ready events with populated rows.
12. Failed events message and retry row.
13. Events not-connected row.
14. Events Pro boundary row.
15. View-all events row.
16. Events disclosure sheet.
17. Calendar-picker rows using the personal CheckRow variant.

The owning components are `calendar-day-detail`, `calendar-day-events` and
`calendar-picker-section` in each platform's calendar feature. The shared
`check-row` and `event-row` components supply row geometry. The day-card unit and
geometry suites cover the owning composition; the calendar-picker suites cover
the shared consumer's interactions. The web layout spec covers the full route.

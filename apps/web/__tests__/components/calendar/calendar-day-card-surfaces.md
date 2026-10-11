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

## Habit row floor scope

The habit row floor change covers these eight surfaces:

1. Web compact logging rows.
2. Web desktop logging rows.
3. Web compact read-only rows.
4. Web desktop read-only rows.
5. Android compact logging rows.
6. Android wide logging rows.
7. Android compact read-only rows.
8. Android wide read-only rows.

Each surface includes timed and untimed parents and children, short and wrapped
personal titles, and normal and doubled text. Logging rows keep separate title
disclosure and checkbox controls; read-only rows keep title disclosure and their
status rings. Both modes show time or the existing no-set-time value beneath the
title. The owning day card components select the calendar-day CheckRow variant;
calendar-picker callers retain their default geometry.

The shared fixture passes through the calendar month schema and day-map producer.
Both owning geometry suites measure these surfaces. The hermetic
`calendar-day-habit-rows.spec.ts` covers the web route at compact and desktop
widths in both locales. Its execution belongs to the layout workflow.

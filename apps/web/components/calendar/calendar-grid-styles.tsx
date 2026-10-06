import { CALENDAR_GRID_GAP_CONTENT_BREAKPOINT, CALENDAR_MONTH_GRID_GEOMETRY } from '@orbit/shared/utils'

export function CalendarGridStyles() {
  return <style>{`
    .orbit-calendar-grid-card { --calendar-grid-gap: ${CALENDAR_MONTH_GRID_GEOMETRY.gap}px; }
    @container calendar-grid (width < ${CALENDAR_GRID_GAP_CONTENT_BREAKPOINT}px) {
      .orbit-calendar-grid-card { --calendar-grid-gap: 0px; }
    }
  `}</style>
}

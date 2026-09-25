import type { BarChartPoint } from '../contracts/display'
import type { CompletionSeries } from '../types/gamification'

function localCalendarDate(dateOnly: string): Date {
  return new Date(Number(dateOnly.slice(0, 4)), Number(dateOnly.slice(5, 7)) - 1, Number(dateOnly.slice(8, 10)))
}

export function mapCompletionSeries(series: CompletionSeries, locale: string): readonly BarChartPoint[] {
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  return series.points.map((point) => ({
    dateLabel: point.startDate === point.endDate
      ? formatter.format(localCalendarDate(point.startDate))
      : `${formatter.format(localCalendarDate(point.startDate))} - ${formatter.format(localCalendarDate(point.endDate))}`,
    rate: point.completionRate,
    scheduled: point.scheduled,
    completed: point.completed,
  }))
}

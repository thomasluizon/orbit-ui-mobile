import type { PeriodComparisonCard } from '../types/chat'
import { formatReadWindow } from './read-block-core'

type Translate = (key: string, values?: Record<string, string | number>) => string

export function formatFigurePeriod(window: { from: string; to: string }, locale: string, translate: Translate): string {
  const start = new Date(`${window.from}T12:00:00Z`)
  const end = new Date(`${window.to}T12:00:00Z`)
  if (start.getUTCDate() !== 1 || window.from.slice(0, 7) !== window.to.slice(0, 7)) return formatReadWindow(window, locale)
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start)
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  return end.getUTCDate() < lastDay ? translate('chat.figure.soFar', { period: month }) : month
}

export function comparisonPresentation(card: PeriodComparisonCard, locale: string, translate: Translate): { verdict: string; bars: { id: string; label: string; value: number; width: number }[] } {
  const current = formatFigurePeriod(card.current.window, locale, translate)
  const baseline = formatFigurePeriod(card.baseline.window, locale, translate)
  const direction = card.currentValue > card.baselineValue ? 'ahead' : card.currentValue < card.baselineValue ? 'behind' : 'equal'
  const maximum = Math.max(card.currentValue, card.baselineValue, 1)
  return {
    verdict: translate(`chat.figure.comparison.${card.unit}.${direction}`, {
      current, baseline, count: card.currentValue, value: new Intl.NumberFormat(locale).format(card.currentValue),
      previous: new Intl.NumberFormat(locale).format(card.baselineValue),
    }),
    bars: [
      { id: 'current', label: current, value: card.currentValue, width: card.currentValue / maximum * 100 },
      { id: 'baseline', label: baseline, value: card.baselineValue, width: card.baselineValue / maximum * 100 },
    ],
  }
}

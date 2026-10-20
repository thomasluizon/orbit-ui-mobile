import type { RescheduleSuggestion } from '../types/habit'
import { parseAPIDate } from './dates'
import { computeHabitFrequencyLabel, type HabitCardTranslationAdapter } from './habit-card-helpers'
import { formatLocaleDate } from './locale-format'

const PROPOSAL_DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }

export interface RescheduleProposalLabels {
  dateLabel: string
  timeLabel: string | null
  scheduleLabel: string | null
}

/** The date, time and frequency lines of an Astra reschedule proposal. The proposed date can
 *  fall in the next year, so the year shows only when it differs from the account's year. */
export function buildRescheduleProposalLabels(
  suggestion: RescheduleSuggestion,
  { locale, today, translate, formatTime }: Readonly<{
    locale: string
    today: Date
    translate: HabitCardTranslationAdapter
    formatTime: (time: string) => string
  }>,
): RescheduleProposalLabels {
  const dueDate = parseAPIDate(suggestion.dueDate)
  const dateOptions = dueDate.getFullYear() === today.getFullYear()
    ? PROPOSAL_DATE_OPTIONS
    : { ...PROPOSAL_DATE_OPTIONS, year: 'numeric' as const }
  return {
    dateLabel: formatLocaleDate(dueDate, locale, dateOptions),
    timeLabel: suggestion.dueTime ? formatTime(suggestion.dueTime) : null,
    scheduleLabel: computeHabitFrequencyLabel(
      {
        isGeneral: false,
        frequencyUnit: suggestion.frequencyUnit,
        frequencyQuantity: suggestion.frequencyQuantity,
        days: suggestion.days,
        isFlexible: false,
      },
      translate,
    ),
  }
}

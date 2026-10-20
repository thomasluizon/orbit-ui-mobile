import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { parseAPIDate } from '../utils/dates'
import { buildRescheduleProposalLabels } from '../utils/reschedule-proposal'
import { createMockRescheduleSuggestion } from './factories'

function translatorFor(messages: Record<string, unknown>) {
  return (key: string) => key.split('.').reduce<unknown>(
    (node, part) => (node as Record<string, unknown> | undefined)?.[part],
    messages,
  ) as string
}

const suggestion = createMockRescheduleSuggestion({
  dueDate: '2026-08-20',
  dueTime: '07:30:00',
  frequencyUnit: 'Day',
  frequencyQuantity: 1,
  days: ['Tuesday', 'Thursday'],
})
const today = parseAPIDate('2026-08-17')
const formatTime = (time: string) => `clock(${time})`

describe('buildRescheduleProposalLabels', () => {
  it('labels the proposed date, time and frequency in the profile language', () => {
    expect(buildRescheduleProposalLabels(suggestion, { locale: 'en', today, translate: translatorFor(en), formatTime })).toEqual({
      dateLabel: 'Thu, Aug 20',
      timeLabel: 'clock(07:30:00)',
      scheduleLabel: 'Tue, Thu',
    })
    expect(buildRescheduleProposalLabels(suggestion, { locale: 'pt-BR', today, translate: translatorFor(ptBR), formatTime })).toEqual({
      dateLabel: 'qui., 20 de ago.',
      timeLabel: 'clock(07:30:00)',
      scheduleLabel: 'Ter, Qui',
    })
  })

  it('adds the year only when the proposed date is outside the current year', () => {
    const nextYear = { ...suggestion, dueDate: '2027-01-05' }
    const labels = buildRescheduleProposalLabels(nextYear, { locale: 'en', today: parseAPIDate('2026-12-30'), translate: translatorFor(en), formatTime })
    expect(labels.dateLabel).toBe('Tue, Jan 5, 2027')
    const sameYear = buildRescheduleProposalLabels(nextYear, { locale: 'en', today: parseAPIDate('2027-01-02'), translate: translatorFor(en), formatTime })
    expect(sameYear.dateLabel).toBe('Tue, Jan 5')
  })

  it('omits the time without a due time and the frequency for a one time plan', () => {
    const oneTime = { ...suggestion, dueTime: null, frequencyUnit: null, frequencyQuantity: null, days: [] }
    expect(buildRescheduleProposalLabels(oneTime, { locale: 'en', today, translate: translatorFor(en), formatTime })).toEqual({
      dateLabel: 'Thu, Aug 20',
      timeLabel: null,
      scheduleLabel: null,
    })
  })
})

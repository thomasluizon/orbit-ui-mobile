import { IntlMessageFormat } from 'intl-messageformat'
import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import { describeHabitFlowSummary, type FlowValueFormat } from '../utils/habit-flow'
import { formatLocaleDate } from '../utils/locale-format'
import { formatOnboardingCadence, onboardingSummaryValue } from '../utils/onboarding-guided'
import type { OnboardingSchedule } from '../utils/onboarding'

const translate = (key: string, values?: Record<string, string | number>) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en)
  return String(new IntlMessageFormat(message as string, 'en').format(values))
}
const format: FlowValueFormat = { translate, locale: 'en', displayTime: (time) => (time ? `${time}h` : '') }

describe('guided habit flow summary', () => {
  const weeklyHabit = { itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 1, isFlexible: false, days: ['Monday'], monthDays: [], intervalWeeks: 1, isGeneral: false } as const

  it('states the repeat, the time and the reminder of a habit, with no length', () => {
    expect(describeHabitFlowSummary({ ...weeklyHabit, dueTime: '07:00', reminderEnabled: true }, format)).toEqual({
      type: en.habits.form.typeHabit,
      when: 'every Monday',
      time: '07:00h',
      duration: en.habits.flow.summary.noDuration,
      reminder: en.habits.flow.summary.withReminder,
      timed: true,
    })
  })

  it('states the date of a dated task, and the end of its length', () => {
    const summary = describeHabitFlowSummary({ itemType: 'task', dueDate: '2026-11-20', dueTime: '09:00', dueEndTime: '10:30', isGeneral: false }, format)
    expect(summary).toMatchObject({ type: en.habits.form.typeTask, when: formatLocaleDate('2026-11-20', 'en'), time: '09:00h', reminder: en.habits.flow.summary.noReminder })
    expect(summary.duration).toBe(translate('habits.flow.summary.until', { time: '10:30h' }))
  })

  it('states no date and no time for an undated item, even when the form still holds a date', () => {
    expect(describeHabitFlowSummary({ itemType: 'task', dueDate: '2026-11-20', isGeneral: true }, format)).toMatchObject({
      when: en.habits.flow.summary.noDate,
      time: en.habits.flow.summary.noTime,
      timed: false,
    })
  })
})

describe('guided onboarding summary', () => {
  const monday: OnboardingSchedule = { frequencyUnit: 'Week', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday'], isGeneral: false, isFlexible: false, dueTime: '07:00' }

  it('states the cadence with the time only when asked and the schedule has one', () => {
    expect(formatOnboardingCadence(monday, true, format)).toBe('every Monday at 07:00h')
    expect(formatOnboardingCadence(monday, false, format)).toBe('every Monday')
    expect(formatOnboardingCadence({ ...monday, dueTime: '' }, true, format)).toBe('every Monday')
    expect(formatOnboardingCadence({ ...monday, days: ['Monday', 'Thursday'] }, false, format)).toBe('every Monday and Thursday')
  })

  it('gives each row its own value: the habit, the repeat mode, the unit, the time, then the cadence', () => {
    expect(onboardingSummaryValue('what', monday, 'Read 10 pages', format)).toBe('Read 10 pages')
    expect(onboardingSummaryValue('unit', monday, 'Read', format)).toBe(en.onboarding.flow.when.units.week)
    expect(onboardingSummaryValue('unit', { ...monday, frequencyUnit: null }, 'Read', format), 'no unit reads as a week').toBe(en.onboarding.flow.when.units.week)
    expect(onboardingSummaryValue('time', monday, 'Read', format)).toBe('07:00h')
    expect(onboardingSummaryValue('time', { ...monday, dueTime: '' }, 'Read', format)).toBe(en.onboarding.flow.when.anyTime)
    expect(onboardingSummaryValue('days', monday, 'Read', format)).toBe('every Monday')
    expect(onboardingSummaryValue('mode', monday, 'Read', format)).toBe('Set days')
  })
})

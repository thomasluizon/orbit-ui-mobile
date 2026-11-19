import { describe, expect, it } from 'vitest'
import { answerHabitReminder, answerHabitTime, answerHabitWhen, formHoldsTimelessReminder, shiftCalendarDate, type HabitFlowFormPort } from '../utils/habit-flow-answers'

function port() {
  const calls: string[] = []
  const values: Record<string, unknown> = {}
  const target: HabitFlowFormPort = {
    setField: (field, value) => { values[field] = value; calls.push(`set:${field}`) },
    chooseItemType: (type) => { values.itemType = type; calls.push(`type:${type}`) },
    setOneTime: () => calls.push('oneTime'),
    setRecurring: () => calls.push('recurring'),
    setGeneral: () => calls.push('general'),
    setReminderEnabled: (enabled) => { values.reminder = enabled; calls.push(`reminder:${enabled}`) },
  }
  return { target, calls, values }
}

describe('shiftCalendarDate', () => {
  it('moves across month and year ends', () => {
    expect(shiftCalendarDate('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftCalendarDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftCalendarDate('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftCalendarDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('answerHabitWhen', () => {
  it('makes a task for today and for tomorrow', () => {
    const today = port()
    answerHabitWhen(today.target, 'today', '2026-11-13')
    expect(today.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-13', datePhrase: '', dateIssue: '' })
    expect(today.calls).toContain('oneTime')
    const tomorrow = port()
    answerHabitWhen(tomorrow.target, 'tomorrow', '2026-11-13')
    expect(tomorrow.values.dueDate).toBe('2026-11-14')
  })

  it('makes a daily habit that starts today for "every day"', () => {
    const everyDay = port()
    answerHabitWhen(everyDay.target, 'everyDay', '2026-11-13')
    expect(everyDay.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13' })
    expect(everyDay.calls).toContain('recurring')
  })

  it('makes an undated task that lives in General for "no date"', () => {
    const noDate = port()
    answerHabitWhen(noDate.target, 'noDate', '2026-11-13')
    expect(noDate.values.itemType).toBe('task')
    expect(noDate.calls).toContain('general')
    expect(noDate.values.dueDate).toBeUndefined()
  })
})

describe('answerHabitTime and answerHabitReminder', () => {
  it('sets the time and leaves the reminder alone', () => {
    const timed = port()
    answerHabitTime(timed.target, '08:00', false)
    expect(timed.values.dueTime).toBe('08:00')
    expect(timed.calls.some((call) => call.startsWith('reminder:'))).toBe(false)
  })

  it('clears the time and the end time for "no set time", and turns the reminder off only when no clock or repeat reminder remains', () => {
    const offsetsOnly = port()
    answerHabitTime(offsetsOnly.target, null, false)
    expect(offsetsOnly.values).toMatchObject({ dueTime: '', dueEndTime: '', reminder: false })
    const keepsReminder = port()
    answerHabitTime(keepsReminder.target, null, true)
    expect(keepsReminder.values).toMatchObject({ dueTime: '', dueEndTime: '' })
    expect(keepsReminder.calls.some((call) => call.startsWith('reminder:'))).toBe(false)
  })

  it('names the reminders that need no time', () => {
    expect(formHoldsTimelessReminder({ scheduledReminders: [], repeatReminder: null })).toBe(false)
    expect(formHoldsTimelessReminder({})).toBe(false)
    expect(formHoldsTimelessReminder({ scheduledReminders: [{ when: 'same_day', time: '06:30' }] })).toBe(true)
    expect(formHoldsTimelessReminder({ repeatReminder: { intervalMinutes: 30 } })).toBe(true)
  })

  it('turns the reminder on or leaves it off', () => {
    const on = port()
    answerHabitReminder(on.target, true)
    expect(on.values.reminder).toBe(true)
    const off = port()
    answerHabitReminder(off.target, false)
    expect(off.values.reminder).toBe(false)
  })
})

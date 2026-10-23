import { expect, it } from 'vitest'
import { daySummaryLogControl, habitReadStatusKey } from '../chat/day-summary-core'
import { createMockHabit } from './factories'

it('separates current write eligibility from the saved date and figures', () => {
  const habit = createMockHabit({ id: 'habit-one', createdAtUtc: '2026-09-01T00:00:00Z', frequencyUnit: 'Day', scheduledDates: ['2026-10-22'], dueDate: '2026-09-01' })
  const context = { date: '2026-10-22', today: '2026-10-22', timeZone: 'UTC', ready: true }
  expect(daySummaryLogControl(habit, false, context).writeAllowed).toBe(true)
  expect(daySummaryLogControl(habit, false, { ...context, date: '2026-10-23' }).writeAllowed).toBe(false)
  expect(daySummaryLogControl(habit, false, { ...context, date: '2026-09-01' }).writeAllowed).toBe(false)
  expect(daySummaryLogControl(habit, false, { ...context, ready: false }).writeAllowed).toBe(false)
  expect(daySummaryLogControl(undefined, true, context)).toMatchObject({ status: 'overdue', writeAllowed: false })
  expect(daySummaryLogControl({ ...habit, isLoggedInRange: true, isBadHabit: true }, false, context)).toMatchObject({ status: 'bad', undoUnavailable: true })
  expect(daySummaryLogControl(habit).writeAllowed).toBe(true)
  expect(daySummaryLogControl({ ...habit, isLoggedInRange: true, isFlexible: true }).undoUnavailable).toBe(true)
})

it('retains the server row status independently of live completion', () => {
  expect(habitReadStatusKey('done', false)).toBe('chat.habitList.logged')
  expect(habitReadStatusKey('done', true)).toBe('habits.statusDot.bad')
  expect(habitReadStatusKey('overdue', false)).toBe('chat.habitList.overdue')
  expect(habitReadStatusKey('none', false)).toBeNull()
})

import { describe, expect, it } from 'vitest'
import { resolveGoalDeadlineChoice, resolveMonthEndDeadline, resolveYearEndDeadline } from '../utils/goal-deadline-options'

describe('goal deadline quick options', () => {
  it('resolves the end of the month, with the leap day of February', () => {
    expect(resolveMonthEndDeadline(new Date('2026-11-13T12:00:00Z'), 'UTC')).toBe('2026-11-30')
    expect(resolveMonthEndDeadline(new Date('2028-02-10T12:00:00Z'), 'UTC')).toBe('2028-02-29')
    expect(resolveMonthEndDeadline(new Date('2027-02-10T12:00:00Z'), 'UTC')).toBe('2027-02-28')
  })

  it('keeps the last day of the month on that day', () => {
    expect(resolveMonthEndDeadline(new Date('2026-01-31T12:00:00Z'), 'UTC')).toBe('2026-01-31')
  })

  it('resolves the end of the year', () => {
    expect(resolveYearEndDeadline(new Date('2026-06-01T12:00:00Z'), 'UTC')).toBe('2026-12-31')
  })

  it('reads the month in the account time zone across a month end', () => {
    const instant = new Date('2026-12-01T02:00:00Z')
    expect(resolveMonthEndDeadline(instant, 'America/Sao_Paulo')).toBe('2026-11-30')
    expect(resolveMonthEndDeadline(instant, 'UTC')).toBe('2026-12-31')
  })

  it('reads the year in the account time zone across a year end', () => {
    const instant = new Date('2027-01-01T01:00:00Z')
    expect(resolveYearEndDeadline(instant, 'America/Sao_Paulo')).toBe('2026-12-31')
    expect(resolveYearEndDeadline(instant, 'Asia/Tokyo')).toBe('2027-12-31')
  })

  it('maps each choice to the value the current form sends', () => {
    const now = new Date('2026-11-13T12:00:00Z')
    expect(resolveGoalDeadlineChoice('none', now, 'UTC')).toBe('')
    expect(resolveGoalDeadlineChoice('monthEnd', now, 'UTC')).toBe('2026-11-30')
    expect(resolveGoalDeadlineChoice('yearEnd', now, 'UTC')).toBe('2026-12-31')
  })
})

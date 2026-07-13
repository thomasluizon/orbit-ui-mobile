import { describe, expect, it } from 'vitest'
import { createLocaleDateFormatters } from '../hooks/date-format-core'

const AUGUST_15_2028 = new Date(2028, 7, 15)

describe('createLocaleDateFormatters', () => {
  it('exposes the provided locale', () => {
    expect(createLocaleDateFormatters('pt-BR').locale).toBe('pt-BR')
  })

  it('orders numeric dates by locale convention', () => {
    expect(createLocaleDateFormatters('en').displayDateNumeric(AUGUST_15_2028)).toBe('08/15/2028')
    expect(createLocaleDateFormatters('pt-BR').displayDateNumeric(AUGUST_15_2028)).toBe('15/08/2028')
  })

  it('returns an empty string for null or undefined input', () => {
    const formatters = createLocaleDateFormatters('en')
    expect(formatters.displayDate(null)).toBe('')
    expect(formatters.displayDate(undefined)).toBe('')
    expect(formatters.displayDateNumeric(null)).toBe('')
    expect(formatters.displayDateMedium(undefined)).toBe('')
    expect(formatters.displayWeekdayDate(null)).toBe('')
    expect(formatters.displayMonthYear(undefined)).toBe('')
    expect(formatters.displayDateTime(null)).toBe('')
  })

  it('renders the long month name for the default display date', () => {
    expect(createLocaleDateFormatters('en').displayDate(AUGUST_15_2028)).toContain('August')
  })

  it('uses the short month name for medium dates', () => {
    const medium = createLocaleDateFormatters('en').displayDateMedium(AUGUST_15_2028)
    expect(medium).toContain('Aug')
    expect(medium).not.toContain('August')
  })

  it('switches weekday verbosity via the long flag', () => {
    const formatters = createLocaleDateFormatters('en')
    expect(formatters.displayWeekdayDate(AUGUST_15_2028)).not.toContain('August')
    expect(formatters.displayWeekdayDate(AUGUST_15_2028, true)).toContain('August')
  })
})

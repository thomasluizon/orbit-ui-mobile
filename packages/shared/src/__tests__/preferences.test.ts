import { describe, it, expect } from 'vitest'
import { parseShowGeneralOnTodayPreference } from '../utils/preferences'

describe('parseShowGeneralOnTodayPreference', () => {
  it('returns true for "true"', () => {
    expect(parseShowGeneralOnTodayPreference('true')).toBe(true)
  })

  it('returns false for "false"', () => {
    expect(parseShowGeneralOnTodayPreference('false')).toBe(false)
  })

  it('returns false for null', () => {
    expect(parseShowGeneralOnTodayPreference(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(parseShowGeneralOnTodayPreference('')).toBe(false)
  })

  it('returns false for arbitrary string', () => {
    expect(parseShowGeneralOnTodayPreference('yes')).toBe(false)
  })

  it('returns false for "TRUE" (case-sensitive)', () => {
    expect(parseShowGeneralOnTodayPreference('TRUE')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'

describe('show general on today preference', () => {
  it('defaults to false when the preference is unset', () => {
    expect(parseShowGeneralOnTodayPreference(null)).toBe(false)
  })

  it('returns true only for an explicit true value', () => {
    expect(parseShowGeneralOnTodayPreference('true')).toBe(true)
  })

  it('returns false for an explicit false value', () => {
    expect(parseShowGeneralOnTodayPreference('false')).toBe(false)
  })
})

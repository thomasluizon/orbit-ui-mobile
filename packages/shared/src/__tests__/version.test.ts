import { describe, expect, it } from 'vitest'
import { isVersionBelow } from '../utils/version'

describe('isVersionBelow', () => {
  it('returns true when current is strictly below the minimum', () => {
    expect(isVersionBelow('1.0.0', '1.1.0')).toBe(true)
    expect(isVersionBelow('0.9.0', '1.0.0')).toBe(true)
    expect(isVersionBelow('1.9.9', '2.0.0')).toBe(true)
    expect(isVersionBelow('1.0.0', '1.0.1')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isVersionBelow('1.0.0', '1.0.0')).toBe(false)
    expect(isVersionBelow('3.4.5', '3.4.5')).toBe(false)
  })

  it('returns false when current is above the minimum', () => {
    expect(isVersionBelow('2.0.0', '1.9.9')).toBe(false)
    expect(isVersionBelow('1.1.0', '1.0.9')).toBe(false)
  })

  it('pads shorter versions with zeros', () => {
    expect(isVersionBelow('1.0', '1.0.1')).toBe(true)
    expect(isVersionBelow('1.0.0', '1.0')).toBe(false)
    expect(isVersionBelow('1', '1.0.0')).toBe(false)
  })

  it('ignores non-numeric suffix segments', () => {
    expect(isVersionBelow('1.0.0-beta', '1.0.0')).toBe(false)
    expect(isVersionBelow('1.0.0', '1.0.0-rc1')).toBe(false)
    expect(isVersionBelow('1.0.0-beta', '1.0.1')).toBe(true)
  })

  it('fails safe (allows) for empty or unparseable current versions', () => {
    expect(isVersionBelow('', '1.0.0')).toBe(false)
    expect(isVersionBelow('abc', '1.0.0')).toBe(false)
    expect(isVersionBelow('not-a-version', '1.0.0')).toBe(false)
  })
})

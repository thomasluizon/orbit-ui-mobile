import { describe, expect, it } from 'vitest'
import { parseApiKeyExpiryUtc } from '../validation/api-key-form'

describe('parseApiKeyExpiryUtc', () => {
  it('interprets a minute-precision value as UTC', () => {
    expect(parseApiKeyExpiryUtc('2026-06-12T10:30')?.toISOString()).toBe(
      '2026-06-12T10:30:00.000Z',
    )
  })

  it('accepts an optional seconds component', () => {
    expect(parseApiKeyExpiryUtc('2026-06-12T10:30:45')?.toISOString()).toBe(
      '2026-06-12T10:30:45.000Z',
    )
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(parseApiKeyExpiryUtc('  2026-01-01T00:00  ')?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('produces the same instant regardless of local timezone semantics', () => {
    const parsed = parseApiKeyExpiryUtc('2026-06-12T00:00')
    expect(parsed?.getUTCHours()).toBe(0)
    expect(parsed?.getUTCDate()).toBe(12)
  })

  it.each([
    '',
    '   ',
    'tomorrow',
    '2026-06-12',
    '10:30',
    '2026-06-12 10:30',
    '2026-6-12T10:30',
    '2026-06-12T10:30:45.123',
    '2026-06-12T10:30Z',
  ])('rejects malformed input %j', (value) => {
    expect(parseApiKeyExpiryUtc(value)).toBeNull()
  })

  it.each([
    '2026-13-01T10:30',
    '2026-02-30T10:30',
    '2026-06-12T24:00',
    '2026-06-12T10:60',
    '2026-06-12T10:30:60',
  ])('rejects out-of-range calendar fields %j', (value) => {
    expect(parseApiKeyExpiryUtc(value)).toBeNull()
  })
})

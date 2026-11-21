import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiKeyExpiryDay, apiKeyExpiryFirstDay, apiKeyExpiryFromDay, apiKeyFormSchema, getApiKeyNameError, API_KEY_EXPIRY_DEFAULT, parseApiKeyExpiryUtc, validateApiKeyExpiry } from '../validation/api-key-form'

describe('getApiKeyNameError', () => {
  it.each(['', '   ', '\n\t'])('requires a name for %j', (name) => {
    expect(getApiKeyNameError(name)).toBe('orbitMcp.keyNameRequired')
  })

  it('validates the trimmed name at the production length boundary', () => {
    expect(getApiKeyNameError(`  ${'x'.repeat(50)}  `)).toBeNull()
    expect(getApiKeyNameError('x'.repeat(48) + '😀')).toBeNull()
    for (const name of ['x'.repeat(51), 'x'.repeat(49) + '😀']) {
      expect(getApiKeyNameError(name)).toBe('orbitMcp.keyNameMaxLength')
      const result = apiKeyFormSchema.safeParse({ name, expiresAt: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('orbitMcp.keyNameMaxLength')
    }
    const name = 'x'.repeat(48) + '😀'
    expect(apiKeyFormSchema.parse({ name: `  ${name}  `, expiresAt: '' }).name).toBe(name)
  })
})

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

describe('validateApiKeyExpiry', () => {
  const now = Date.parse('2099-12-31T23:59:00Z')

  it.each([API_KEY_EXPIRY_DEFAULT, '   '])('submits no expiry for blank input %j', (value) => {
    expect(validateApiKeyExpiry(value, now)).toEqual({ valid: true, expiresAtUtc: null })
  })

  it.each(['tomorrow', '2099-02-30T12:00', '2099-12-31T23:58', '2099-12-31T23:59'])('rejects malformed, past and current expiry %j', (value) => {
    expect(validateApiKeyExpiry(value, now)).toEqual({ valid: false })
  })

  it('accepts the next second as UTC and revalidates it after time advances', () => {
    const value = '2099-12-31T23:59:01'
    expect(validateApiKeyExpiry(value, now)).toEqual({
      valid: true, expiresAtUtc: '2099-12-31T23:59:01.000Z',
    })
    expect(validateApiKeyExpiry(value, now + 1000)).toEqual({ valid: false })
  })
})


describe('apiKeyFormSchema', () => {
  it('validates the chosen name together with the optional expiry', () => {
    expect(apiKeyFormSchema.safeParse({ name: '   ', expiresAt: '' }).success).toBe(false)
    expect(apiKeyFormSchema.safeParse({ name: 'x'.repeat(51), expiresAt: '' }).success).toBe(false)
    expect(apiKeyFormSchema.safeParse({ name: 'Personal key', expiresAt: 'tomorrow' }).success).toBe(false)
    expect(apiKeyFormSchema.parse({ name: '  Personal key  ', expiresAt: '' })).toEqual({ name: 'Personal key', expiresAt: null })
    expect(apiKeyFormSchema.parse({ name: 'x'.repeat(50), expiresAt: '2099-12-31T23:59' })).toEqual({ name: 'x'.repeat(50), expiresAt: '2099-12-31T23:59:00.000Z' })
  })
})

describe('the expiry day of the date picker', () => {
  const now = Date.UTC(2026, 10, 15, 22, 30)

  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now }) })
  afterEach(() => { vi.useRealTimers() })

  it.each([
    ['UTC', '2099-12-31', '2099-12-31T23:59:59'],
    ['Europe/Berlin', '2026-11-20', '2026-11-20T22:59:59'],
    ['America/Sao_Paulo', '2026-11-20', '2026-11-21T02:59:59'],
    ['America/Los_Angeles', '2026-11-20', '2026-11-21T07:59:59'],
    ['Asia/Tokyo', '2026-11-20', '2026-11-20T14:59:59'],
    ['Pacific/Kiritimati', '2026-11-20', '2026-11-20T09:59:59'],
    ['Europe/Berlin', '2027-03-28', '2027-03-28T21:59:59'],
    ['Europe/Berlin', '2027-10-31', '2027-10-31T22:59:59'],
  ])('turns a day picked in %s into the last second of that day there, in the UTC shape the API takes', (timeZone, day, draft) => {
    expect(apiKeyExpiryFromDay(day, timeZone)).toBe(draft)
    expect(validateApiKeyExpiry(apiKeyExpiryFromDay(day, timeZone), now)).toEqual({ valid: true, expiresAtUtc: `${draft}.000Z` })
    expect(apiKeyFormSchema.parse({ name: 'Script', expiresAt: apiKeyExpiryFromDay(day, timeZone) }).expiresAt).toBe(`${draft}.000Z`)
    expect(apiKeyExpiryDay(draft, timeZone)).toBe(day)
  })

  it('reads a day in the device zone when the account has no zone', () => {
    expect(apiKeyExpiryFromDay('2026-11-20', null)).toBe('2026-11-21T02:59:59')
    expect(apiKeyExpiryFromDay('2026-11-20')).toBe('2026-11-21T02:59:59')
    expect(apiKeyExpiryDay('2026-11-21T02:59:59', null)).toBe('2026-11-20')
    expect(apiKeyExpiryFirstDay(null, Date.UTC(2026, 10, 16, 1, 0))).toBe('2026-11-15')
  })

  it('keeps no day as a key that never expires', () => {
    expect(apiKeyExpiryFromDay('', 'Asia/Tokyo')).toBe(API_KEY_EXPIRY_DEFAULT)
    expect(validateApiKeyExpiry(apiKeyExpiryFromDay('', 'Asia/Tokyo'), now)).toEqual({ valid: true, expiresAtUtc: null })
  })

  it('reads the day back from a draft in the account zone, and reads no day from a draft the parser refuses', () => {
    expect(apiKeyExpiryDay(' 2099-12-31T10:00 ', 'UTC')).toBe('2099-12-31')
    expect(apiKeyExpiryDay('2099-12-31T23:59:59', 'Europe/Berlin')).toBe('2100-01-01')
    expect(apiKeyExpiryDay('', 'Europe/Berlin')).toBe('')
    expect(apiKeyExpiryDay('soon', 'Europe/Berlin')).toBe('')
  })

  it.each([
    ['UTC', Date.UTC(2026, 10, 15, 23, 0), '2026-11-15'],
    ['Asia/Tokyo', Date.UTC(2026, 10, 15, 23, 0), '2026-11-16'],
    ['America/Sao_Paulo', Date.UTC(2026, 10, 16, 1, 0), '2026-11-15'],
    ['America/Los_Angeles', Date.UTC(2026, 10, 16, 7, 59), '2026-11-15'],
  ])('offers today in %s as the first day, and that day is still a valid expiry', (timeZone, at, day) => {
    expect(apiKeyExpiryFirstDay(timeZone, at)).toBe(day)
    expect(validateApiKeyExpiry(apiKeyExpiryFromDay(apiKeyExpiryFirstDay(timeZone, at), timeZone), at).valid).toBe(true)
  })
})

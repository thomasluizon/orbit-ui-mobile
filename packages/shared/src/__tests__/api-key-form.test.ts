import { describe, expect, it } from 'vitest'
import { apiKeyFormSchema, getApiKeyNameError, API_KEY_EXPIRY_DEFAULT, parseApiKeyExpiryUtc, validateApiKeyExpiry } from '../validation/api-key-form'

describe('getApiKeyNameError', () => {
  it.each(['', '   ', '\n\t'])('requires a name for %j', (name) => {
    expect(getApiKeyNameError(name)).toBe('orbitMcp.keyNameRequired')
  })

  it('validates the trimmed name at the production length boundary', () => {
    expect(getApiKeyNameError(`  ${'x'.repeat(50)}  `)).toBeNull()
    expect(getApiKeyNameError('x'.repeat(51))).toBe('orbitMcp.keyNameMaxLength')
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

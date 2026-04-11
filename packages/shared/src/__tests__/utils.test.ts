import { afterEach, describe, it, expect, vi } from 'vitest'
import { parseAPIDate, formatAPIDate } from '../utils/dates'
import { getTimezoneList } from '../utils/timezones'
import { isValidEmail } from '../utils/email'
import {
  createApiClientError,
  extractBackendError,
  getErrorMessage,
  getFriendlyErrorKey,
  getFriendlyErrorMessage,
  translateErrorKey,
} from '../utils/error-utils'

// ---------------------------------------------------------------------------
// parseAPIDate
// ---------------------------------------------------------------------------

describe('parseAPIDate', () => {
  it('returns a Date object for a valid YYYY-MM-DD string', () => {
    const result = parseAPIDate('2025-06-15')
    expect(result).toBeInstanceOf(Date)
    expect(Number.isNaN(result.getTime())).toBe(false)
  })

  it('preserves the local date (month and day match the input)', () => {
    const result = parseAPIDate('2025-01-31')
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(0) // January is 0-indexed
    expect(result.getDate()).toBe(31)
  })

  it('parses as local time, not UTC', () => {
    const result = parseAPIDate('2025-03-01')
    expect(result.getDate()).toBe(1)
    expect(result.getMonth()).toBe(2) // March
  })

  it('handles year boundaries correctly', () => {
    const result = parseAPIDate('2025-12-31')
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(11)
    expect(result.getDate()).toBe(31)
  })
})

// ---------------------------------------------------------------------------
// formatAPIDate
// ---------------------------------------------------------------------------

describe('formatAPIDate', () => {
  it('formats a Date to YYYY-MM-DD string', () => {
    const date = new Date(2025, 5, 15) // June 15, 2025
    expect(formatAPIDate(date)).toBe('2025-06-15')
  })

  it('pads single-digit months and days with zeros', () => {
    const date = new Date(2025, 0, 5) // January 5, 2025
    expect(formatAPIDate(date)).toBe('2025-01-05')
  })

  it('roundtrip with parseAPIDate preserves the original string', () => {
    const original = '2025-12-25'
    const parsed = parseAPIDate(original)
    const formatted = formatAPIDate(parsed)
    expect(formatted).toBe(original)
  })

  it('handles first day of year', () => {
    const date = new Date(2025, 0, 1)
    expect(formatAPIDate(date)).toBe('2025-01-01')
  })
})

// ---------------------------------------------------------------------------
// getTimezoneList
// ---------------------------------------------------------------------------

describe('getTimezoneList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a non-empty array', () => {
    const list = getTimezoneList()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  it('includes America/New_York', () => {
    const list = getTimezoneList()
    expect(list).toContain('America/New_York')
  })

  it('includes Europe/London', () => {
    const list = getTimezoneList()
    expect(list).toContain('Europe/London')
  })

  it('includes Asia/Tokyo', () => {
    const list = getTimezoneList()
    expect(list).toContain('Asia/Tokyo')
  })

  it('includes America/Sao_Paulo', () => {
    const list = getTimezoneList()
    expect(list).toContain('America/Sao_Paulo')
  })

  it('returns strings in every entry', () => {
    const list = getTimezoneList()
    for (const tz of list) {
      expect(typeof tz).toBe('string')
    }
  })

  it('falls back to an empty list when Intl.supportedValuesOf is unavailable', () => {
    vi.stubGlobal('Intl', {})

    expect(getTimezoneList()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------

describe('isValidEmail', () => {
  it('accepts a simple valid email', () => {
    expect(isValidEmail('hello@example.com')).toBe(true)
  })

  it('accepts a valid email after trimming whitespace', () => {
    expect(isValidEmail('  hello@example.com  ')).toBe(true)
  })

  it('rejects empty and whitespace-only values', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('   ')).toBe(false)
  })

  it('rejects values without exactly one at-sign', () => {
    expect(isValidEmail('hello.example.com')).toBe(false)
    expect(isValidEmail('a@b@c.com')).toBe(false)
  })

  it('rejects empty local or domain parts', () => {
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('hello@')).toBe(false)
  })

  it('rejects malformed domains', () => {
    expect(isValidEmail('hello@example')).toBe(false)
    expect(isValidEmail('hello@.example.com')).toBe(false)
    expect(isValidEmail('hello@example.com.')).toBe(false)
    expect(isValidEmail('hello@example..com')).toBe(false)
  })

  it('rejects emails with spaces in the middle', () => {
    expect(isValidEmail('hello world@example.com')).toBe(false)
  })

  it('rejects consecutive dots in local part', () => {
    expect(isValidEmail('he..llo@example.com')).toBe(false)
  })

  it('accepts valid subdomains', () => {
    expect(isValidEmail('user@mail.example.com')).toBe(true)
  })

  it('accepts plus addressing', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------

describe('getErrorMessage', () => {
  it('returns data.error when present', () => {
    const err = { data: { error: 'Invalid credentials' } }
    expect(getErrorMessage(err, 'Something went wrong')).toBe('Invalid credentials')
  })

  it('returns data.message when present', () => {
    const err = { data: { message: 'not the right field' } }
    expect(getErrorMessage(err, 'Fallback message')).toBe('not the right field')
  })

  it('returns fallback when data.error is empty string', () => {
    const err = { data: { error: '' } }
    expect(getErrorMessage(err, 'Fallback')).toBe('Fallback')
  })

  it('returns fallback when error is null', () => {
    expect(getErrorMessage(null, 'Fallback')).toBe('Fallback')
  })

  it('returns fallback when error is undefined', () => {
    expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback')
  })

  it('returns the Error message when given an Error instance', () => {
    expect(getErrorMessage(new Error('Network failed'), 'Fallback')).toBe('Network failed')
  })

  it('returns fallback when error is a plain string', () => {
    expect(getErrorMessage('some error', 'Fallback')).toBe('Fallback')
  })

  it('returns fallback when error is a number', () => {
    expect(getErrorMessage(42, 'Fallback')).toBe('Fallback')
  })
})

// ---------------------------------------------------------------------------
// extractBackendError
// ---------------------------------------------------------------------------

describe('extractBackendError', () => {
  it('returns string from nested data.data.error', () => {
    const err = { data: { data: { error: 'Email already exists' } } }
    expect(extractBackendError(err)).toBe('Email already exists')
  })

  it('returns string from direct data.error when nested is absent', () => {
    const err = { data: { error: 'Not found' } }
    expect(extractBackendError(err)).toBe('Not found')
  })

  it('prefers nested data.data.error over direct data.error', () => {
    const err = { data: { error: 'outer', data: { error: 'inner' } } }
    expect(extractBackendError(err)).toBe('inner')
  })

  it('returns first validation error from errors object', () => {
    const err = {
      data: {
        errors: {
          Title: ['Title is required', 'Title is too short'],
        },
      },
    }
    expect(extractBackendError(err)).toBe('Title is required')
  })

  it('returns first validation error from nested data.data.errors', () => {
    const err = {
      data: {
        data: {
          errors: {
            Email: ['Invalid email format'],
          },
        },
      },
    }
    expect(extractBackendError(err)).toBe('Invalid email format')
  })

  it('returns undefined when error has no data property', () => {
    expect(extractBackendError({})).toBeUndefined()
  })

  it('returns undefined when data.error is not a string (number)', () => {
    const err = { data: { error: 42 } }
    expect(extractBackendError(err)).toBeUndefined()
  })

  it('returns undefined when data.error is not a string (object)', () => {
    const err = { data: { error: { code: 'ERR' } } }
    expect(extractBackendError(err)).toBeUndefined()
  })

  it('returns undefined for null input', () => {
    expect(extractBackendError(null)).toBeUndefined()
  })

  it('returns undefined for primitive input', () => {
    expect(extractBackendError('error string')).toBeUndefined()
    expect(extractBackendError(42)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// translateErrorKey
// ---------------------------------------------------------------------------

describe('translateErrorKey', () => {
  const translate = (key: string) => `translated:${key}`

  it('returns translated text when a key exists', () => {
    expect(translateErrorKey(translate, 'habits.form.titleRequired')).toBe(
      'translated:habits.form.titleRequired',
    )
  })

  it('returns null when the key is missing', () => {
    expect(translateErrorKey(translate, null)).toBeNull()
    expect(translateErrorKey(translate, undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getFriendlyErrorKey / getFriendlyErrorMessage
// ---------------------------------------------------------------------------

describe('getFriendlyErrorKey', () => {
  it('maps habit log note length errors', () => {
    const err = createApiClientError(
      400,
      { error: 'Note must not exceed 500 characters' },
      'fallback',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habitLog')).toBe(
      'habits.log.noteTooLong',
    )
  })

  it('maps tag color validation errors', () => {
    const err = createApiClientError(
      400,
      { error: 'Color must be a valid hex color' },
      'fallback',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'tag')).toBe(
      'habits.form.tagColorInvalid',
    )
  })

  it('returns the caller fallback for paywall errors', () => {
    const err = createApiClientError(
      400,
      { errorCode: 'PAY_GATE', error: 'Upgrade required' },
      'fallback',
    )
    expect(getFriendlyErrorKey(err, 'goals.errors.create', 'goal')).toBe(
      'goals.errors.create',
    )
  })

  it('maps 404 errors to not found', () => {
    const err = createApiClientError(
      404,
      { error: 'Habit not found' },
      'fallback',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe(
      'toast.errors.notFound',
    )
  })

  it('maps 429 errors to too many requests', () => {
    const err = createApiClientError(
      429,
      { error: 'Please wait before trying again' },
      'fallback',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe(
      'toast.errors.tooManyRequests',
    )
  })

  it('maps 500 errors to server fallback', () => {
    const err = createApiClientError(
      500,
      { error: 'Internal server error' },
      'fallback',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe(
      'toast.errors.server',
    )
  })
})

describe('getFriendlyErrorMessage', () => {
  const translate = (key: string) => `translated:${key}`

  it('translates the resolved friendly key', () => {
    const err = createApiClientError(
      400,
      { error: 'Color must be a valid hex color' },
      'fallback',
    )
    expect(getFriendlyErrorMessage(err, translate, 'errors.generic', 'tag')).toBe(
      'translated:habits.form.tagColorInvalid',
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  AUTH_BACKEND_ERROR_CODE_MAP,
  AUTH_BACKEND_ERROR_MAP,
  createVerificationCodeDigits,
  extractAuthBackendMessage,
  fillVerificationCodeDigits,
  getAuthLoginErrorKey,
  getAuthLoginErrorKeyByCode,
  isValidVerificationCode,
  isVerificationCodeComplete,
  normalizeVerificationCodeInput,
  resolveAuthLoginErrorKey,
} from '../utils/auth-login'
import { createApiClientError, extractBackendErrorCode } from '../utils/error-utils'

describe('auth login helpers', () => {
  it('normalizes verification code input to digits only', () => {
    expect(normalizeVerificationCodeInput('12-3 4a5b6')).toBe('123456')
  })

  it('builds the correct verification code digit array', () => {
    expect(createVerificationCodeDigits()).toEqual(['', '', '', '', '', ''])
  })

  it('fills digits and reports the next focus index', () => {
    const { digits, nextFocusIndex } = fillVerificationCodeDigits(2, '7890', ['a', 'b', '', '', '', ''])

    expect(digits).toEqual(['a', 'b', '7', '8', '9', '0'])
    expect(nextFocusIndex).toBe(5)
  })

  it('detects complete verification codes', () => {
    expect(isVerificationCodeComplete(['1', '2', '3', '4', '5', '6'])).toBe(true)
    expect(isVerificationCodeComplete(['1', '2', '', '4', '5', '6'])).toBe(false)
    expect(isValidVerificationCode('123456')).toBe(true)
    expect(isValidVerificationCode('12345')).toBe(false)
  })

  it('maps backend auth error strings to translation keys', () => {
    expect(getAuthLoginErrorKey('Invalid verification code')).toBe(AUTH_BACKEND_ERROR_MAP['Invalid verification code'])
    expect(getAuthLoginErrorKey('missing')).toBeUndefined()
  })

  it('maps stable backend error codes to translation keys', () => {
    expect(getAuthLoginErrorKeyByCode('INVALID_VERIFICATION_CODE')).toBe('auth.errors.invalidCode')
    expect(getAuthLoginErrorKeyByCode('CODE_EXPIRED')).toBe('auth.errors.codeExpired')
    expect(getAuthLoginErrorKeyByCode('TOO_MANY_ATTEMPTS')).toBe('auth.errors.tooManyAttempts')
    expect(getAuthLoginErrorKeyByCode('RATE_LIMITED')).toBe('auth.errors.rateLimited')
    expect(getAuthLoginErrorKeyByCode('INVALID_EMAIL')).toBe('auth.errors.invalidEmail')
    expect(getAuthLoginErrorKeyByCode('UNKNOWN_CODE')).toBeUndefined()
    expect(Object.keys(AUTH_BACKEND_ERROR_CODE_MAP)).toHaveLength(5)
  })
})

describe('resolveAuthLoginErrorKey', () => {
  it('prefers backend error code (from raw) over status and message', () => {
    const mobileError = createApiClientError(
      400,
      { error: 'Some server text', errorCode: 'CODE_EXPIRED' },
      'Request failed: 400',
    )
    expect(
      resolveAuthLoginErrorKey({ status: 400, backendMessage: 'Some server text', raw: mobileError }),
    ).toBe('auth.errors.codeExpired')
  })

  it('resolves the code from the web BFF {status, body} envelope', () => {
    const webError = { status: 400, body: { error: 'Some server text', errorCode: 'TOO_MANY_ATTEMPTS' } }
    expect(
      resolveAuthLoginErrorKey({ status: 400, backendMessage: 'Some server text', raw: webError }),
    ).toBe('auth.errors.tooManyAttempts')
  })

  it('falls back to backend message mapping when no code is present', () => {
    expect(
      resolveAuthLoginErrorKey({ status: 400, backendMessage: 'Invalid verification code' }),
    ).toBe('auth.errors.invalidCode')
  })

  it('prefers exact backend message mapping', () => {
    expect(
      resolveAuthLoginErrorKey({ status: 400, backendMessage: 'Invalid verification code' }),
    ).toBe('auth.errors.invalidCode')
  })

  it('maps HTTP 400 / 422 to invalidRequest', () => {
    expect(resolveAuthLoginErrorKey({ status: 400 })).toBe('auth.errors.invalidRequest')
    expect(resolveAuthLoginErrorKey({ status: 422 })).toBe('auth.errors.invalidRequest')
  })

  it('maps 401 to unauthorized', () => {
    expect(resolveAuthLoginErrorKey({ status: 401 })).toBe('auth.errors.unauthorized')
  })

  it('maps 403 to forbidden', () => {
    expect(resolveAuthLoginErrorKey({ status: 403 })).toBe('auth.errors.forbidden')
  })

  it('maps 404 to emailNotFound', () => {
    expect(resolveAuthLoginErrorKey({ status: 404 })).toBe('auth.errors.emailNotFound')
  })

  it('maps 409 to conflict', () => {
    expect(resolveAuthLoginErrorKey({ status: 409 })).toBe('auth.errors.conflict')
  })

  it('maps 429 to rateLimited', () => {
    expect(resolveAuthLoginErrorKey({ status: 429 })).toBe('auth.errors.rateLimited')
  })

  it('maps 5xx to serverError', () => {
    expect(resolveAuthLoginErrorKey({ status: 500 })).toBe('auth.errors.serverError')
    expect(resolveAuthLoginErrorKey({ status: 502 })).toBe('auth.errors.serverError')
    expect(resolveAuthLoginErrorKey({ status: 503 })).toBe('auth.errors.serverError')
    expect(resolveAuthLoginErrorKey({ status: 504 })).toBe('auth.errors.serverError')
  })

  it('detects TypeError as network failure', () => {
    expect(resolveAuthLoginErrorKey({ raw: new TypeError('fetch failed') })).toBe(
      'auth.errors.networkError',
    )
  })

  it('falls back to googleError when source is google', () => {
    expect(resolveAuthLoginErrorKey({ source: 'google' })).toBe('auth.errors.googleError')
  })

  it('falls back to unknownError otherwise', () => {
    expect(resolveAuthLoginErrorKey({})).toBe('auth.errors.unknownError')
  })

  it('always returns an auth.errors.* key (never a raw backend string)', () => {
    const inputs = [
      { status: 400 },
      { status: 418 },
      { backendMessage: 'totally unknown' },
      { raw: new Error('boom') },
      {},
    ]
    for (const input of inputs) {
      expect(resolveAuthLoginErrorKey(input)).toMatch(/^auth\.errors\./)
    }
  })
})

describe('extractAuthBackendMessage', () => {
  it('extracts {error}', () => {
    expect(extractAuthBackendMessage({ error: 'Invalid verification code' })).toBe(
      'Invalid verification code',
    )
  })

  it('extracts nested {data:{error}}', () => {
    expect(extractAuthBackendMessage({ data: { error: 'x' } })).toBe('x')
  })

  it('extracts FluentValidation {errors:{Field:[msg]}}', () => {
    expect(extractAuthBackendMessage({ errors: { Email: ['bad'] } })).toBe('bad')
  })

  it('extracts from ApiClientError data', () => {
    const err = createApiClientError(400, { error: 'Invalid verification code' }, 'Request failed: 400')
    expect(extractAuthBackendMessage(err)).toBe('Invalid verification code')
  })

  it('ignores transport-level Request failed messages', () => {
    const err = createApiClientError(429, null, 'Request failed: 429')
    expect(extractAuthBackendMessage(err)).toBeUndefined()
  })

  it('returns undefined for unknown values', () => {
    expect(extractAuthBackendMessage(null)).toBeUndefined()
    expect(extractAuthBackendMessage(undefined)).toBeUndefined()
    expect(extractAuthBackendMessage(42)).toBeUndefined()
  })
})

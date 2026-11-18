import { describe, expect, it } from 'vitest'
import {
  AUTH_BACKEND_ERROR_CODE_MAP,
  AUTH_BACKEND_ERROR_MAP,
  createVerificationCodeDigits,
  deriveLoginEmailErrors,
  extractAuthBackendMessage,
  fillVerificationCodeDigits,
  getAuthCallbackErrorKey,
  getAuthLoginErrorKey,
  getAuthLoginErrorKeyByCode,
  getPendingAuthProvider,
  isValidVerificationCode,
  isVerificationCodeComplete,
  normalizeVerificationCodeInput,
  resolveAuthLoginErrorKey,
  showsAuthCallbackLine,
  loginCodeLine,
  loginRefusalHint,
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
    expect(getAuthLoginErrorKeyByCode('RATE_LIMITED')).toBe('auth.errors.sendFailed')
    expect(getAuthLoginErrorKeyByCode('INVALID_EMAIL')).toBe('auth.errors.invalidEmail')
    expect(getAuthLoginErrorKeyByCode('UNKNOWN_CODE')).toBeUndefined()
    expect(getAuthLoginErrorKeyByCode('VALIDATION_VERIFICATION_CODE_FORMAT')).toBe('auth.errors.codeFormat')
    expect(Object.keys(AUTH_BACKEND_ERROR_CODE_MAP)).toHaveLength(7)
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

  it('maps a known backend message even when the HTTP status points elsewhere', () => {
    expect(
      resolveAuthLoginErrorKey({ status: 500, backendMessage: 'Invalid verification code' }),
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

  it('does not disclose account existence for 404', () => {
    expect(resolveAuthLoginErrorKey({ status: 404 })).toBe('auth.errors.unknownError')
  })

  it('maps 409 to conflict', () => {
    expect(resolveAuthLoginErrorKey({ status: 409 })).toBe('auth.errors.conflict')
  })

  it('maps 429 to sendFailed', () => {
    expect(resolveAuthLoginErrorKey({ status: 429 })).toBe('auth.errors.sendFailed')
  })

  it('maps 5xx to unknownError', () => {
    expect(resolveAuthLoginErrorKey({ status: 500 })).toBe('auth.errors.unknownError')
    expect(resolveAuthLoginErrorKey({ status: 502 })).toBe('auth.errors.unknownError')
    expect(resolveAuthLoginErrorKey({ status: 503 })).toBe('auth.errors.unknownError')
    expect(resolveAuthLoginErrorKey({ status: 504 })).toBe('auth.errors.unknownError')
  })

  it('maps a TypeError from fetch to unknownError', () => {
    expect(resolveAuthLoginErrorKey({ raw: new TypeError('fetch failed') })).toBe(
      'auth.errors.unknownError',
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

describe('where a failure of the email step shows', () => {
  const failure = (errorKey: string | null, fieldError?: string) => deriveLoginEmailErrors({ isOnline: true, fieldError, errorKey, errorMessage: errorKey ? 'Message' : null })

  it('shows an email the server refused beside the field', () => {
    expect(failure('auth.errors.invalidEmail')).toEqual({ field: 'Message', provider: null, send: null })
  })

  it('shows the error of the field itself before any server message', () => {
    expect(failure('auth.errors.sendCode', 'Enter your email')).toEqual({ field: 'Enter your email', provider: null, send: null })
  })

  it.each(['auth.errors.googleError', 'auth.errors.appleError'])('shows %s under the provider actions', (errorKey) => {
    expect(failure(errorKey)).toEqual({ field: null, provider: 'Message', send: null })
  })

  it('shows every other failure beside the continue action, and none when nothing failed', () => {
    expect(failure('auth.errors.sendCode')).toEqual({ field: null, provider: null, send: 'Message' })
    expect(failure(null)).toEqual({ field: null, provider: null, send: null })
  })

  it('shows none offline, because the offline notice names the state', () => {
    expect(deriveLoginEmailErrors({ isOnline: false, fieldError: 'Enter your email', errorKey: 'auth.errors.googleError', errorMessage: 'Message' })).toEqual({ field: null, provider: null, send: null })
  })
})

describe('the provider callback on the sign-in surface', () => {
  it('names the provider only while its callback is pending, and Google when the callback names none', () => {
    expect(getPendingAuthProvider({ state: 'pending', provider: 'apple' })).toBe('apple')
    expect(getPendingAuthProvider({ state: 'pending' })).toBe('google')
    expect(getPendingAuthProvider({ state: 'failed', provider: 'apple' })).toBeNull()
    expect(getPendingAuthProvider(undefined)).toBeNull()
  })

  it('shows the provider line after a failure and after a cancel only', () => {
    expect(showsAuthCallbackLine({ state: 'failed' })).toBe(true)
    expect(showsAuthCallbackLine({ state: 'cancelled' })).toBe(true)
    expect(showsAuthCallbackLine({ state: 'pending' })).toBe(false)
    expect(showsAuthCallbackLine(undefined)).toBe(false)
  })

  it('reads the error of the provider that failed', () => {
    expect(getAuthCallbackErrorKey('apple')).toBe('auth.errors.appleError')
    expect(getAuthCallbackErrorKey('google')).toBe('auth.errors.googleError')
    expect(getAuthCallbackErrorKey(undefined)).toBe('auth.errors.googleError')
  })
})

describe('sign-in step lines', () => {
  const translate = (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key)

  it('names the missing connection first, then the human check, and nothing when the step can send', () => {
    expect(loginRefusalHint(translate, false, false)).toBe('auth.errors.offline')
    expect(loginRefusalHint(translate, true, false)).toBe('auth.turnstileLabel')
    expect(loginRefusalHint(translate, true, true)).toBeUndefined()
  })

  it('states the wait of a locked code, an expired code, or the address the code went to', () => {
    const base = { codeFailure: null, lockCountdown: 0, email: 'ana@example.com' } as const
    expect(loginCodeLine(translate, { ...base, waiting: true, codeFailure: 'locked', lockCountdown: 125 })).toBe('auth.line.codeLocked {"time":"2:05"}')
    expect(loginCodeLine(translate, { ...base, waiting: false, codeFailure: 'expired' })).toBe('auth.line.codeExpired')
    expect(loginCodeLine(translate, { ...base, waiting: false, codeFailure: 'locked' }), 'a lock with no wait left sends the person back to the code').toBe('auth.line.codeSent {"email":"ana@example.com"}')
    expect(loginCodeLine(translate, { ...base, waiting: false, codeFailure: 'wrong' })).toBe('auth.line.codeSent {"email":"ana@example.com"}')
  })
})

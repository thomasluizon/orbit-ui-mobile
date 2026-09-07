import { describe, expect, it } from 'vitest'
import { formatLoginCountdown, recordLoginFailure, resolveAuthLoginErrorKey } from '../utils/auth-login'
import { authLocales, authTranslator } from './auth-screen-fixtures'

describe('login recovery rules', () => {
  it('does not move an observed deadline when the server refuses again partway through the lock', () => {
    const previous = { count: 3, expiresAt: 900_000 }
    const repeated = recordLoginFailure('auth.errors.tooManyAttempts', previous, 840_000)
    expect(repeated.attempts.expiresAt).toBe(previous.expiresAt)
    expect(repeated.failure).toBe('locked')
  })
  it('does not invent a deadline after a reload or rearm an elapsed observed window', () => {
    expect(recordLoginFailure('auth.errors.tooManyAttempts', undefined, 840_000).attempts.expiresAt).toBe(0)
    const previous = { count: 3, expiresAt: 900_000 }
    expect(recordLoginFailure('auth.errors.tooManyAttempts', previous, 900_001).attempts.expiresAt).toBe(900_000)
  })
  it('counts confirmed wrong codes through the third attempt and expires the attempt window', () => {
    const first = recordLoginFailure('auth.errors.invalidCode', undefined, 100)
    const second = recordLoginFailure('auth.errors.invalidCode', first.attempts, 200)
    const third = recordLoginFailure('auth.errors.invalidCode', second.attempts, 300)
    expect(first.failure).toBe('wrong')
    expect(second.failure).toBe('wrong')
    expect(third).toEqual({ failure: 'locked', attempts: { count: 3, expiresAt: 900300 } })
    expect(recordLoginFailure('auth.errors.invalidCode', third.attempts, 900301).failure).toBe('wrong')
  })
  it('only counts wrong-code failures and honors a lock reported by the server', () => {
    const first = recordLoginFailure('auth.errors.invalidCode', undefined, 100)
    expect(recordLoginFailure('auth.errors.unknownError', first.attempts, 200).attempts).toEqual(first.attempts)
    expect(recordLoginFailure('auth.errors.codeExpired', first.attempts, 200).failure).toBe('expired')
    expect(recordLoginFailure('auth.errors.tooManyAttempts', undefined, 200).failure).toBe('locked')
  })
  it.each([400, 404, 429, 500, 501, 502, 503, 504])('uses one send failure for HTTP %s without account disclosure', (status) => {
    expect(resolveAuthLoginErrorKey({ source: 'send', status })).toBe('auth.errors.sendFailed')
    expect(resolveAuthLoginErrorKey({ source: 'google', status })).toBe('auth.errors.googleError')
  })
  it.each([[0, '0:00'], [60, '1:00'], [42, '0:42'], [900, '15:00']])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatLoginCountdown(seconds as number)).toBe(expected)
  })
  it.each(authLocales)('ships truthful recovery copy in %s', (locale) => {
    const t = authTranslator(locale)
    expect(t('auth.errors.tooManyAttempts')).toContain('3')
    expect(t('auth.errors.tooManyAttempts')).toContain('15')
    expect(t('auth.errors.codeExpired')).toContain('5')
    expect(t('auth.codeSent')).not.toBe(t('auth.codeResent'))
    expect(() => t('auth.errors.emailNotFound')).toThrow('Missing translation')
    expect(() => t('auth.errors.rateLimited')).toThrow('Missing translation')
  })
})

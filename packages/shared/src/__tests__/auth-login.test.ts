import { describe, expect, it } from 'vitest'
import {
  AUTH_BACKEND_ERROR_MAP,
  createVerificationCodeDigits,
  fillVerificationCodeDigits,
  getAuthLoginErrorKey,
  isValidVerificationCode,
  isVerificationCodeComplete,
  normalizeVerificationCodeInput,
} from '../utils/auth-login'

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
})

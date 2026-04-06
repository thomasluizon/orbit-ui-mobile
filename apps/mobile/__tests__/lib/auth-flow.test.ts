import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getItemMock, setItemMock, removeItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  setItemMock: vi.fn(),
  removeItemMock: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: getItemMock,
    setItem: setItemMock,
    removeItem: removeItemMock,
  },
}))

import {
  clearStoredAuthReturnUrl,
  clearStoredReferralCode,
  consumeStoredAuthReturnUrl,
  getSafeReturnUrl,
  getStoredAuthReturnUrl,
  getStoredReferralCode,
  isSafeReturnUrl,
  isValidReferralCode,
  isValidVerificationCode,
  markReferralApplied,
  storeAuthReturnUrl,
  storeReferralCode,
} from '@/lib/auth-flow'

describe('mobile auth flow helpers', () => {
  beforeEach(() => {
    getItemMock.mockReset()
    setItemMock.mockReset()
    removeItemMock.mockReset()
  })

  it('validates referral codes and verification codes', () => {
    expect(isValidReferralCode('orbit_123')).toBe(true)
    expect(isValidReferralCode('../bad')).toBe(false)
    expect(isValidVerificationCode('123456')).toBe(true)
    expect(isValidVerificationCode('12345')).toBe(false)
  })

  it('accepts only safe return URLs', () => {
    expect(isSafeReturnUrl('/profile')).toBe(true)
    expect(isSafeReturnUrl('//evil.com')).toBe(false)
    expect(getSafeReturnUrl('//evil.com', '/login')).toBe('/login')
  })

  it('stores and retrieves valid referral codes', async () => {
    getItemMock.mockResolvedValue('invite_abc')

    await storeReferralCode('invite_abc')
    await expect(getStoredReferralCode()).resolves.toBe('invite_abc')
    expect(setItemMock).toHaveBeenCalledWith('referral_code', 'invite_abc')
  })

  it('ignores invalid referral codes', async () => {
    getItemMock.mockResolvedValue('bad value')

    await storeReferralCode('bad value')
    await expect(getStoredReferralCode()).resolves.toBeNull()
    expect(setItemMock).not.toHaveBeenCalled()
  })

  it('stores, consumes, and clears safe return URLs', async () => {
    getItemMock.mockResolvedValueOnce('/dashboard')
    getItemMock.mockResolvedValueOnce('/dashboard')

    await storeAuthReturnUrl('/dashboard')
    await expect(getStoredAuthReturnUrl()).resolves.toBe('/dashboard')
    await expect(consumeStoredAuthReturnUrl()).resolves.toBe('/dashboard')
    await clearStoredAuthReturnUrl()

    expect(setItemMock).toHaveBeenCalledWith('auth_return_url', '/dashboard')
    expect(removeItemMock).toHaveBeenCalledWith('auth_return_url')
  })

  it('clears the stored referral code and marks referral applied', async () => {
    await clearStoredReferralCode()
    await markReferralApplied()

    expect(removeItemMock).toHaveBeenCalledWith('referral_code')
    expect(setItemMock).toHaveBeenCalledWith('orbit_referral_applied', '1')
  })
})

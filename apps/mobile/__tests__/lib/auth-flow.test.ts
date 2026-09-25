import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  storeAuthReturnUrl,
  storeReferralCode,
} from '@/lib/auth-flow'

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

  it('keeps a replacement return URL when the old removal is pending', async () => {
    let storedUrl: string | null = '/old'
    let releaseRemoval!: () => void
    let currentLogin = true
    getItemMock.mockImplementation(() => Promise.resolve(storedUrl))
    setItemMock.mockImplementation((_key: string, value: string) => {
      storedUrl = value
      return Promise.resolve()
    })
    removeItemMock.mockImplementation(() => new Promise<void>((resolve) => {
      releaseRemoval = () => { storedUrl = null; resolve() }
    }))

    const oldCleanup = clearStoredAuthReturnUrl(() => currentLogin)
    await vi.waitFor(() => expect(removeItemMock).toHaveBeenCalledTimes(1))
    currentLogin = false
    const replacementStorage = storeAuthReturnUrl('/replacement')
    releaseRemoval()
    await Promise.all([oldCleanup, replacementStorage])

    expect(storedUrl).toBe('/replacement')
  })

  it('reads the replacement URL after a pending old removal', async () => {
    let storedUrl: string | null = '/old'
    let releaseRemoval!: () => void
    let currentLogin = true
    getItemMock.mockImplementation(() => Promise.resolve(storedUrl))
    setItemMock.mockImplementation((_key: string, value: string) => {
      storedUrl = value
      return Promise.resolve()
    })
    removeItemMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseRemoval = () => { storedUrl = null; resolve() }
    })).mockImplementation(() => {
      storedUrl = null
      return Promise.resolve()
    })

    const oldCleanup = clearStoredAuthReturnUrl(() => currentLogin)
    await vi.waitFor(() => expect(removeItemMock).toHaveBeenCalledTimes(1))
    currentLogin = false
    const replacementStorage = storeAuthReturnUrl('/replacement')
    const replacementRead = getStoredAuthReturnUrl()
    releaseRemoval()
    const destination = await replacementRead
    await replacementStorage
    await clearStoredAuthReturnUrl(() => true)
    await oldCleanup

    expect(getSafeReturnUrl(destination)).toBe('/replacement')
    expect(storedUrl).toBeNull()
  })

  it('clears the stored referral code', async () => {
    await clearStoredReferralCode()

    expect(removeItemMock).toHaveBeenCalledWith('referral_code')
  })
})

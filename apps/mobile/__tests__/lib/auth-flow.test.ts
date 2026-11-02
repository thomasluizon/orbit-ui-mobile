import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearStoredAuthReturnUrl,
  clearStoredReferralCode,
  consumeStoredAuthReturnUrl,
  createAuthReturnUrlAttempt,
  getSafeReturnUrl,
  getStoredAuthReturnUrl,
  getStoredReferralCode,
  isAuthReturnUrlAttemptCurrent,
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
    expect(isSafeReturnUrl('/\\evil.com')).toBe(false)
    expect(isSafeReturnUrl('/\t/evil.com')).toBe(false)
    expect(getSafeReturnUrl('//evil.com', '/login')).toBe('/login')
  })

  it.each([
    [null, '/(tabs)'],
    [undefined, '/(tabs)'],
    ['/', '/(tabs)'],
    ['/?source=login', '/(tabs)?source=login'],
    ['/#today', '/(tabs)#today'],
    ['/login', '/(tabs)'],
    ['/login?returnUrl=/', '/(tabs)'],
    ['/auth-callback?code=old', '/(tabs)'],
    ['/(onboarding)', '/(tabs)'],
    ['/(onboarding)/index', '/(tabs)'],
    ['/(onboarding)/?step=welcome', '/(tabs)'],
    ['//evil.example', '/(tabs)'],
    ['https://evil.example', '/(tabs)'],
    ['/calendar?import=1', '/calendar?import=1'],
    ['/profile', '/profile'],
    ['/(tabs)?date=2026-04-07', '/(tabs)?date=2026-04-07'],
  ])('resolves the signed-in return URL %s to %s', (returnUrl, destination) => {
    expect(getSafeReturnUrl(returnUrl)).toBe(destination)
  })

  it('a rejected return-URL write does not leave a stale destination for the next login', async () => {
    const stored = new Map<string, string>()
    setItemMock.mockImplementation((key: string, value: string) => { stored.set(key, value); return Promise.resolve() })
    getItemMock.mockImplementation((key: string) => Promise.resolve(stored.get(key) ?? null))
    removeItemMock.mockImplementation((key: string) => { stored.delete(key); return Promise.resolve() })
    await storeAuthReturnUrl('/old', createAuthReturnUrlAttempt())
    setItemMock.mockRejectedValueOnce(new Error('disk full'))
    const attemptId = createAuthReturnUrlAttempt()

    await expect(storeAuthReturnUrl('/new', attemptId)).rejects.toThrow('disk full')

    const destination = await getStoredAuthReturnUrl(attemptId)
    expect(destination).toBeNull()
    expect(getSafeReturnUrl(destination)).toBe('/(tabs)')
  })

  it('runs the next queued return-URL mutation after a write rejects', async () => {
    setItemMock.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined)
    const attemptId = createAuthReturnUrlAttempt()
    const failed = storeAuthReturnUrl('/failed', attemptId)
    const next = storeAuthReturnUrl('/next', attemptId)

    await expect(failed).rejects.toThrow('disk full')
    await expect(next).resolves.toBeUndefined()
    expect(setItemMock).toHaveBeenLastCalledWith('auth_return_url', '/next')
  })

  it('propagates a referral write failure and allows the next valid write', async () => {
    setItemMock.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined)
    await expect(storeReferralCode('invite_abc')).rejects.toThrow('disk full')
    await expect(storeReferralCode('invite_next')).resolves.toBeUndefined()
    expect(setItemMock).toHaveBeenLastCalledWith('referral_code', 'invite_next')
  })

  it('propagates a referral removal failure', async () => {
    removeItemMock.mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(clearStoredReferralCode()).rejects.toThrow('disk unavailable')
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

    const attemptId = createAuthReturnUrlAttempt()
    await storeAuthReturnUrl('/dashboard', attemptId)
    await expect(getStoredAuthReturnUrl(attemptId)).resolves.toBe('/dashboard')
    await expect(consumeStoredAuthReturnUrl(attemptId)).resolves.toBe('/dashboard')
    await clearStoredAuthReturnUrl(attemptId)

    expect(setItemMock).toHaveBeenCalledWith('auth_return_url', '/dashboard')
    expect(removeItemMock).toHaveBeenCalledWith('auth_return_url')
  })

  it('keeps a replacement return URL when the old removal is pending', async () => {
    const oldAttemptId = createAuthReturnUrlAttempt()
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

    const oldCleanup = clearStoredAuthReturnUrl(oldAttemptId, () => currentLogin)
    await vi.waitFor(() => expect(removeItemMock).toHaveBeenCalledTimes(1))
    currentLogin = false
    const replacementAttemptId = createAuthReturnUrlAttempt()
    const replacementStorage = storeAuthReturnUrl('/replacement', replacementAttemptId)
    releaseRemoval()
    await Promise.all([oldCleanup, replacementStorage])

    expect(storedUrl).toBe('/replacement')
  })

  it('reads the replacement URL after a pending old removal', async () => {
    const oldAttemptId = createAuthReturnUrlAttempt()
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

    const oldCleanup = clearStoredAuthReturnUrl(oldAttemptId, () => currentLogin)
    await vi.waitFor(() => expect(removeItemMock).toHaveBeenCalledTimes(1))
    currentLogin = false
    const replacementAttemptId = createAuthReturnUrlAttempt()
    const replacementStorage = storeAuthReturnUrl('/replacement', replacementAttemptId)
    const replacementRead = getStoredAuthReturnUrl(replacementAttemptId)
    releaseRemoval()
    const destination = await replacementRead
    await replacementStorage
    await clearStoredAuthReturnUrl(replacementAttemptId, () => true)
    await oldCleanup

    expect(getSafeReturnUrl(destination)).toBe('/replacement')
    expect(storedUrl).toBeNull()
  })

  it('does not restore an old destination for a replacement attempt without a URL', async () => {
    let storedUrl: string | null = '/old'
    let releaseRemoval!: () => void
    getItemMock.mockImplementation(() => Promise.resolve(storedUrl))
    removeItemMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseRemoval = () => { storedUrl = null; resolve() }
    })).mockImplementation(() => {
      storedUrl = null
      return Promise.resolve()
    })

    const oldAttemptId = createAuthReturnUrlAttempt()
    const oldCleanup = clearStoredAuthReturnUrl(oldAttemptId, () => true)
    await vi.waitFor(() => expect(removeItemMock).toHaveBeenCalledTimes(1))
    const replacementAttemptId = createAuthReturnUrlAttempt()
    const replacementNoUrl = clearStoredAuthReturnUrl(replacementAttemptId)
    releaseRemoval()
    await Promise.all([oldCleanup, replacementNoUrl])

    await expect(getStoredAuthReturnUrl(replacementAttemptId)).resolves.toBeNull()
    expect(storedUrl).toBeNull()
  })

  it('does not remove a newer attempt URL when the old session remains current', async () => {
    let storedUrl: string | null = null
    getItemMock.mockImplementation(() => Promise.resolve(storedUrl))
    setItemMock.mockImplementation((_key: string, url: string) => {
      storedUrl = url
      return Promise.resolve()
    })
    removeItemMock.mockImplementation(() => {
      storedUrl = null
      return Promise.resolve()
    })

    const oldAttemptId = createAuthReturnUrlAttempt()
    await storeAuthReturnUrl('/old', oldAttemptId)
    const replacementAttemptId = createAuthReturnUrlAttempt()
    await storeAuthReturnUrl('/replacement', replacementAttemptId)
    await clearStoredAuthReturnUrl(oldAttemptId, () => true)

    expect(storedUrl).toBe('/replacement')
    await expect(getStoredAuthReturnUrl(replacementAttemptId)).resolves.toBe('/replacement')
  })

  it('does not consume a newer return URL after its attempt replaces an older queued read', async () => {
    let storedUrl: string | null = '/older'
    let releaseRead!: (url: string | null) => void
    getItemMock.mockImplementationOnce(() => new Promise<string | null>((resolve) => { releaseRead = resolve }))
      .mockImplementation(() => Promise.resolve(storedUrl))
    setItemMock.mockImplementation((_key: string, url: string) => { storedUrl = url; return Promise.resolve() })
    removeItemMock.mockImplementation(() => { storedUrl = null; return Promise.resolve() })
    const oldAttemptId = createAuthReturnUrlAttempt()
    const oldConsume = consumeStoredAuthReturnUrl(oldAttemptId)
    await vi.waitFor(() => expect(getItemMock).toHaveBeenCalledTimes(1))
    const newAttemptId = createAuthReturnUrlAttempt()
    const newStore = storeAuthReturnUrl('/newer', newAttemptId)
    releaseRead('/older')
    await expect(oldConsume).resolves.toBeNull()
    await newStore

    expect(isAuthReturnUrlAttemptCurrent(oldAttemptId)).toBe(false)
    expect(removeItemMock).not.toHaveBeenCalled()
    await expect(getStoredAuthReturnUrl(newAttemptId)).resolves.toBe('/newer')
  })

  it('clears the stored referral code', async () => {
    await clearStoredReferralCode()

    expect(removeItemMock).toHaveBeenCalledWith('referral_code')
  })
})

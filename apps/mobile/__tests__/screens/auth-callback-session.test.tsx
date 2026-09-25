import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import AuthCallbackScreen from '@/app/auth-callback'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn(),
  completeGoogleAuthFromUrl: vi.fn(),
  clearStoredReferralCode: vi.fn(),
  getStoredReferralCode: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  getStoredAuthReturnUrl: vi.fn(),
  clearStoredAuthReturnUrl: vi.fn(),
  createAuthReturnUrlAttempt: vi.fn(),
  isAuthReturnUrlAttemptCurrent: vi.fn(),
  pendingGoogleSession: { callbackUrl: null as string | null, isPending: false,
    returnUrlAttemptId: null as number | null },
  rawCallbackUrl: 'https://app.useorbit.org/auth-callback?code=old',
  continueAccount: null as null | (() => void),
  callbackState: 'pending',
}))

vi.mock('@/components/auth/login-content', () => ({
  LoginContent: ({ callback }: { callback: { state: string; onContinue: () => void } }) => {
    mocks.continueAccount = callback.onContinue
    mocks.callbackState = callback.state
    return null
  },
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }))
vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: mocks.clearStoredReferralCode,
  getStoredReferralCode: mocks.getStoredReferralCode,
  consumeStoredAuthReturnUrl: mocks.consumeStoredAuthReturnUrl,
  getStoredAuthReturnUrl: mocks.getStoredAuthReturnUrl,
  clearStoredAuthReturnUrl: mocks.clearStoredAuthReturnUrl,
  createAuthReturnUrlAttempt: mocks.createAuthReturnUrlAttempt,
  isAuthReturnUrlAttemptCurrent: mocks.isAuthReturnUrlAttemptCurrent,
  getSafeReturnUrl: (url: string | null) => url ?? '/',
}))
vi.mock('@/lib/google-auth-callback', () => ({
  AUTH_CALLBACK_URL: 'https://app.useorbit.org/auth-callback',
  clearPendingGoogleAuthSession: vi.fn(),
  extractGoogleAuthParams: () => ({}),
  resolveGoogleAuthCallbackUrl: ({ sessionCallbackUrl }: { sessionCallbackUrl: string | null }) =>
    sessionCallbackUrl ?? mocks.rawCallbackUrl,
  usePendingGoogleAuthSession: () => mocks.pendingGoogleSession,
}))
vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: mocks.completeGoogleAuthFromUrl }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { login: typeof mocks.login }) => unknown) => selector({ login: mocks.login }),
}))
vi.mock('@/lib/capture-mode', () => ({
  captureBuildEnabled: false,
  shouldRetainEmptyAuthCallback: () => false,
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.continueAccount = null
  mocks.callbackState = 'pending'
  mocks.completeGoogleAuthFromUrl.mockResolvedValue({ token: 'old-access', refreshToken: 'old-refresh',
    userId: 'old-user', name: 'Old', email: 'old@example.com' })
  mocks.getStoredReferralCode.mockResolvedValue(null)
  mocks.consumeStoredAuthReturnUrl.mockResolvedValue('/home')
  mocks.getStoredAuthReturnUrl.mockResolvedValue('/home')
  mocks.createAuthReturnUrlAttempt.mockReturnValue(1)
  mocks.isAuthReturnUrlAttemptCurrent.mockReturnValue(true)
  mocks.pendingGoogleSession = { callbackUrl: null, isPending: false, returnUrlAttemptId: null }
  mocks.rawCallbackUrl = 'https://app.useorbit.org/auth-callback?code=old'
})

function trackLoginEpoch() {
  let epoch = 0
  mocks.login.mockImplementation(() => {
    const ownedEpoch = ++epoch
    return Promise.resolve(() => epoch === ownedEpoch)
  })
}

async function mountCallback() {
  await TestRenderer.act(async () => {
    TestRenderer.create(<AuthCallbackScreen />)
    await Promise.resolve()
  })
}

it('stops Google callback effects when a replacement login lands during referral storage', async () => {
  trackLoginEpoch()
  mocks.getStoredReferralCode.mockResolvedValue('REF123')
  let releaseReferral!: () => void
  mocks.clearStoredReferralCode.mockImplementation(() => new Promise<void>((resolve) => { releaseReferral = resolve }))

  await mountCallback()
  await vi.waitFor(() => expect(mocks.clearStoredReferralCode).toHaveBeenCalledTimes(1))
  await TestRenderer.act(async () => {
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReferral()
  })

  expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('keeps a newer flow return URL while the older callback waits for login', async () => {
  mocks.pendingGoogleSession = { callbackUrl: 'https://app.useorbit.org/auth-callback?code=old',
    isPending: false, returnUrlAttemptId: 1 }
  let currentAttemptId = 1
  mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((id: number) => id === currentAttemptId)
  let releaseLogin!: () => void
  mocks.login.mockImplementation(() => new Promise<() => boolean>((resolve) => {
    releaseLogin = () => resolve(() => true)
  }))
  let storedUrl = '/older'
  mocks.getStoredAuthReturnUrl.mockImplementation(() => Promise.resolve(storedUrl))
  mocks.clearStoredAuthReturnUrl.mockImplementation(() => { storedUrl = ''; return Promise.resolve() })

  await mountCallback()
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
  currentAttemptId = 2
  storedUrl = '/newer'
  await TestRenderer.act(async () => { releaseLogin(); await Promise.resolve() })

  expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalledWith('/newer')
  expect(storedUrl).toBe('/newer')
})

it('waits for the pending Google session before claiming a raw callback', async () => {
  mocks.pendingGoogleSession = { callbackUrl: null, isPending: true, returnUrlAttemptId: 2 }
  mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((id: number) => id === 2)
  mocks.login.mockResolvedValue(() => true)
  let renderer!: { update: (element: React.ReactElement) => void }
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<AuthCallbackScreen />)
    await Promise.resolve()
  })
  expect(mocks.completeGoogleAuthFromUrl).not.toHaveBeenCalled()

  const newCallbackUrl = 'https://app.useorbit.org/auth-callback?code=new'
  mocks.pendingGoogleSession = { callbackUrl: newCallbackUrl, isPending: false, returnUrlAttemptId: 2 }
  await TestRenderer.act(async () => { renderer.update(<AuthCallbackScreen />); await Promise.resolve() })
  await vi.waitFor(() => expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledWith(newCallbackUrl, 'en', undefined))
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/home'))
})

it('keeps the return URL when a replacement login lands during its storage read', async () => {
  trackLoginEpoch()
  let releaseReturnUrl!: (url: string) => void
  const pendingRead = new Promise<string>((resolve) => { releaseReturnUrl = resolve })
  mocks.consumeStoredAuthReturnUrl.mockReturnValue(pendingRead)
  mocks.getStoredAuthReturnUrl.mockReturnValue(pendingRead)

  await mountCallback()
  await vi.waitFor(() => expect(
    mocks.consumeStoredAuthReturnUrl.mock.calls.length + mocks.getStoredAuthReturnUrl.mock.calls.length,
  ).toBe(1))
  await TestRenderer.act(async () => {
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReturnUrl('/home')
  })

  expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('passes login ownership through pending Google return URL removal', async () => {
  trackLoginEpoch()
  let releaseRemoval!: () => void
  mocks.clearStoredAuthReturnUrl.mockImplementation(() => new Promise<void>((resolve) => { releaseRemoval = resolve }))

  await mountCallback()
  await vi.waitFor(() => expect(mocks.clearStoredAuthReturnUrl).toHaveBeenCalledTimes(1))
  expect(typeof mocks.clearStoredAuthReturnUrl.mock.calls[0]?.[1]).toBe('function')
  await TestRenderer.act(async () => {
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseRemoval()
  })

  expect(mocks.clearStoredAuthReturnUrl.mock.calls[0]?.[1]()).toBe(false)
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('keeps the replacement return URL during reactivated Google continuation cleanup', async () => {
  trackLoginEpoch()
  mocks.completeGoogleAuthFromUrl.mockResolvedValue({ token: 'old-access', refreshToken: 'old-refresh',
    userId: 'old-user', name: 'Old', email: 'old@example.com', wasReactivated: true })
  let releaseRemoval!: () => void
  mocks.clearStoredAuthReturnUrl.mockImplementation(() => new Promise<void>((resolve) => { releaseRemoval = resolve }))

  await mountCallback()
  await vi.waitFor(() => expect(mocks.callbackState).toBe('account'))
  await TestRenderer.act(() => { mocks.continueAccount?.() })
  await vi.waitFor(() => expect(mocks.clearStoredAuthReturnUrl).toHaveBeenCalledTimes(1))
  expect(typeof mocks.clearStoredAuthReturnUrl.mock.calls[0]?.[1]).toBe('function')
  await TestRenderer.act(async () => {
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseRemoval()
  })

  expect(mocks.clearStoredAuthReturnUrl.mock.calls[0]?.[1]()).toBe(false)
  expect(mocks.replace).not.toHaveBeenCalled()
})

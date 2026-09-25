import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import AuthCallbackScreen from '@/app/auth-callback'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  replace: vi.fn(),
  completeGoogleAuthFromUrl: vi.fn(),
  getStoredReferralCode: vi.fn(),
  markReferralApplied: vi.fn(),
  clearStoredReferralCode: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  getStoredAuthReturnUrl: vi.fn(),
  storeAuthReturnUrl: vi.fn(),
  createAuthReturnUrlAttempt: vi.fn(),
  isAuthReturnUrlAttemptCurrent: vi.fn(),
  clearStoredAuthReturnUrl: vi.fn(),
  getSafeReturnUrl: vi.fn(),
  clearPendingGoogleAuthSession: vi.fn(),
  pendingGoogleSession: {
    callbackUrl: null as string | null,
    isPending: false,
    returnUrlAttemptId: null as number | null,
  },
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useLocalSearchParams: () => ({}),
}))

vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('lucide-react-native', () => ({ TriangleAlert: () => null }))
vi.mock('@/lib/google-auth-callback', () => ({
  AUTH_CALLBACK_URL: 'orbit://auth-callback',
  clearPendingGoogleAuthSession: mocks.clearPendingGoogleAuthSession,
  extractGoogleAuthParams: () => ({}),
  resolveGoogleAuthCallbackUrl: () => 'orbit://auth-callback?code=old',
  usePendingGoogleAuthSession: () => mocks.pendingGoogleSession,
}))
vi.mock('@/lib/google-auth', () => ({
  completeGoogleAuthFromUrl: mocks.completeGoogleAuthFromUrl,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { login: typeof mocks.login }) => unknown) =>
    selector({ login: mocks.login }),
}))
vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: mocks.clearStoredReferralCode,
  consumeStoredAuthReturnUrl: mocks.consumeStoredAuthReturnUrl,
  getStoredAuthReturnUrl: mocks.getStoredAuthReturnUrl,
  storeAuthReturnUrl: mocks.storeAuthReturnUrl,
  createAuthReturnUrlAttempt: mocks.createAuthReturnUrlAttempt,
  isAuthReturnUrlAttemptCurrent: mocks.isAuthReturnUrlAttemptCurrent,
  clearStoredAuthReturnUrl: mocks.clearStoredAuthReturnUrl,
  getSafeReturnUrl: mocks.getSafeReturnUrl,
  getStoredReferralCode: mocks.getStoredReferralCode,
  markReferralApplied: mocks.markReferralApplied,
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.completeGoogleAuthFromUrl.mockResolvedValue({
    token: 'old-access', refreshToken: 'old-refresh', userId: 'old-user',
    name: 'Old', email: 'old@example.com',
  })
  mocks.getStoredReferralCode.mockResolvedValue('REF123')
  mocks.consumeStoredAuthReturnUrl.mockResolvedValue('/home')
  mocks.getStoredAuthReturnUrl.mockResolvedValue('/home')
  mocks.getSafeReturnUrl.mockReturnValue('/home')
  mocks.markReferralApplied.mockResolvedValue(undefined)
  mocks.pendingGoogleSession = { callbackUrl: null, isPending: false, returnUrlAttemptId: null }
  mocks.createAuthReturnUrlAttempt.mockReturnValue(0)
  mocks.isAuthReturnUrlAttemptCurrent.mockReturnValue(true)
})

it('leaves referral and navigation untouched when callback login loses ownership', async () => {
  mocks.login.mockResolvedValue(null)

  await TestRenderer.act(async () => {
    TestRenderer.create(
      <I18nextProvider i18n={i18n}>
        <AuthCallbackScreen />
      </I18nextProvider>,
    )
    await Promise.resolve()
  })

  expect(mocks.login).toHaveBeenCalledTimes(1)
  expect(mocks.markReferralApplied).not.toHaveBeenCalled()
  expect(mocks.clearStoredReferralCode).not.toHaveBeenCalled()
  expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('stops Google callback effects when another login takes ownership during referral storage', async () => {
  let epoch = 0
  mocks.login.mockImplementation(() => {
    const ownedEpoch = ++epoch
    return Promise.resolve(() => epoch === ownedEpoch)
  })
  let releaseReferral!: () => void
  mocks.markReferralApplied.mockImplementation(() => new Promise<void>((resolve) => {
    releaseReferral = resolve
  }))

  await TestRenderer.act(async () => {
    TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>)
    await Promise.resolve()
  })
  await vi.waitFor(() => expect(mocks.markReferralApplied).toHaveBeenCalledTimes(1))
  await TestRenderer.act(async () => {
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReferral()
  })

  expect(mocks.clearStoredReferralCode).not.toHaveBeenCalled()
  expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('keeps the return URL when another login takes ownership during its storage read', async () => {
  mocks.getStoredReferralCode.mockResolvedValue(null)
  let epoch = 0
  mocks.login.mockImplementation(() => {
    const ownedEpoch = ++epoch
    return Promise.resolve(() => epoch === ownedEpoch)
  })
  let releaseReturnUrl!: (url: string) => void
  const pendingRead = new Promise<string>((resolve) => { releaseReturnUrl = resolve })
  mocks.consumeStoredAuthReturnUrl.mockReturnValue(pendingRead)
  mocks.getStoredAuthReturnUrl.mockReturnValue(pendingRead)

  await TestRenderer.act(async () => {
    TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>)
    await Promise.resolve()
  })
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

it('does not consume a newer flow return URL before that flow logs in', async () => {
  mocks.getStoredReferralCode.mockResolvedValue(null)
  mocks.pendingGoogleSession = {
    callbackUrl: 'orbit://auth-callback?code=old', isPending: false, returnUrlAttemptId: 1,
  }
  let releaseLogin!: () => void
  mocks.login.mockImplementation(() => new Promise<() => boolean>((resolve) => {
    releaseLogin = () => resolve(() => true)
  }))
  let returnUrl = '/older'
  let attemptId = 1
  mocks.createAuthReturnUrlAttempt.mockImplementation(() => ++attemptId)
  mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((id: number) => id === attemptId)
  mocks.getStoredAuthReturnUrl.mockImplementation(() => Promise.resolve(returnUrl))
  mocks.storeAuthReturnUrl.mockImplementation((url: string) => {
    returnUrl = url
    return Promise.resolve()
  })

  await TestRenderer.act(async () => {
    TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>)
    await Promise.resolve()
  })
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
  await mocks.storeAuthReturnUrl('/newer', mocks.createAuthReturnUrlAttempt())
  await TestRenderer.act(async () => { releaseLogin(); await Promise.resolve() })

  expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalledWith('/newer')
  await expect(mocks.getStoredAuthReturnUrl(attemptId)).resolves.toBe('/newer')
})

it('does not claim a newer pending Google flow when the older callback starts late', async () => {
  mocks.getStoredReferralCode.mockResolvedValue(null)
  mocks.pendingGoogleSession = {
    callbackUrl: null, isPending: true, returnUrlAttemptId: 2,
  }
  mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((id: number) => id === 2)
  mocks.login.mockResolvedValue(() => true)

  await TestRenderer.act(async () => {
    TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>)
    await Promise.resolve()
  })
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))

  expect(mocks.createAuthReturnUrlAttempt).not.toHaveBeenCalled()
  expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

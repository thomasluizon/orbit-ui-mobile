import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import AuthCallbackScreen from '@/app/auth-callback'
import LoginScreen from '@/app/login'
import { AppToast } from '@/components/ui/app-toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { i18n } from '@/lib/i18n'
import { apiClient } from '@/lib/api-client'
import { AUTH_CALLBACK_URL, clearPendingGoogleAuthSessionForLogin, clearPendingGoogleAuthSession, markPendingGoogleAuthSession, setPendingGoogleAuthCallbackUrl } from '@/lib/google-auth-callback'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  params: {},
  rawUrl: null as string | null,
  login: vi.fn(),
  getSessionGeneration: vi.fn(),
  replace: vi.fn(),
  completeGoogleAuthFromUrl: vi.fn(),
  getStoredReferralCode: vi.fn(),
  markReferralApplied: vi.fn(),
  clearStoredReferralCode: vi.fn(),
  getStoredAuthReturnUrl: vi.fn(),
  isAuthReturnUrlAttemptCurrent: vi.fn(),
  clearStoredAuthReturnUrl: vi.fn(),
  getSafeReturnUrl: vi.fn(),
  allowGoogleErrorLogin: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useLocalSearchParams: () => mocks.params,
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => mocks.rawUrl }))
vi.mock('@/lib/google-auth-callback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google-auth-callback')>()
  return {
    ...actual,
    allowGoogleErrorLogin: mocks.allowGoogleErrorLogin,
  }
})
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: mocks.completeGoogleAuthFromUrl }))
vi.mock('@/stores/auth-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/stores/auth-store')>(),
  getSessionGeneration: mocks.getSessionGeneration,
  useAuthStore: (selector: (state: { login: typeof mocks.login }) => unknown) => selector({ login: mocks.login }),
}))
vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: mocks.clearStoredReferralCode,
  getStoredAuthReturnUrl: mocks.getStoredAuthReturnUrl,
  isAuthReturnUrlAttemptCurrent: mocks.isAuthReturnUrlAttemptCurrent,
  clearStoredAuthReturnUrl: mocks.clearStoredAuthReturnUrl,
  getSafeReturnUrl: mocks.getSafeReturnUrl,
  getStoredReferralCode: mocks.getStoredReferralCode,
  markReferralApplied: mocks.markReferralApplied,
  createAuthReturnUrlAttempt: () => 1,
  storeAuthReturnUrl: vi.fn(),
  storeReferralCode: vi.fn(),
  isSafeReturnUrl: () => true,
  isValidReferralCode: () => false,
  isValidVerificationCode: () => false,
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => null }))
vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: (easing: unknown) => easing,
  usePrefersReducedMotion: () => true,
  getPrefersReducedMotion: () => Promise.resolve(true),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: Object.assign(
    (selector: (state: { onboardingLocallyDone: boolean; habits: unknown[] }) => unknown) =>
      selector({ onboardingLocallyDone: false, habits: [] }),
    { getState: () => ({ onboardingLocallyDone: false, habits: [] }) },
  ),
}))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))
vi.mock('@/lib/orbit-widget', () => ({ clearWidgetToken: vi.fn(async () => {}), saveWidgetToken: vi.fn(async () => {}) }))
vi.mock('@/lib/persistent-reminder', () => ({ cancelPersistentReminder: vi.fn(async () => {}) }))
vi.mock('@/lib/offline-queue', () => ({ clear: vi.fn() }))
vi.mock('@/lib/offline-mutations', () => ({ cancelScheduledFlush: vi.fn(), resumeOfflineReplay: vi.fn() }))
vi.mock('@/lib/offline-state', () => ({ clearOfflineState: vi.fn(async () => {}) }))
vi.mock('@/lib/query-client', () => ({
  queryClient: {},
  clearPersistedQueryCache: vi.fn(async () => {}),
  setQueryCacheScope: vi.fn(async () => {}),
}))
vi.mock('@orbit/shared/query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/query')>(),
  resetAccountQueries: vi.fn(async () => {}),
}))
vi.mock('@/stores/chat-store', () => ({ useChatStore: { getState: () => ({ clearMessages: vi.fn() }) } }))
vi.mock('@/stores/review-reminder-store', () => ({ useReviewReminderStore: { getState: () => ({ setAccountScope: vi.fn() }) } }))
vi.mock('@/lib/account-scoped-state', () => ({ startAccountScopedSession: vi.fn(async () => {}) }))
vi.mock('@/hooks/use-push-notifications', () => ({ unsubscribePushToken: vi.fn(async () => {}) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(apiClient).mockResolvedValue(undefined)
  mocks.params = {}
  mocks.rawUrl = `${AUTH_CALLBACK_URL}?code=one-use&state=s`
  useAppToastStore.setState({ currentToast: null, queue: [] })
  mocks.getSessionGeneration.mockReturnValue({ epoch: 0, credentialVersion: 0 })
  mocks.getStoredReferralCode.mockResolvedValue(null)
  mocks.getStoredAuthReturnUrl.mockResolvedValue('/')
  mocks.getSafeReturnUrl.mockReturnValue('/')
  mocks.login.mockResolvedValue(() => true)
  clearPendingGoogleAuthSession()
  markPendingGoogleAuthSession(0, 'verifier', 's')
  setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=one-use&state=s`, 0)
  mocks.isAuthReturnUrlAttemptCurrent.mockReturnValue(true)
})

const success = { token: 'a', refreshToken: 'r', userId: 'u', name: 'N', email: 'e@example.com' }

const renderers: ReturnType<typeof TestRenderer.create>[] = []

afterEach(() => {
  TestRenderer.act(() => { renderers.splice(0).forEach((renderer) => renderer.unmount()) })
  clearPendingGoogleAuthSession()
  useAppToastStore.setState({ currentToast: null, queue: [] })
  vi.useRealTimers()
})

async function mountCallbackScreens(count = 2) {
  await TestRenderer.act(async () => {
    for (let index = 0; index < count; index += 1) {
      renderers.push(TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>))
    }
    await Promise.resolve()
  })
}

it('exchanges the single-use Google code once when the callback screen mounts twice', async () => {
  mocks.completeGoogleAuthFromUrl.mockResolvedValue(success)
  await mountCallbackScreens()
  await vi.waitFor(() => expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalled())
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
})

it('a rejected duplicate exchange never sends a signed-in person back to login', async () => {
  mocks.completeGoogleAuthFromUrl
    .mockResolvedValueOnce(success)
    .mockRejectedValueOnce(new Error('Could not exchange Google sign-in code'))
  await mountCallbackScreens()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  expect(mocks.login).toHaveBeenCalledTimes(1)
  expect(mocks.replace).not.toHaveBeenCalledWith('/login?googleError=1')
  expect(mocks.allowGoogleErrorLogin).not.toHaveBeenCalled()
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
})

it('keeps a completed callback single flight when login clears pending credentials and a screen remounts', async () => {
  mocks.login.mockImplementation(() => {
    clearPendingGoogleAuthSessionForLogin()
    mocks.getSessionGeneration.mockReturnValue({ epoch: 1, credentialVersion: 1 })
    return Promise.resolve(() => true)
  })
  mocks.completeGoogleAuthFromUrl.mockResolvedValue(success)
  await mountCallbackScreens()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  TestRenderer.act(() => { renderers.splice(0).forEach((renderer) => renderer.unmount()) })
  await mountCallbackScreens()
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
  expect(mocks.login).toHaveBeenCalledTimes(1)
  expect(mocks.replace).toHaveBeenCalledTimes(1)
  expect(mocks.allowGoogleErrorLogin).not.toHaveBeenCalled()
})

it.each(['logout', 'credential teardown'])('exits a callback revisit after real %s without exchanging again', async (teardown) => {
  const auth = await vi.importActual<typeof import('@/stores/auth-store')>('@/stores/auth-store')
  const flow = await vi.importActual<typeof import('@/lib/auth-flow')>('@/lib/auth-flow')
  const attemptId = flow.createAuthReturnUrlAttempt()
  markPendingGoogleAuthSession(attemptId, 'verifier', 's')
  setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=one-use&state=s`, attemptId)
  mocks.getSessionGeneration.mockImplementation(auth.getSessionGeneration)
  mocks.isAuthReturnUrlAttemptCurrent.mockImplementation(flow.isAuthReturnUrlAttemptCurrent)
  mocks.clearStoredAuthReturnUrl.mockImplementation(flow.clearStoredAuthReturnUrl)
  mocks.login.mockImplementation(auth.useAuthStore.getState().login)
  mocks.completeGoogleAuthFromUrl.mockResolvedValue(success)
  await mountCallbackScreens()
  expect(auth.useAuthStore.getState().isAuthenticated).toBe(true)
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
  TestRenderer.act(() => { renderers.splice(0).forEach((renderer) => renderer.unmount()) })
  await mountCallbackScreens(1)
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
  TestRenderer.act(() => { renderers.splice(0).forEach((renderer) => renderer.unmount()) })

  const cleared = teardown === 'logout'
    ? await auth.useAuthStore.getState().logout()
    : await auth.clearSessionAndResetAuth({ authority: 'observed-credential', ...auth.getSessionGeneration() })
  expect(cleared).toBe(true)
  expect(auth.useAuthStore.getState().isAuthenticated).toBe(false)
  mocks.replace.mockClear()
  mocks.rawUrl = AUTH_CALLBACK_URL
  vi.useFakeTimers()
  await mountCallbackScreens(1)
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(250) })
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login')
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
  expect(mocks.login).toHaveBeenCalledTimes(1)
  expect(mocks.allowGoogleErrorLogin).not.toHaveBeenCalled()
})

it.each(['resolves', 'rejects'])('ignores an exchange that %s after a newer Google attempt starts', async (outcome) => {
  let finish!: () => void
  mocks.completeGoogleAuthFromUrl.mockReturnValue(new Promise((resolve, reject) => {
    finish = () => outcome === 'resolves' ? resolve(success) : reject(new Error('Expired attempt'))
  }))
  await mountCallbackScreens()
  await vi.waitFor(() => expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledOnce())
  TestRenderer.act(() => { markPendingGoogleAuthSession(1, 'new-verifier', 'new-state') })
  mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((attemptId: number) => attemptId === 1)
  await TestRenderer.act(async () => { finish(); await Promise.resolve() })
  expect(mocks.login).not.toHaveBeenCalled()
  expect(mocks.allowGoogleErrorLogin).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(setPendingGoogleAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=new&state=new-state`, 1)).toBe(true)
})

it('renders the localized login error after the single exchange genuinely fails', async () => {
  mocks.completeGoogleAuthFromUrl.mockRejectedValue(new Error('Google code exchange failed'))
  await mountCallbackScreens(1)
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
  expect(mocks.login).not.toHaveBeenCalled()
  expect(mocks.allowGoogleErrorLogin).toHaveBeenCalledTimes(1)
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login?googleError=1')

  mocks.params = { googleError: '1' }
  let loginScreen!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    loginScreen = TestRenderer.create(
      <I18nextProvider i18n={i18n}><LoginScreen /><AppToast /></I18nextProvider>,
    )
    renderers.push(loginScreen)
    await Promise.resolve()
  })
  const message = i18n.t('auth.errors.googleError')
  expect(message).not.toBe('auth.errors.googleError')
  expect(loginScreen.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
    node.type === 'Text' && node.props.children === message,
  )).toHaveLength(1)
})

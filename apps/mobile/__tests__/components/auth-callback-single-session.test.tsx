import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import AuthCallbackScreen from '@/app/auth-callback'
import { i18n } from '@/lib/i18n'
import { AUTH_CALLBACK_URL, clearPendingGoogleAuthSession, markPendingGoogleAuthSession, setPendingGoogleAuthCallbackUrl } from '@/lib/google-auth-callback'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
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
  useLocalSearchParams: () => ({}),
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('lucide-react-native', () => ({ TriangleAlert: () => null }))
vi.mock('@/lib/google-auth-callback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google-auth-callback')>()
  return {
    ...actual,
    allowGoogleErrorLogin: mocks.allowGoogleErrorLogin,
  }
})
vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: mocks.completeGoogleAuthFromUrl }))
vi.mock('@/stores/auth-store', () => ({
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
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))

beforeEach(() => {
  vi.resetAllMocks()
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
})

async function mountTwoCallbackScreens() {
  await TestRenderer.act(async () => {
    renderers.push(TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>))
    renderers.push(TestRenderer.create(<I18nextProvider i18n={i18n}><AuthCallbackScreen /></I18nextProvider>))
    await Promise.resolve()
  })
}

it('exchanges the single-use Google code once when the callback screen mounts twice', async () => {
  mocks.completeGoogleAuthFromUrl.mockResolvedValue(success)
  await mountTwoCallbackScreens()
  await vi.waitFor(() => expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalled())
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
})

it('a rejected duplicate exchange never sends a signed-in person back to login', async () => {
  mocks.completeGoogleAuthFromUrl
    .mockResolvedValueOnce(success)
    .mockRejectedValueOnce(new Error('Could not exchange Google sign-in code'))
  await mountTwoCallbackScreens()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  expect(mocks.login).toHaveBeenCalledTimes(1)
  expect(mocks.completeGoogleAuthFromUrl).toHaveBeenCalledTimes(1)
  expect(mocks.allowGoogleErrorLogin).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalledWith('/login?googleError=1')
})

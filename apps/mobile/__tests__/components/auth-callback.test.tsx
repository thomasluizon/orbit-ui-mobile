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
  getSafeReturnUrl: vi.fn(),
  clearPendingGoogleAuthSession: vi.fn(),
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
  usePendingGoogleAuthSession: () => ({ callbackUrl: null, isPending: false }),
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
  getSafeReturnUrl: mocks.getSafeReturnUrl,
  getStoredReferralCode: mocks.getStoredReferralCode,
  markReferralApplied: mocks.markReferralApplied,
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.completeGoogleAuthFromUrl.mockResolvedValue({
    token: 'old-access', refreshToken: 'old-refresh', userId: 'old-user',
    name: 'Old', email: 'old@example.com',
  })
  mocks.getStoredReferralCode.mockResolvedValue('REF123')
  mocks.consumeStoredAuthReturnUrl.mockResolvedValue('/home')
  mocks.getSafeReturnUrl.mockReturnValue('/home')
})

it('leaves referral and navigation untouched when callback login loses ownership', async () => {
  mocks.login.mockResolvedValue(false)

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

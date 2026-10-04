import React from 'react'
import { TextInput } from 'react-native'
import { __focusHost, __getFocusedNativeTag, __setTouchMode } from '@/test-mocks/react-native'
import { expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import { setI18n } from 'react-i18next'
import en from '@orbit/shared/i18n/en.json'
import { createApiClientError } from '@orbit/shared/utils'

import { LoginContent } from '@/components/auth/login-content'

vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({
  resources: { en: { translation: en } },
  lng: 'en', fallbackLng: 'en', initAsync: false,
})
setI18n(testI18n)

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  isOnline: true,
  params: {},
  apiClient: vi.fn(),
  login: vi.fn(),
  showError: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  getStoredReferralCode: vi.fn(),
  getStoredAuthReturnUrl: vi.fn(),
  createAuthReturnUrlAttempt: vi.fn(),
  isAuthReturnUrlAttemptCurrent: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  clearStoredAuthReturnUrl: vi.fn(),
  clearStoredReferralCode: vi.fn(),
  startMobileGoogleAuth: vi.fn(),
  openGoogleBrowser: vi.fn(),
}))

vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: (easing: unknown) => easing,
  usePrefersReducedMotion: () => true,
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View } = await import('react-native')
  return { useKeyboardAwareInputReveal: () => null, KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => React.createElement(View, {}, children) }
})

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => null }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { login: unknown }) => unknown) => selector({ login: mocks.login }),
}))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useLocalSearchParams: () => mocks.params,
}))

vi.mock('@/lib/auth-flow', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-flow')>(),
  clearStoredReferralCode: mocks.clearStoredReferralCode,
  clearStoredAuthReturnUrl: mocks.clearStoredAuthReturnUrl,
  consumeStoredAuthReturnUrl: mocks.consumeStoredAuthReturnUrl,
  getStoredAuthReturnUrl: mocks.getStoredAuthReturnUrl,
  createAuthReturnUrlAttempt: mocks.createAuthReturnUrlAttempt,
  isAuthReturnUrlAttemptCurrent: mocks.isAuthReturnUrlAttemptCurrent,
  getStoredReferralCode: mocks.getStoredReferralCode,
  isSafeReturnUrl: () => true,
  isValidReferralCode: () => false,
  storeAuthReturnUrl: vi.fn(),
  storeReferralCode: vi.fn(),
}))

vi.mock('@/lib/google-auth', () => ({ startMobileGoogleAuth: mocks.startMobileGoogleAuth }))
vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.openGoogleBrowser,
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: () => Promise.resolve(new Uint8Array(32).fill(7)),
  digestStringAsync: () => Promise.resolve('challenge='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (state: { onboardingLocallyDone: boolean; habits: unknown[] }) => unknown,
  ) => selector({ onboardingLocallyDone: false, habits: [] }),
}))



it('returns focus to the editable OTP after a pending wrong-code rejection', async () => {
  mocks.getStoredReferralCode.mockResolvedValue(undefined)
  mocks.apiClient.mockResolvedValueOnce({})
  let rejectCode!: (error: unknown) => void
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<><LoginContent /><TextInput accessibilityLabel="Another field" /></>); return Promise.resolve() })
  const input = (label: string) => tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === label)[0]!
  await TestRenderer.act(() => Promise.resolve((input('auth.email').props.onChangeText as (value: string) => void)('user@test.com')))
  await TestRenderer.act(() => Promise.resolve((input('auth.email').props.onSubmitEditing as () => void)()))
  mocks.apiClient.mockImplementationOnce(() => new Promise((_, reject) => { rejectCode = reject }))
  const code = input('auth.verificationCode')
  await TestRenderer.act(() => Promise.resolve((code.props.onChangeText as (value: string) => void)('123456')))
  expect(code.props.editable).toBe(false)
  __setTouchMode(false)
  const away = input('Another field')
  TestRenderer.act(() => __focusHost(away.props.__nativeTag as number))
  expect(__getFocusedNativeTag()).toBe(away.props.__nativeTag)
  await TestRenderer.act(() => Promise.resolve(rejectCode(createApiClientError(400, { errorCode: 'INVALID_VERIFICATION_CODE' }, 'Invalid verification code'))))
  expect(code.props.editable).toBe(true)
  expect(code.props.accessibilityHint).toBe('auth.errors.invalidCode')
  expect(__getFocusedNativeTag()).toBe(code.props.__nativeTag)
  TestRenderer.act(() => tree.update(<></>))
})

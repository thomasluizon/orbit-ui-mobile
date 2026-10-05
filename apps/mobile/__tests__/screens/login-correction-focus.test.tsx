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

it.each([
  { step: 'email', mixed: true }, { step: 'code', mixed: true },
  { step: 'email', mixed: false }, { step: 'code', mixed: false },
])('recovers from pending validation in the owning $step form (mixed: $mixed)', async ({ step, mixed }) => {
  mocks.apiClient.mockReset()
  mocks.getStoredReferralCode.mockResolvedValue(undefined)
  if (step === 'code') mocks.apiClient.mockResolvedValueOnce({})
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<><LoginContent /><TextInput accessibilityLabel="Another field" /></>); return Promise.resolve() })
  const input = (label: string) => tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === label)[0]!
  const label = step === 'email' ? 'auth.email' : 'auth.verificationCode'
  const change = (value: string) => (input(label).props.onChangeText as (value: string) => void)(value)
  const submitEmail = () => (input('auth.email').props.onSubmitEditing as () => void)()
  const field = step === 'email' ? 'Email' : 'Code'
  const value = step === 'email' ? 'user@test.com' : '123456'
  try {
    await TestRenderer.act(() => Promise.resolve((input('auth.email').props.onChangeText as (value: string) => void)('user@test.com')))
    if (step === 'code') await TestRenderer.act(() => Promise.resolve(submitEmail()))
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let rejectValidation!: (error: unknown) => void
      mocks.apiClient.mockImplementationOnce(() => new Promise((_, reject) => { rejectValidation = reject }))
      await TestRenderer.act(() => { change(value); if (step === 'email') submitEmail(); return Promise.resolve() })
      const control = input(label)
      expect(control.props.editable).toBe(false)
      __setTouchMode(false)
      const away = input('Another field')
      TestRenderer.act(() => __focusHost(away.props.__nativeTag as number))
      expect(__getFocusedNativeTag()).toBe(away.props.__nativeTag)
      await TestRenderer.act(() => {
        rejectValidation(createApiClientError(400, {
          errors: { ...(mixed ? { [field]: ['Field failure'] } : {}), Other: ['Other failure', 'Second failure'] },
        }, 'Validation failed'))
        return Promise.resolve()
      })
      expect(control.props.editable).toBe(true)
      if (mixed) expect(control.props.accessibilityHint).toBe('Field failure')
      else expect(control.props.accessibilityHint ?? '').not.toContain('Field failure')
      expect(__getFocusedNativeTag()).toBe(mixed ? control.props.__nativeTag : away.props.__nativeTag)
      expect(control.props.value).toBe(value)
      expect(tree.root.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLiveRegion === 'polite')
        .some((region) => region.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Other failure\nSecond failure').length > 0)).toBe(true)
      if (attempt === 0) {
        await TestRenderer.act(() => Promise.resolve(change(step === 'email' ? 'corrected@test.com' : '12345')))
        expect(control.props.accessibilityHint ?? '').not.toContain('Field failure')
        expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Other failure\nSecond failure')).toHaveLength(0)
      }
    }
    mocks.apiClient.mockRejectedValueOnce(createApiClientError(400, {
      errors: { Other: ['Unknown first', 'Unknown second'] },
    }, 'Validation failed'))
    await TestRenderer.act(() => { change(step === 'email' ? 'corrected@test.com' : '123457'); if (step === 'email') submitEmail(); return Promise.resolve() })
    const control = input(label)
    expect(control.props.accessibilityHint ?? '').not.toContain('Field failure')
    expect(control.props.value).toBe(step === 'email' ? 'corrected@test.com' : '123457')
    expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Unknown first\nUnknown second')).toHaveLength(1)
  } finally {
    TestRenderer.act(() => tree.update(<></>))
  }
})

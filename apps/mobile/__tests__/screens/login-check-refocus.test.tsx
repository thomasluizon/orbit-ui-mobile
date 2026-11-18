import React from 'react'
import { TextInput } from 'react-native'
import { __focusHost, __getFocusedNativeTag, __setTouchMode } from '@/test-mocks/react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { LoginContent } from '@/components/auth/login-content'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  getStoredReferralCode: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) => React.createElement('WebView', props),
}))
vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: (easing: unknown) => easing,
  usePrefersReducedMotion: () => true,
  useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true),
}))
vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View } = await import('react-native')
  return { useKeyboardAwareInputReveal: () => null, KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => React.createElement(View, {}, children) }
})
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign((selector: (state: { login: unknown; isLoading: boolean }) => unknown) => selector({ login: vi.fn(), isLoading: false }), {
    getState: () => ({ isAuthenticated: false, isLoading: false }),
    subscribe: () => () => {},
  }),
  getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: vi.fn() }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({}),
}))
vi.mock('@/lib/auth-flow', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-flow')>(),
  clearStoredReferralCode: vi.fn(),
  clearStoredAuthReturnUrl: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  getStoredAuthReturnUrl: vi.fn(),
  getStoredReferralCode: mocks.getStoredReferralCode,
  isSafeReturnUrl: () => true,
  isValidReferralCode: () => false,
  storeAuthReturnUrl: vi.fn(),
  storeReferralCode: vi.fn(),
}))
vi.mock('@/lib/google-auth', () => ({ startMobileGoogleAuth: vi.fn() }))
vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: () => Promise.resolve(new Uint8Array(32).fill(7)),
  digestStringAsync: () => Promise.resolve('challenge='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (selector: (state: { onboardingLocallyDone: boolean; habits: unknown[] }) => unknown) =>
    selector({ onboardingLocallyDone: false, habits: [] }),
}))

afterEach(() => vi.unstubAllEnvs())

function webViewMessage(tree: import('react-test-renderer').ReactTestRenderer) {
  const onMessage = tree.root.findAll((node) => String(node.type) === 'WebView')[0]!.props.onMessage as
    (event: { nativeEvent: { data: string } }) => void
  return (message: object) => onMessage({ nativeEvent: { data: JSON.stringify(message) } })
}

it.each(['', '12'])('gives the code field focus back when the code screen check passes with "%s" typed', async (typed) => {
  vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
  mocks.apiClient.mockReset()
  mocks.apiClient.mockResolvedValueOnce({})
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<><LoginContent /><TextInput accessibilityLabel="Another field" /></>); return Promise.resolve() })
  const input = (label: string) => tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === label)[0]!
  const passCheck = (token: string) => TestRenderer.act(async () => {
    const send = webViewMessage(tree)
    send({ token })
    send({ state: 'solved' })
    await Promise.resolve()
  })
  try {
    await passCheck('email-token')
    await TestRenderer.act(() => Promise.resolve((input('auth.email').props.onChangeText as (value: string) => void)('user@test.com')))
    await TestRenderer.act(() => Promise.resolve((input('auth.email').props.onSubmitEditing as () => void)()))
    const code = input('auth.verificationCode')
    if (typed) await TestRenderer.act(() => Promise.resolve((code.props.onChangeText as (value: string) => void)(typed)))
    __setTouchMode(false)
    const away = input('Another field')
    TestRenderer.act(() => __focusHost(away.props.__nativeTag as number))
    expect(__getFocusedNativeTag()).toBe(away.props.__nativeTag)

    await passCheck('code-token')
    expect(__getFocusedNativeTag()).toBe(code.props.__nativeTag)
  } finally {
    TestRenderer.act(() => tree.update(<></>))
  }
})

it('leaves focus alone when the e-mail screen check passes', async () => {
  vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<><LoginContent /><TextInput accessibilityLabel="Another field" /></>); return Promise.resolve() })
  const away = tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'Another field')[0]!
  __setTouchMode(false)
  TestRenderer.act(() => __focusHost(away.props.__nativeTag as number))
  await TestRenderer.act(async () => {
    webViewMessage(tree)({ token: 'email-token' })
    await Promise.resolve()
  })
  expect(__getFocusedNativeTag()).toBe(away.props.__nativeTag)
  TestRenderer.act(() => tree.update(<></>))
})

import React from 'react'
import { Platform } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import { setI18n } from 'react-i18next'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError } from '@orbit/shared/utils'

import { useLoginFlow } from '@/app/use-login-flow'
import { LoginContent } from '@/components/auth/login-content'
import LoginScreen from '@/app/login'
import AuthCallbackScreen from '@/app/auth-callback'
import { PillButton } from '@/components/ui/pill-button'

vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => mocks.localized ? String(testI18n.t(key, params)) : params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: mocks.language },
  }),
}))

const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: 'en', fallbackLng: 'en', initAsync: false,
})
setI18n(testI18n)

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  isOnline: true,
  authenticated: false,
  authLoading: false,
  epoch: 0,
  authListeners: new Set<() => void>(),
  setParams: vi.fn(),
  localized: false,
  language: 'en',
  params: {},
  codeDigits: ['', '', '', '', '', ''],
  apiClient: vi.fn(),
  login: vi.fn(),
  showError: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  resetCodeDigits: vi.fn(),
  setCodeDigits: vi.fn(),
  startResendCountdown: vi.fn(),
  focus: vi.fn(),
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

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return { ...actual, Keyboard: { addListener: () => ({ remove: () => {} }) },
    TextInput: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({ focus: mocks.focus }))
      return React.createElement('TextInput', props)
    }) }
})

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
  useAuthStore: Object.assign((selector: (state: { login: unknown; isLoading: boolean }) => unknown) => selector({ login: mocks.login, isLoading: mocks.authLoading }), {
    getState: () => ({ isAuthenticated: mocks.authenticated, isLoading: mocks.authLoading }),
    subscribe: (listener: () => void) => { mocks.authListeners.add(listener); return () => { mocks.authListeners.delete(listener) } },
  }),
  getSessionGeneration: () => ({ epoch: mocks.epoch, credentialVersion: 0 }),
}))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, setParams: mocks.setParams }),
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

vi.mock('@/lib/google-auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/google-auth')>(),
  startMobileGoogleAuth: mocks.startMobileGoogleAuth,
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
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

interface Harness {
  readonly current: ReturnType<typeof useLoginFlow>
  rerender: () => void
  unmount: () => void
}

const mountedHooks: { unmount: () => void }[] = []

async function renderLoginFlow(isAuthCallback = false): Promise<Harness> {
  const holder: { current: ReturnType<typeof useLoginFlow> | null } = { current: null }
  let renderer!: { update: (element: React.ReactElement) => void; unmount: () => void }

  function Probe() {
    holder.current = useLoginFlow(isAuthCallback)
    return null
  }

  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe))
    await Promise.resolve()
  })
  mountedHooks.push(renderer)
  if (mocks.codeDigits.join('')) {
    await TestRenderer.act(() => { holder.current?.setCodeDigits(mocks.codeDigits); holder.current?.setEmail('user@test.com') })
  }

  return {
    rerender: () => renderer.update(React.createElement(Probe)),
    unmount: () => renderer.unmount(),
    get current() {
      if (!holder.current) throw new Error('useLoginFlow did not render')
      return holder.current
    },
  }
}

async function act(action: () => void | Promise<void>): Promise<void> {
  await TestRenderer.act(async () => {
    await action()
  })
}

function firstApiCall(): [string, { body: string }] {
  const call = mocks.apiClient.mock.calls[0]
  if (!call) throw new Error('apiClient was not called')
  return call as [string, { body: string }]
}

function bodyOf(options: { body: string }): Record<string, unknown> {
  return JSON.parse(options.body)
}

beforeEach(() => {
  Platform.OS = 'android'
  vi.resetAllMocks()
  mocks.localized = false
  mocks.language = 'en'
  mocks.isOnline = true
  mocks.authenticated = false
  mocks.authLoading = false
  mocks.epoch = 0
  mocks.params = {}
  mocks.codeDigits = ['', '', '', '', '', '']
  mocks.apiClient.mockResolvedValue({})
  mocks.login.mockResolvedValue(() => true)
  mocks.getStoredReferralCode.mockResolvedValue(undefined)
  mocks.consumeStoredAuthReturnUrl.mockResolvedValue(undefined)
  mocks.getStoredAuthReturnUrl.mockResolvedValue(undefined)
  mocks.createAuthReturnUrlAttempt.mockReturnValue(1)
  mocks.isAuthReturnUrlAttemptCurrent.mockReturnValue(true)
  mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'cancel' })
})

afterEach(async () => {
  await act(() => { for (const mounted of mountedHooks.splice(0)) mounted.unmount() })
  vi.unstubAllEnvs(); vi.useRealTimers()
})

it('completes a valid email link once through the ordinary verification request', async () => {
  mocks.params = { email: 'user@test.com', code: '123456' }
  mocks.apiClient.mockResolvedValue({ token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'user@test.com', wasReactivated: false })
  const harness = await renderLoginFlow()
  expect(harness.current.step === 'code').toBe(true)
  expect(harness.current.codeDigits.join('') === '123456').toBe(true)
  expect(mocks.apiClient.mock.calls.filter(([endpoint]) => endpoint === API.auth.verifyCode).length).toBe(1)
  expect(mocks.login).toHaveBeenCalledTimes(1)
})

it('shows the localized Google callback error after a failed calendar connection', async () => {
  mocks.params = { googleError: '1' }
  const harness = await renderLoginFlow()
  expect(harness.current.errorMessage).toBe('auth.errors.googleError')
})

it('uses a fresh bridge token for each mobile auth request', async () => {
  vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  vi.useFakeTimers()
  mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
  const harness = await renderLoginFlow()
  await act(() => harness.current.setEmail('user@test.com'))

  expect(harness.current.canSubmitEmail).toBe(false)
  expect(harness.current.canSubmitCode).toBe(false)
  await act(() => harness.current.sendCode())
  expect(mocks.apiClient).not.toHaveBeenCalled()

  await act(() => harness.current.onTurnstileToken('send-token'))
  expect(harness.current.canSubmitEmail).toBe(true)
  await act(() => harness.current.sendCode())
  expect(bodyOf(mocks.apiClient.mock.calls[0]![1])).toMatchObject({ turnstileToken: 'send-token' })
  expect(harness.current.canSubmitCode).toBe(false)
  expect(harness.current.turnstileResetKey).toBe(1)

  await act(() => { vi.advanceTimersByTime(60_000) })
  await act(() => harness.current.onTurnstileToken('resend-token'))
  await act(() => harness.current.resendCode())
  expect(bodyOf(mocks.apiClient.mock.calls[1]![1])).toMatchObject({ turnstileToken: 'resend-token' })

  await act(() => harness.current.onTurnstileToken('verify-token'))
  await act(() => harness.current.verifyCode('123456'))
  expect(bodyOf(mocks.apiClient.mock.calls[2]![1])).toMatchObject({ turnstileToken: 'verify-token' })
  expect(harness.current.turnstileResetKey).toBe(3)
})

it('auto-submits a completed mobile code after its widget token arrives', async () => {
  vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  const harness = await renderLoginFlow()
  await act(() => harness.current.setEmail('user@test.com'))
  await act(() => harness.current.onTurnstileToken('send-token'))
  await act(() => harness.current.sendCode())

  await act(() => harness.current.onCodeChange('123456'))
  expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  await act(() => harness.current.onTurnstileToken('delayed-verify-token'))
  expect(bodyOf(mocks.apiClient.mock.calls[1]![1])).toMatchObject({
    code: '123456', turnstileToken: 'delayed-verify-token',
  })
})

it.each(['before', 'during'])('does not replay a mobile code completed %s an offline interval', async (timing) => {
  vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
  const harness = await renderLoginFlow()
  await act(() => harness.current.setEmail('user@test.com'))
  await act(() => harness.current.onTurnstileToken('send-token'))
  await act(() => harness.current.sendCode())

  if (timing === 'before') await act(() => harness.current.onCodeChange('123456'))
  mocks.isOnline = false
  await act(() => harness.rerender())
  if (timing === 'during') await act(() => harness.current.onCodeChange('123456'))
  expect(mocks.apiClient).toHaveBeenCalledTimes(1)

  mocks.isOnline = true
  await act(() => harness.rerender())
  await act(() => harness.current.onTurnstileToken('fresh-verify-token'))
  expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  expect(harness.current.codeDigits.join('')).toBe('123456')

  await act(() => harness.current.verifyCode())
  expect(bodyOf(mocks.apiClient.mock.calls[1]![1])).toMatchObject({
    code: '123456', turnstileToken: 'fresh-verify-token',
  })
  expect(mocks.apiClient).toHaveBeenCalledTimes(2)
})

describe('useLoginFlow (mobile)', () => {
  it('does not replace a callback attempt when LoginContent mounts without a return URL', async () => {
    await act(() => { TestRenderer.create(React.createElement(LoginContent,
      { callback: { state: 'pending', onContinue: () => {} } })) })
    expect(mocks.createAuthReturnUrlAttempt).not.toHaveBeenCalled()
  })

  it('clears an older return URL before code login without one starts', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({ token: 'access', refreshToken: 'refresh',
      userId: 'user', name: 'User', email: 'user@test.com' })
    let releaseLogin!: () => void
    mocks.login.mockImplementation(() => new Promise<() => boolean>((resolve) => {
      releaseLogin = () => resolve(() => true)
    }))
    const harness = await renderLoginFlow()
    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    expect(mocks.clearStoredAuthReturnUrl).toHaveBeenCalledWith(1)
    releaseLogin()
    await verification
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/(tabs)')
    expect(mocks.replace).not.toHaveBeenCalledWith('/')
    expect(mocks.replace).not.toHaveBeenCalledWith('/older')
  })

  it('returns focus from the login submit action on every invalid attempt without stealing focus during editing', async () => {
    let tree: { root: { findAllByType: (type: string) => { props: Record<string, unknown> }[] }; unmount: () => void }
    await act(() => { tree = TestRenderer.create(React.createElement(LoginContent)) })
    const input = () => tree.root.findAllByType('TextInput')[0]!
    await act(() => (input().props.onChangeText as (value: string) => void)('not-an-email'))
    expect(mocks.focus).not.toHaveBeenCalled()
    const submit = tree!.root.findAllByType('Pressable').find((node) => node.props.accessibilityRole === 'button')!
    await act(() => (submit.props.onPress as () => void)())
    expect(mocks.focus).toHaveBeenCalledTimes(1)
    expect(input().props.accessibilityHint).toBe('auth.errors.invalidEmail')
    await act(() => (input().props.onChangeText as (value: string) => void)('still-invalid'))
    expect(mocks.focus).toHaveBeenCalledTimes(1)
    await act(() => (input().props.onSubmitEditing as () => void)())
    expect(mocks.focus).toHaveBeenCalledTimes(2)
    expect(mocks.apiClient).not.toHaveBeenCalled()
    await act(() => (input().props.onChangeText as (value: string) => void)('person@example.com'))
    await act(() => (input().props.onSubmitEditing as () => void)())
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(input().props.autoComplete).toBe('email-otp')
    await act(() => tree.unmount())
  })

  it('blocks sending a code while offline and surfaces the offline error', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling the API', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('not-an-email'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(harness.current).toMatchObject({ errorMessage: 'auth.errors.invalidEmail' })
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('sends the code, advances to the code step, and starts the resend countdown', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())

    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.sendCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', language: 'en' })
    expect(harness.current.step).toBe('code')
    expect(harness.current.successMessage).toBe('auth.codeSent')
    expect(harness.current.resendCountdown).toBe(60)
  })

  it('verifies the code, logs in with the returned session, and redirects to the safe return url', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.consumeStoredAuthReturnUrl.mockResolvedValue('/home')
    mocks.getStoredAuthReturnUrl.mockResolvedValue('/home')
    mocks.apiClient.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
      wasReactivated: false,
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.verifyCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', code: '123456', language: 'en' })
    expect(mocks.login).toHaveBeenCalledWith('access-token', 'refresh-token', {
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
    }, 0, expect.any(Function), expect.any(Function))
    expect(mocks.replace).toHaveBeenCalledWith('/home')
  })

  it('stops magic-code effects when a replacement login lands during referral storage', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({ token: 'old-access', refreshToken: 'old-refresh',
      userId: 'old-user', name: 'Old', email: 'old@example.com' })
    mocks.getStoredReferralCode.mockResolvedValue('REF123')
    let epoch = 0
    mocks.login.mockImplementation(() => {
      const ownedEpoch = ++epoch
      return Promise.resolve(() => epoch === ownedEpoch)
    })
    let releaseReferral!: () => void
    mocks.clearStoredReferralCode.mockImplementation(() => new Promise<void>((resolve) => { releaseReferral = resolve }))
    const harness = await renderLoginFlow()

    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(mocks.clearStoredReferralCode).toHaveBeenCalledTimes(1))
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReferral()
    await verification

    expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps the return URL when a replacement login lands during its storage read', async () => {
    mocks.params = { returnUrl: '/old' }
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({ token: 'old-access', refreshToken: 'old-refresh',
      userId: 'old-user', name: 'Old', email: 'old@example.com' })
    let epoch = 0
    mocks.login.mockImplementation(() => {
      const ownedEpoch = ++epoch
      return Promise.resolve(() => epoch === ownedEpoch)
    })
    let releaseReturnUrl!: (url: string) => void
    const pendingRead = new Promise<string>((resolve) => { releaseReturnUrl = resolve })
    mocks.consumeStoredAuthReturnUrl.mockReturnValue(pendingRead)
    mocks.getStoredAuthReturnUrl.mockReturnValue(pendingRead)
    const harness = await renderLoginFlow()

    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(
      mocks.consumeStoredAuthReturnUrl.mock.calls.length + mocks.getStoredAuthReturnUrl.mock.calls.length,
    ).toBe(1))
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseReturnUrl('/home')
    await verification

    expect(mocks.consumeStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps a newer flow return URL while older code verification waits for login', async () => {
    mocks.params = { returnUrl: '/older' }
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({ token: 'old-access', refreshToken: 'old-refresh',
      userId: 'old-user', name: 'Old', email: 'old@example.com' })
    let releaseLogin!: () => void
    mocks.login.mockImplementation(() => new Promise<() => boolean>((resolve) => {
      releaseLogin = () => resolve(() => true)
    }))
    let currentAttemptId = 1
    mocks.isAuthReturnUrlAttemptCurrent.mockImplementation((id: number) => id === currentAttemptId)
    let storedUrl = '/older'
    mocks.getStoredAuthReturnUrl.mockImplementation(() => Promise.resolve(storedUrl))
    mocks.clearStoredAuthReturnUrl.mockImplementation(() => { storedUrl = ''; return Promise.resolve() })
    const harness = await renderLoginFlow()

    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    currentAttemptId = 2
    storedUrl = '/newer'
    releaseLogin()
    await verification

    expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.clearStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalledWith('/newer')
    expect(storedUrl).toBe('/newer')
  })

  it('passes login ownership through pending return URL removal', async () => {
    mocks.params = { returnUrl: '/old' }
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({ token: 'old-access', refreshToken: 'old-refresh',
      userId: 'old-user', name: 'Old', email: 'old@example.com' })
    mocks.getStoredAuthReturnUrl.mockResolvedValue('/old')
    let epoch = 0
    mocks.login.mockImplementation(() => {
      const ownedEpoch = ++epoch
      return Promise.resolve(() => epoch === ownedEpoch)
    })
    let releaseRemoval!: () => void
    mocks.clearStoredAuthReturnUrl.mockImplementation(() => new Promise<void>((resolve) => { releaseRemoval = resolve }))
    const harness = await renderLoginFlow()

    const verification = act(() => harness.current.verifyCode())
    await vi.waitFor(() => expect(mocks.clearStoredAuthReturnUrl).toHaveBeenCalledTimes(1))
    expect(typeof mocks.clearStoredAuthReturnUrl.mock.calls[0]?.[1]).toBe('function')
    await mocks.login('new-access', 'new-refresh', { userId: 'new-user' })
    releaseRemoval()
    await verification

    expect(mocks.clearStoredAuthReturnUrl.mock.calls[0]?.[1]()).toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('reports the error and resets the code entry when verification fails', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockRejectedValue(new Error('invalid code'))
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    expect(harness.current.errorMessage).toBeTruthy()
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(harness.current.codeDigits.join('')).toBe('123456')
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('gates submission on connectivity and code completeness', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    const online = await renderLoginFlow()
    await act(() => online.current.setEmail('user@test.com'))

    expect(online.current.canSubmitEmail).toBe(true)
    expect(online.current.canSubmitCode).toBe(true)

    mocks.isOnline = false
    const offline = await renderLoginFlow()
    await act(() => offline.current.setEmail('user@test.com'))

    expect(offline.current.canSubmitEmail).toBe(false)
    expect(offline.current.canSubmitCode).toBe(false)
  })

  it('resends the code and restarts the countdown when online', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.resendCode())

    const [endpoint, options] = firstApiCall()
    expect(endpoint).toBe(API.auth.sendCode)
    expect(bodyOf(options)).toMatchObject({ email: 'user@test.com', language: 'en' })
    expect(harness.current.successMessage).toBe('auth.codeResent')
    expect(harness.current.resendCountdown).toBe(60)
  })

  it('blocks resending while offline', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.resendCode())

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('returns to the email step and clears code entry', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.step).toBe('code')

    await act(() => harness.current.backToEmail())

    expect(harness.current.step).toBe('email')
    expect(harness.current.successMessage).toBeNull()
    expect(harness.current.codeDigits.join('')).toBe('')
  })

  it('shows the reactivation notice when a deleted account logs back in', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.apiClient.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
      wasReactivated: true,
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    expect(harness.current.accountBack).toMatchObject({ wasReactivated: true })
    expect(mocks.replace).not.toHaveBeenCalled()
    await act(() => harness.current.continueAccount())
    expect(mocks.replace).toHaveBeenCalledWith('/(tabs)')
  })

  it('applies a stored referral code on verification and hides the banner', async () => {
    mocks.codeDigits = ['1', '2', '3', '4', '5', '6']
    mocks.getStoredReferralCode.mockResolvedValue('REF123')
    mocks.apiClient.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Ada',
      email: 'user@test.com',
      wasReactivated: false,
    })
    const harness = await renderLoginFlow()

    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode())

    const [, options] = firstApiCall()
    expect(bodyOf(options)).toMatchObject({ referralCode: 'REF123' })
    expect(mocks.clearStoredReferralCode).toHaveBeenCalledTimes(1)
    expect(harness.current.showReferralBanner).toBe(false)
  })

  it('reflects a persisted referral code in the banner on mount', async () => {
    mocks.getStoredReferralCode.mockResolvedValue('REF999')
    const harness = await renderLoginFlow()

    expect(harness.current.showReferralBanner).toBe(true)
  })

  it('leaves callback navigation to the App Link after successful Google sign-in', async () => {
    mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'success', url: 'orbit://cb' })
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(harness.current.isGoogleLoading).toBe(false)
  })

  it('stays put when the Google flow is dismissed', async () => {
    mocks.startMobileGoogleAuth.mockResolvedValue({ type: 'cancel' })
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('blocks Google sign-in while offline', async () => {
    mocks.isOnline = false
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(mocks.startMobileGoogleAuth).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('surfaces a Google sign-in failure', async () => {
    mocks.startMobileGoogleAuth.mockRejectedValue(new Error('oauth boom'))
    const harness = await renderLoginFlow()

    await act(() => harness.current.signInWithGoogle())

    expect(harness.current.errorMessage).toBeTruthy()
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(harness.current.isGoogleLoading).toBe(false)
  })

  it('routes to the legal pages', async () => {
    const harness = await renderLoginFlow()

    await act(() => harness.current.openPrivacyPolicy())
    expect(mocks.push).toHaveBeenCalledWith('/about')

    await act(() => harness.current.openTerms())
    expect(mocks.push).toHaveBeenCalledWith('/about')
  })
})

describe('mobile auth state recovery', () => {
  it.each(['success', 'failure'])('tracks the pending resend through %s without replaying verification', async (outcome) => {
    vi.useFakeTimers()
    try {
      const harness = await renderLoginFlow()
      await act(() => harness.current.setEmail('user@test.com'))
      await act(() => harness.current.sendCode())
      await act(() => { vi.advanceTimersByTime(60_000) })
      let settle!: () => void
      mocks.apiClient.mockReturnValueOnce(new Promise<void>((resolve, reject) => {
        settle = () => outcome === 'success' ? resolve() : reject(new Error('network disconnected'))
      }))
      let pending!: Promise<void>
      await act(() => { pending = harness.current.resendCode() })
      expect(harness.current).toMatchObject({ isSubmitting: true, isResending: true })
      const calls = mocks.apiClient.mock.calls.length
      await act(async () => { await harness.current.resendCode(); await harness.current.verifyCode('123456') })
      expect(mocks.apiClient).toHaveBeenCalledTimes(calls)
      await act(async () => { settle(); await pending })
      expect(harness.current).toMatchObject({ isSubmitting: false, isResending: false })
      expect(harness.current.errorKey).toBe(outcome === 'success' ? null : 'auth.errors.sendFailed')
      expect(harness.current.successMessage).toBe(outcome === 'success' ? 'auth.codeResent' : null)
      expect(mocks.login).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('lets the server decide retries after a reload with an unknown lock deadline', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Too many attempts. Try again in 15 minutes' }, 'Request failed'))
    await act(() => harness.current.verifyCode('123456'))
    expect(harness.current.codeFailure).toBe('locked')
    const calls = mocks.apiClient.mock.calls.length
    await act(() => harness.current.verifyCode('123456'))
    expect(mocks.apiClient).toHaveBeenCalledTimes(calls + 1)
    mocks.apiClient.mockResolvedValue({ token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'user@test.com', wasReactivated: false })
    await act(() => harness.current.verifyCode('123456'))
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })
  it.each([429, 500, 503])('keeps one send failure and the address for HTTP %s', async (status) => {
    mocks.apiClient.mockRejectedValue(createApiClientError(status, null, 'Request failed'))
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.errorKey).toBe('auth.errors.sendFailed')
    expect(harness.current.email).toBe('user@test.com')
    expect(harness.current.step).toBe('email')
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('keeps the same send failure after a network exception', async () => {
    mocks.apiClient.mockRejectedValue(new TypeError('network disconnected'))
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.errorKey).toBe('auth.errors.sendFailed')
  })

  it('deduplicates the sixth digit and the verify button', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockResolvedValue({ token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'user@test.com' })
    mocks.apiClient.mockClear()
    await act(async () => {
      harness.current.onCodeChange('123456')
      await harness.current.verifyCode('123456')
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('locks after three wrong codes and permits a different email immediately', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Invalid verification code' }, 'Request failed'))
    for (const code of ['111111', '222222', '333333']) await act(() => harness.current.onCodeChange(code))
    expect(harness.current.codeFailure).toBe('locked')
    expect(harness.current.lockCountdown).toBe(900)
    const calls = mocks.apiClient.mock.calls.length
    await act(async () => { await harness.current.verifyCode('444444'); await harness.current.resendCode() })
    expect(mocks.apiClient).toHaveBeenCalledTimes(calls)
    await act(() => harness.current.backToEmail())
    await act(() => harness.current.setEmail('other@test.com'))
    mocks.apiClient.mockResolvedValue({})
    await act(() => harness.current.sendCode())
    expect(harness.current.codeFailure).toBeNull()
    expect(harness.current.step).toBe('code')
    await act(() => harness.current.backToEmail())
    await act(() => harness.current.setEmail('USER@test.com'))
    const before = mocks.apiClient.mock.calls.length
    await act(() => harness.current.sendCode())
    expect(harness.current.codeFailure).toBe('locked')
    expect(mocks.apiClient).toHaveBeenCalledTimes(before)
  })

  it('lets an expired code be resent even inside the local resend countdown', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Verification code expired or not found' }, 'Request failed'))
    await act(() => harness.current.verifyCode('123456'))
    expect(harness.current.codeFailure).toBe('expired')
    mocks.apiClient.mockResolvedValue({})
    await act(() => harness.current.resendCode())
    expect(harness.current.codeFailure).toBeNull()
    expect(harness.current.codeDigits.join('')).toBe('')
    expect(harness.current.successMessage).toBe('auth.codeResent')
  })
})

describe('Google dismissal through the owning login flow', () => {
  it('completes iOS sign-in once from the login screen with only the native promise callback', async () => {
    Platform.OS = 'ios'
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id')
    const google = await vi.importActual<typeof import('@/lib/google-auth')>('@/lib/google-auth')
    const callback = await import('@/lib/google-auth-callback')
    await callback.clearPendingGoogleAuthSession()
    mocks.params = { returnUrl: '/progress' }
    mocks.getStoredAuthReturnUrl.mockResolvedValue('/progress')
    mocks.createAuthReturnUrlAttempt.mockReturnValue('google-attempt')
    mocks.startMobileGoogleAuth.mockImplementation(google.startMobileGoogleAuth)
    mocks.apiClient.mockResolvedValue({ token: 'access', refreshToken: 'refresh', userId: 'google-user',
      name: 'User', email: 'user@example.com' })
    mocks.openGoogleBrowser.mockImplementation((authorizeUrl: string, redirect: string) => Promise.resolve({
      type: 'success', url: `${redirect}?code=native-code&state=${new URL(authorizeUrl).searchParams.get('state')}`,
    }))
    let tree!: import('react-test-renderer').ReactTestRenderer & { unmount: () => void }
    mocks.replace.mockImplementation((route: string) => {
      if (route === '/auth-callback') tree.update(React.createElement(React.Fragment, null,
        React.createElement(AuthCallbackScreen), React.createElement(AuthCallbackScreen)))
    })
    try {
      await act(() => { tree = TestRenderer.create(React.createElement(LoginScreen)) })
      const googleButton = tree.root.findAll((node) => node.type === PillButton)
        .find((node) => node.props.children === 'auth.signInWithGoogle')
      expect(googleButton).toBeDefined()
      await act(() => (googleButton!.props.onClick as () => void)())
      await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/progress'))
      expect(mocks.replace.mock.calls).toEqual([['/auth-callback'], ['/progress']])
      expect(mocks.apiClient).toHaveBeenCalledExactlyOnceWith(API.auth.googleCode, expect.objectContaining({
        method: 'POST', body: expect.stringContaining('"code":"native-code"'),
      }), expect.anything())
      expect(mocks.login).toHaveBeenCalledOnce()
      expect(mocks.startMobileGoogleAuth).toHaveBeenCalledWith({ returnUrl: '/progress' })
    } finally {
      await act(() => tree.unmount())
      await callback.clearPendingGoogleAuthSession()
    }
  })

  it('removes the dismissal error when the same attempt App Link arrives', async () => {
    const google = await vi.importActual<typeof import('@/lib/google-auth')>('@/lib/google-auth')
    const callback = await import('@/lib/google-auth-callback')
    await callback.clearPendingGoogleAuthSession()
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id')
    mocks.openGoogleBrowser.mockResolvedValue({ type: 'dismiss' })
    mocks.createAuthReturnUrlAttempt.mockReturnValue('google-attempt')
    mocks.startMobileGoogleAuth.mockImplementation(google.startMobileGoogleAuth)
    const harness = await renderLoginFlow()
    await act(() => harness.current.signInWithGoogle())
    expect(harness.current.isGoogleLoading).toBe(false)
    expect(harness.current.errorKey).toBe('auth.errors.googleError')
    vi.useFakeTimers()
    await act(() => { vi.advanceTimersByTime(60_000) })
    const state = new URL(mocks.openGoogleBrowser.mock.calls[0]![0] as string).searchParams.get('state')
    await act(() => {
      expect(callback.setPendingGoogleAuthCallbackUrl(`${callback.AUTH_CALLBACK_URL}?code=late&state=wrong`)).toBe(false)
    })
    expect(harness.current.errorKey).toBe('auth.errors.googleError')
    await act(() => {
      expect(callback.setPendingGoogleAuthCallbackUrl(`${callback.AUTH_CALLBACK_URL}?code=late&state=${state}`)).toBe(true)
    })
    expect(harness.current.errorKey).toBeNull()
    expect(harness.current.errorMessage).toBeNull()
    await callback.clearPendingGoogleAuthSession()
  })

  it('keeps the real dismissal error and lets another Google attempt start', async () => {
    const google = await vi.importActual<typeof import('@/lib/google-auth')>('@/lib/google-auth')
    const callback = await import('@/lib/google-auth-callback')
    await callback.clearPendingGoogleAuthSession()
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id')
    mocks.openGoogleBrowser.mockResolvedValue({ type: 'dismiss' })
    mocks.createAuthReturnUrlAttempt.mockReturnValue('google-attempt')
    mocks.startMobileGoogleAuth.mockImplementation(google.startMobileGoogleAuth)
    const harness = await renderLoginFlow()
    await act(() => harness.current.signInWithGoogle())
    expect(harness.current.errorMessage).toBe('auth.errors.googleError')
    await act(() => harness.current.signInWithGoogle())
    expect(mocks.openGoogleBrowser).toHaveBeenCalledTimes(2)
    expect(harness.current.errorMessage).toBe('auth.errors.googleError')
    expect(harness.current.isGoogleLoading).toBe(false)
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current.errorKey).toBeNull()
    await callback.clearPendingGoogleAuthSession()
  })
})


describe('field validation responses', () => {
  it.each(['en', 'pt-BR'] as const)('retains %s server copy and paired codes', async (language) => {
    const { verificationValidationResponses } = await import('@orbit/shared/test-support/validation-fixtures')
    const payload = verificationValidationResponses[language]
    mocks.apiClient.mockRejectedValue(createApiClientError(400, payload, 'Fallback'))
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.verifyCode('123456'))
    expect(harness.current).toMatchObject({ codeFieldError: payload.errors.Code.join('\n'), validationErrorDetails: payload.errorDetails, codeFailure: null })
  })

  it('makes the format code available when five digits are submitted', async () => {
    const harness = await renderLoginFlow()
    await act(() => harness.current.verifyCode('12345'))
    expect(harness.current).toMatchObject({ errorMessage: 'auth.errors.codeFormat', validationCode: 'VALIDATION_VERIFICATION_CODE_FORMAT', codeFailure: null })
  })

  it('shows legacy email validation beside the email field', async () => {
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { errors: { Email: ['Legacy email failure'] } }, 'Fallback'))
    const harness = await renderLoginFlow()
    await act(() => harness.current.setEmail('user@test.com'))
    await act(() => harness.current.sendCode())
    expect(harness.current).toMatchObject({ emailFieldError: 'Legacy email failure' })
    await act(() => harness.current.setEmail('corrected@test.com'))
    expect(harness.current.emailFieldError).toBeUndefined()
  })
})


it.each(['en', 'pt-BR'] as const)('shows the five-digit format error in the mounted %s login form', async (language) => {
  mocks.localized = true
  mocks.language = language
  await testI18n.changeLanguage(language)
  let tree!: { root: { findAllByType: (type: string) => { props: Record<string, unknown> }[] }; unmount: () => void }
  await act(() => { tree = TestRenderer.create(React.createElement(LoginContent)) })
  const input = () => tree.root.findAllByType('TextInput')[0]!
  await act(() => (input().props.onChangeText as (value: string) => void)('user@test.com'))
  await act(() => (input().props.onSubmitEditing as () => void)())
  await act(() => (input().props.onChangeText as (value: string) => void)('12345'))
  await act(() => (input().props.onBlur as () => void)())
  expect(input().props.accessibilityHint).toBe(testI18n.t('auth.errors.codeFormat'))
  const error = tree.root.findAllByType('Text').find((node) => node.props.children === testI18n.t('auth.errors.codeFormat'))
  expect(error?.props.accessibilityLiveRegion).toBe('polite')
  expect(mocks.focus).not.toHaveBeenCalled()
  await act(() => (input().props.onChangeText as (value: string) => void)('1234'))
  expect(input().props.accessibilityHint).toBe(testI18n.t('auth.codeHint'))
  await act(() => tree.unmount())
})


it.each([
  { step: 'email', mixed: true }, { step: 'code', mixed: true },
  { step: 'email', mixed: false }, { step: 'code', mixed: false },
])('keeps unmapped validation visible in the owning $step form (mixed: $mixed)', async ({ step, mixed }) => {
  let tree!: import('react-test-renderer').ReactTestRenderer
  await act(() => { tree = TestRenderer.create(React.createElement(LoginContent)) })
  const input = () => tree.root.findAll((node) => String(node.type) === 'TextInput')[0]!
  await act(() => (input().props.onChangeText as (value: string) => void)('user@test.com'))
  if (step === 'code') {
    await act(() => (input().props.onSubmitEditing as () => void)())
    expect(input().props.accessibilityLabel).toBe('auth.verificationCode')
  }
  const field = step === 'email' ? 'Email' : 'Code'
  const other = 'Other'
  mocks.apiClient.mockRejectedValue(createApiClientError(400, { errors: { ...(mixed ? { [field]: ['Field failure'] } : {}), [other]: ['Other failure', 'Second failure'] } }, 'Fallback'))
  if (step === 'email') await act(() => (input().props.onSubmitEditing as () => void)())
  else await act(() => (input().props.onChangeText as (value: string) => void)('123456'))
  if (mixed) expect(input().props.accessibilityHint).toBe('Field failure')
  expect(tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children)).toContain('Other failure\nSecond failure')
  if (mixed) expect(mocks.focus).toHaveBeenCalled()
  expect(input().props.value).toBe(step === 'email' ? 'user@test.com' : '123456')
  mocks.apiClient.mockRejectedValue(createApiClientError(400, { errors: { [other]: ['Unknown first', 'Unknown second'] } }, 'Fallback'))
  await act(() => (input().props.onChangeText as (value: string) => void)(step === 'email' ? 'corrected@test.com' : '123457'))
  if (step === 'email') await act(() => (input().props.onSubmitEditing as () => void)())
  expect(tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children)).toContain('Unknown first\nUnknown second')
  expect(input().props.accessibilityHint).not.toBe('Field failure')
  await act(() => tree.update(React.createElement(React.Fragment)))
})

describe('email-link attempt ownership', () => {
  const issuedResponse = { token: 'test-token', refreshToken: null, userId: 'user-id', name: 'Person', email: 'user@test.com', wasReactivated: false }
  const verificationCount = () => mocks.apiClient.mock.calls.filter(([endpoint]) => endpoint === API.auth.verifyCode).length

  it('waits for protection, strips route secrets and deduplicates repeat delivery', async () => {
    vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    mocks.params = { email: 'user@test.com', code: '123456', returnUrl: '/progress' }
    mocks.apiClient.mockResolvedValue(issuedResponse)
    const harness = await renderLoginFlow()
    expect(verificationCount()).toBe(0)
    expect(mocks.setParams).toHaveBeenCalledWith({ email: undefined, code: undefined })
    mocks.params = { returnUrl: '/progress' }
    await act(() => harness.rerender())
    await act(() => harness.current.onTurnstileToken('fresh-widget-token'))
    expect(verificationCount()).toBe(1)
    mocks.params = { email: 'user@test.com', code: '123456', returnUrl: '/progress' }
    await act(() => harness.rerender())
    await act(() => harness.current.onCodeChange('123456'))
    expect(verificationCount()).toBe(1)
    expect(bodyOf(firstApiCall()[1]).email === 'user@test.com').toBe(true)
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it('completes a mounted native input once across StrictMode effect replay', async () => {
    mocks.params = { email: 'user@test.com', code: '123456' }
    mocks.apiClient.mockResolvedValue(issuedResponse)
    let tree!: { root: { findAllByType: (type: string) => unknown[] }; unmount: () => void }
    await act(() => { tree = TestRenderer.create(React.createElement(React.StrictMode, null, React.createElement(LoginContent))) })
    try {
      expect(tree.root.findAllByType('TextInput').length).toBe(1)
      expect(verificationCount()).toBe(1)
      expect(mocks.login).toHaveBeenCalledTimes(1)
    } finally { await act(() => tree.unmount()) }
  })

  it('lets an edited code replace the incoming automatic completion', async () => {
    vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    mocks.params = { email: 'user@test.com', code: '123456' }
    mocks.apiClient.mockResolvedValue(issuedResponse)
    const harness = await renderLoginFlow()
    await act(() => harness.current.onCodeChange('12345'))
    await act(() => harness.current.onTurnstileToken('fresh-token'))
    expect(verificationCount()).toBe(0)
    await act(() => harness.current.onCodeChange('123457'))
    expect(verificationCount()).toBe(1)
    expect(bodyOf(firstApiCall()[1]).code === '123457').toBe(true)
  })

  it('keeps the first link pending while offline and completes after connectivity returns', async () => {
    mocks.isOnline = false
    mocks.params = { email: 'user@test.com', code: '123456' }
    mocks.apiClient.mockResolvedValue(issuedResponse)
    const harness = await renderLoginFlow()
    expect(harness.current.codeDigits.join('').length).toBe(6)
    expect(verificationCount()).toBe(0)
    mocks.isOnline = true
    await act(() => harness.rerender())
    expect(verificationCount()).toBe(1)
  })

  it('does not treat a signed-out Google callback as an email link', async () => {
    mocks.params = { email: 'user@test.com', code: '123456' }
    await renderLoginFlow(true)
    expect(verificationCount()).toBe(0)
    expect(mocks.setParams).not.toHaveBeenCalled()
  })

  it.each(['email', 'cancel', 'account'])('invalidates delayed protection on %s change', async (change) => {
    vi.stubEnv('EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    mocks.params = { email: 'user@test.com', code: '123456' }
    const harness = await renderLoginFlow()
    const lateWidget = harness.current.onTurnstileToken
    await act(() => {
      if (change === 'email') harness.current.setEmail('other@test.com')
      else if (change === 'cancel') harness.current.backToEmail()
      else { mocks.epoch += 1; for (const listener of mocks.authListeners) listener() }
    })
    await act(() => lateWidget('stale-widget-token'))
    expect(verificationCount()).toBe(0)
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('captures a warm replacement with matching digits under the new email', async () => {
    mocks.apiClient.mockRejectedValue(createApiClientError(400, { error: 'Invalid verification code' }, 'Request failed'))
    mocks.params = { email: 'user@test.com', code: '123456' }
    const harness = await renderLoginFlow()
    expect(verificationCount()).toBe(1)
    mocks.params = { email: 'other@test.com', code: '123456' }
    await act(() => harness.rerender())
    expect(verificationCount()).toBe(2)
    const request = mocks.apiClient.mock.calls[1]![1] as { body: string }
    expect(bodyOf(request).email === 'other@test.com').toBe(true)
  })

  it.each(['expired', 'replayed', 'wrong-email', 'locked', 'transport'])('retains manual recovery without a loop for %s', async (failure) => {
    const errors = { expired: 'Verification code expired or not found', replayed: 'Verification code expired or not found', 'wrong-email': 'Invalid verification code', locked: 'Too many attempts. Try again in 15 minutes' }
    mocks.apiClient.mockRejectedValue(failure === 'transport' ? new TypeError('Network disconnected') : createApiClientError(400, { error: errors[failure as keyof typeof errors] }, 'Request failed'))
    mocks.params = { email: 'user@test.com', code: '123456' }
    const harness = await renderLoginFlow()
    await act(() => harness.rerender())
    expect(verificationCount()).toBe(1)
    expect(harness.current.step === 'code').toBe(true)
    expect(harness.current.codeDigits.join('').length).toBe(6)
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.apiClient.mock.calls.some(([endpoint]) => endpoint === API.auth.sendCode)).toBe(false)
    await act(() => harness.current.backToEmail())
    expect(harness.current.step).toBe('email')
  })

  it.each(['email', 'account', 'unmount'])('ignores a late response after %s changes', async (change) => {
    let release!: (response: typeof issuedResponse) => void
    mocks.apiClient.mockReturnValue(new Promise<typeof issuedResponse>((resolve) => { release = resolve }))
    mocks.params = { email: 'user@test.com', code: '123456' }
    const harness = await renderLoginFlow()
    expect(verificationCount()).toBe(1)
    await act(() => {
      if (change === 'email') harness.current.setEmail('other@test.com')
      else if (change === 'unmount') harness.unmount()
      else { mocks.epoch += 1; for (const listener of mocks.authListeners) listener() }
    })
    await act(() => { release(issuedResponse) })
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.getStoredAuthReturnUrl).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('waits for native session initialization before attempting the link', async () => {
    mocks.authLoading = true
    mocks.params = { email: 'user@test.com', code: '123456' }
    mocks.apiClient.mockResolvedValue(issuedResponse)
    const harness = await renderLoginFlow()
    expect(verificationCount()).toBe(0)
    mocks.authLoading = false
    await act(() => harness.rerender())
    expect(verificationCount()).toBe(1)
  })

  it.each([false, true])('does not exchange over a signed-in account (callback: %s)', async (callback) => {
    mocks.authenticated = true
    mocks.params = { email: 'user@test.com', code: '123456' }
    await renderLoginFlow(callback)
    expect(verificationCount()).toBe(0)
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it.each([{ email: 'user@test.com' }, { code: '123456' }, { email: ['user@test.com', 'other@test.com'], code: '123456' }, { email: 'user@test.com', code: ['123456', '654321'] }, { email: 'bad', code: '123456' }])('rejects missing, malformed and duplicated parameters (%#)', async (params) => {
    mocks.params = params
    await renderLoginFlow()
    expect(verificationCount()).toBe(0)
  })
})

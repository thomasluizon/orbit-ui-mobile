import React from 'react'
import { Animated, View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setI18n } from 'react-i18next'
import { authLocales, authScreenStates, createLoginScreenFixture, type AuthScreenState } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { motionDurations } from '@orbit/shared/theme'
import { measureSafeArea, type GeometryHost } from '@/__tests__/support/safe-area-geometry'
import { testI18n } from '@/__tests__/support/i18n'
import { LoginContent, type LoginCallback } from '@/components/auth/login-content'
import { GuidedSignInContext } from '@/components/auth/guided-sign-in'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const { act, create } = require('react-test-renderer')
type Locale = typeof authLocales[number]
const mocks = vi.hoisted((): { flow: Record<string, unknown>; language: string; reduced: boolean; captureGuidedFlowEvent: ReturnType<typeof vi.fn> } => ({ flow: {}, language: 'en', reduced: false, captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => React.createElement('TurnstileWidget') }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: mocks.captureGuidedFlowEvent }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reduced }))

interface Node {
  type: unknown
  props: Record<string, unknown>
  children: (Node | string)[]
  findAll: (predicate: (node: Node) => boolean) => Node[]
}
const handlers = {
  setEmail: vi.fn(), sendCode: vi.fn(), refuseEmptyEmail: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(),
  signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), onCodeChange: vi.fn(), continueAccount: vi.fn(), openTerms: vi.fn(), openPrivacyPolicy: vi.fn(),
}
const HEIGHT = 780
let tree: { root: Node; unmount: () => void; toJSON: () => GeometryHost } | null = null

function textOf(node: Node): string {
  return node.findAll((child) => child.type === 'Text').flatMap((child) => [child.props.children].flat(Infinity)).filter((child) => typeof child === 'string').join('')
}
function allText() { return textOf(tree!.root) }
function buttons() { return tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button') }
function nameOf(node: Node) { return typeof node.props.accessibilityLabel === 'string' ? node.props.accessibilityLabel : textOf(node) }
function button(name: string) { return buttons().find((node) => nameOf(node) === name) }
function usableControls() { return buttons().filter((node) => !(node.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled).map(nameOf).sort((first, second) => first.localeCompare(second)) }
function inputs() { return tree!.root.findAll((node) => node.type === 'TextInput') }
function heading() { return tree!.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header') }
function byTestID(testID: string) { return tree!.root.findAll((node) => node.props.testID === testID && typeof node.type === 'string') }
function press(name: string) { act(() => { (button(name)!.props.onPress as () => void)() }) }

function show(state: AuthScreenState, locale: Locale, options: { guided?: boolean; callback?: LoginCallback; overrides?: Record<string, unknown>; width?: number } = {}) {
  mocks.language = locale
  void testI18n.changeLanguage(locale)
  setI18n(testI18n)
  const fixture = createLoginScreenFixture(state, locale)
  mocks.flow = { ...fixture, ...handlers, ...options.overrides }
  const width = options.width ?? 360
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  act(() => {
    tree = create(<View style={{ width, height: HEIGHT }}><GuidedSignInContext value={options.guided ?? true}><LoginContent callback={options.callback} /></GuidedSignInContext></View>)
  })
  return fixture.t
}
function close() { if (tree) act(() => tree!.unmount()); tree = null }

beforeEach(() => {
  mocks.reduced = false
  vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'org.useorbit.app')
  for (const handler of Object.values(handlers)) handler.mockClear()
  mocks.captureGuidedFlowEvent.mockClear()
})
afterEach(() => { close(); vi.unstubAllEnvs() })

describe.each(authLocales)('guided sign-in on Android in %s', (locale) => {
  it('asks the email question once: the heading and the accessible name of the field are one string', () => {
    const t = show('email', locale)
    const question = t('auth.email')
    expect(heading().map(textOf)).toEqual([question])
    expect(inputs().map((input) => input.props.accessibilityLabel)).toEqual([question])
    expect(allText()).not.toContain(t('auth.emailTitle'))
    expect(tree!.root.findAll((node) => node.props['data-asset' as never] === 'orbit-lockup')).toHaveLength(0)
  })

  it('offers Google and Apple as the options above the email field, and each one runs its handler', () => {
    const t = show('email', locale)
    const providers = byTestID('login-providers')[0]!
    expect(textOf(providers)).toContain(t('auth.signInWithGoogle'))
    expect(textOf(providers)).toContain(t('auth.signInWithApple'))
    const order = tree!.root.findAll((node) => node.props.testID === 'login-providers' || node.type === 'TextInput').map((node) => node.type === 'TextInput' ? 'field' : 'providers')
    expect(order.indexOf('providers')).toBeLessThan(order.indexOf('field'))
    press(t('auth.signInWithGoogle'))
    press(t('auth.signInWithApple'))
    expect(handlers.signInWithGoogle).toHaveBeenCalledOnce()
    expect(handlers.signInWithApple).toHaveBeenCalledOnce()
  })

  it('keeps the continue action enabled: an empty submit asks for the hint and a typed address sends the code', () => {
    const t = show('email', locale)
    expect((button(t('auth.sendCode'))!.props.accessibilityState as { disabled?: boolean }).disabled).toBeFalsy()
    press(t('auth.sendCode'))
    expect(handlers.refuseEmptyEmail).toHaveBeenCalledOnce()
    expect(handlers.sendCode).not.toHaveBeenCalled()
    close()
    show('send failed', locale)
    press(t('auth.sendCode'))
    expect(handlers.sendCode).toHaveBeenCalledOnce()
    expect(allText()).toContain(t('auth.errors.sendFailed'))
  })

  it('shows the address hint beside the field', () => {
    const t = show('email invalid', locale)
    expect(String(inputs()[0]!.props.accessibilityHint)).toContain(t('auth.errors.invalidEmail'))
    expect(allText()).toContain(t('auth.errors.invalidEmail'))
  })

  it('keeps the offline refusal with its visible reason on both steps', () => {
    const t = show('offline', locale)
    expect(textOf(byTestID('offline-notice')[0]!)).toBe(t('auth.errors.offline'))
    expect(button(t('auth.sendCode'))!.props.accessibilityHint).toBe(t('auth.errors.offline'))
    expect((button(t('auth.signInWithGoogle'))!.props.accessibilityState as { disabled?: boolean }).disabled).toBe(true)
    expect(allText()).toContain(t('auth.googleOffline'))
    close()
    show('code', locale, { overrides: { isOnline: false } })
    expect(textOf(byTestID('offline-notice')[0]!)).toBe(t('auth.errors.offline'))
    expect(button(t('auth.verify'))!.props.accessibilityHint).toBe(t('auth.errors.offline'))
  })

  it('keeps the step and names the wait while the human check is not ready, with the check in its place', () => {
    const turnstile = { turnstileSiteKey: 'site-key', turnstileToken: null, turnstileResetKey: 0, onTurnstileToken: vi.fn() }
    const t = show('email', locale, { overrides: turnstile })
    expect(heading().map(textOf)).toEqual([t('auth.email')])
    expect(button(t('auth.sendCode'))!.props.accessibilityHint).toBe(t('auth.turnstileLoading'))
    expect(tree!.root.findAll((node) => node.type === 'TurnstileWidget')).toHaveLength(1)
    close()
    show('code', locale, { overrides: turnstile })
    expect(tree!.root.findAll((node) => node.type === 'TurnstileWidget')).toHaveLength(1)
  })

  it('asks the code question, and the Orbit line states where the code went', () => {
    const t = show('code', locale)
    expect(heading().map(textOf)).toEqual([t('auth.verificationCode')])
    expect(heading()[0]!.props.accessibilityHint).toBe(t('auth.line.codeSent', { email: 'person@example.com' }))
    expect(inputs().map((input) => input.props.accessibilityLabel)).toEqual([t('auth.verificationCode')])
    press(t('auth.changeEmail'))
    expect(handlers.backToEmail).toHaveBeenCalledOnce()
  })

  it('keeps the code step with the server message after a wrong code', () => {
    const t = show('code wrong', locale)
    expect(heading().map(textOf)).toEqual([t('auth.verificationCode')])
    expect(allText()).toContain(t('auth.errors.invalidCode'))
    expect(inputs()[0]!.props.editable).not.toBe(false)
    press(t('auth.verify'))
    expect(handlers.verifyCode).toHaveBeenCalledOnce()
  })

  it('names the expired code in the Orbit line and offers the resend action, not a retype', () => {
    const t = show('code expired', locale)
    expect(heading()[0]!.props.accessibilityHint).toBe(t('auth.line.codeExpired'))
    expect(button(t('auth.verify'))).toBeUndefined()
    expect(inputs()[0]!.props.editable).toBe(false)
    expect(allText()).not.toContain(t('auth.errors.codeExpired'))
    press(t('auth.resendCode'))
    expect(handlers.resendCode).toHaveBeenCalledOnce()
  })

  it('names the lock with its countdown and offers no action the server refuses', () => {
    const t = show('locked out', locale)
    expect(heading()[0]!.props.accessibilityHint).toBe(t('auth.line.codeLocked', { time: '15:00' }))
    expect(textOf(byTestID('capacity-notice')[0]!)).toBe(t('auth.errors.tooManyAttempts'))
    expect(button(t('auth.verify'))).toBeUndefined()
    expect(button(t('auth.resendCode'))).toBeUndefined()
    expect(button(t('auth.changeEmail'))).toBeDefined()
  })

  it('shows the resend countdown, then the resend action', () => {
    const t = show('code', locale)
    expect(allText()).toContain(t('auth.resendIn', { time: '0:42' }))
    expect(button(t('auth.resendCode'))).toBeUndefined()
    close()
    show('resend ready', locale)
    expect(button(t('auth.resendCode'))).toBeDefined()
  })

  it.each([[1], [4]])('states the plan that waits with %i habits when the person comes from onboarding', (count) => {
    const t = show('from onboarding', locale, { overrides: { plannedHabitCount: count } })
    const line = t('auth.line.plan', { count })
    expect(line).toContain(String(count))
    expect(heading()[0]!.props.accessibilityHint).toBe(line)
    expect(button(t('auth.onboarding.continue'))).toBeDefined()
  })

  it('keeps the referral banner and the legal line with both links', () => {
    const t = show('referred', locale)
    expect(allText()).toContain(t('referral.loginBanner'))
    const links = tree!.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'link')
    expect(links).toHaveLength(2)
    act(() => { (links[0]!.props.onPress as () => void)(); (links[1]!.props.onPress as () => void)() })
    expect(handlers.openTerms).toHaveBeenCalledOnce()
    expect(handlers.openPrivacyPolicy).toHaveBeenCalledOnce()
  })

  it('shows the account that came back as one centred block with its one action', () => {
    const t = show('account back', locale)
    expect(heading().map(textOf)).toEqual([t('auth.accountBack.title')])
    expect(byTestID('orbit-mascot')[0]!.props['data-orbit-state' as never]).toBe('parado')
    expect(buttons()).toHaveLength(1)
    press(t('auth.accountBack.action'))
    expect(handlers.continueAccount).toHaveBeenCalledOnce()
  })

  it.each(['google', 'apple'] as const)('returns to the email step with Orbit in Parado after the %s callback fails or the person cancels', (provider) => {
    const t = show('email', locale, { callback: { state: 'failed', provider, onContinue: vi.fn() } })
    const message = t(provider === 'apple' ? 'auth.errors.appleError' : 'auth.errors.googleError')
    expect(heading().map(textOf)).toEqual([t('auth.email')])
    expect(byTestID('orbit-mascot')[0]!.props['data-orbit-state' as never]).toBe('parado')
    expect(allText()).toContain(message)
    expect(message).not.toMatch(/\b(you|você)\b/i)
    press(t('auth.signInWithGoogle'))
    expect(handlers.signInWithGoogle).toHaveBeenCalledOnce()
    expect(allText()).not.toContain(message)
  })

  it('keeps the provider action busy while the callback waits', () => {
    const t = show('email', locale, { callback: { state: 'pending', provider: 'google', onContinue: vi.fn() } })
    expect((button(t('auth.signInWithGoogle'))!.props.accessibilityState as { busy?: boolean }).busy).toBe(true)
    expect(inputs()[0]!.props.editable).toBe(false)
  })

  it.each(authScreenStates)('keeps every control of the current surface in %s, with Orbit never resting and no old name', (state) => {
    show(state, locale, { guided: false })
    const currentControls = usableControls()
    const currentFields = inputs().length
    close()
    show(state, locale)
    const guidedControls = usableControls()
    for (const control of currentControls) expect(guidedControls, `${state}: ${control}`).toContain(control)
    expect(inputs()).toHaveLength(currentFields)
    const states = byTestID('orbit-mascot').map((node) => node.props['data-orbit-state' as never])
    expect(states).toEqual(['parado'])
    expect(allText()).not.toMatch(/astra/i)
    expect(tree!.root.findAll((node) => node.type === 'ActivityIndicator')).toHaveLength(0)
  })
})

describe('guided sign-in field contract on Android', () => {
  it.each([true, false])('keeps the name, the autocomplete value and the order of every field, guided %s', (guided) => {
    show('email', 'en', { guided })
    expect(inputs().map((input) => [input.props.autoComplete, input.props.keyboardType, input.props.textContentType])).toEqual([['email', 'email-address', undefined]])
    close()
    show('code', 'en', { guided })
    expect(inputs().map((input) => [input.props.autoComplete, input.props.textContentType])).toEqual([['email-otp', undefined]])
  })
})

describe('guided sign-in motion, events and flag on Android', () => {
  it.each([false, true])('shakes a wrong code only with motion on, reduced %s', (reduced) => {
    mocks.reduced = reduced
    const timing = vi.spyOn(Animated, 'timing')
    show('code wrong', 'pt-BR')
    const shakes = timing.mock.calls.filter(([, config]) => config.duration === motionDurations.slow / 5)
    expect(shakes.length > 0).toBe(!reduced)
    timing.mockRestore()
  })

  it('reports the flow as sign_in with two steps and sends no typed text', () => {
    show('code', 'en')
    expect(mocks.captureGuidedFlowEvent).toHaveBeenCalledWith({ name: 'guided_flow_step_viewed', properties: { flow: 'sign_in', step: 'code', step_count: 2 } })
    expect(JSON.stringify(mocks.captureGuidedFlowEvent.mock.calls)).not.toContain('person@example.com')
  })

  it('renders the current surface with the flag off', () => {
    const t = show('email', 'en', { guided: false })
    expect(byTestID('question-flow')).toHaveLength(0)
    expect(heading().map(textOf)).toEqual([t('auth.emailTitle')])
    expect((button(t('auth.sendCode'))!.props.accessibilityState as { disabled?: boolean }).disabled).toBe(true)
  })
})

describe.each([320, 360, 384, 412])('guided sign-in block at %i px', (width) => {
  it.each(authLocales.flatMap((locale) => (['email', 'code', 'code expired', 'locked out'] as const).map((state) => ({ locale, state }))))('centres the $state block between the header and the primary action in $locale', ({ locale, state }) => {
    show(state, locale, { width })
    const step = state === 'email' ? 'email' : 'code'
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${step}` ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })

  it.each(authLocales)('centres the account that came back in the screen in %s', (locale) => {
    show('account back', locale, { width })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'guided-account-back' ? 'free-area' : host.props.testID === 'guided-account-back-block' ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })
})

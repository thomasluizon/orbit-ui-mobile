import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import { setI18n } from 'react-i18next'
import { authLocales, authScreenStates, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '@/components/auth/login-content'

vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: 'en', fallbackLng: 'en', initAsync: false,
})
setI18n(testI18n)

const { act, create } = require('react-test-renderer')
const mocks = vi.hoisted((): { flow: Record<string, unknown>; action: () => void; theme: string } => ({ flow: {}, action: vi.fn(), theme: 'dark' }))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: () => React.createElement('TurnstileWidget'),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: mocks.theme }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true, toAnimatedEasing: (value: unknown) => value }))
vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View } = await import('react-native')
  return { useKeyboardAwareInputReveal: () => null, KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }
})

interface Node {
  type: unknown
  props: Record<string, unknown>
  children: (Node | string)[]
  findAll: (predicate: (node: Node) => boolean) => Node[]
}
function renderedText(node: Node): string {
  return node.children.map((child) => typeof child === 'string' ? child : renderedText(child)).join('')
}
function textOf(node: Node): string {
  return node.findAll((child) => child.type === 'Text')
    .flatMap((child) => [child.props.children].flat(Infinity)).filter((child) => typeof child === 'string').join('')
}
function buttons(root: Node): Node[] { return root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button') }
function button(root: Node, label: string) { return buttons(root).find((node) => textOf(node) === label) }
function host(root: Node, type: string) { return root.findAll((node) => node.type === type) }
function setFixture(state: Parameters<typeof createLoginScreenFixture>[0], locale: typeof authLocales[number]) {
  const fixture = createLoginScreenFixture(state, locale)
  mocks.flow = { ...fixture, setEmail: mocks.action, sendCode: mocks.action, verifyCode: mocks.action,
    resendCode: mocks.action, backToEmail: mocks.action, signInWithGoogle: mocks.action,
    onCodeChange: mocks.action, continueAccount: mocks.action, openTerms: mocks.action, openPrivacyPolicy: mocks.action }
  return fixture
}
function render() {
  let tree: { root: Node; unmount: () => void; update: (element: React.ReactElement) => void }
  act(() => { tree = create(<LoginContent />) })
  return tree!
}

describe.each(authLocales)('mobile auth composition in %s', (locale) => {
  beforeEach(() => {
    vi.clearAllMocks()
    void testI18n.changeLanguage(locale)
    setI18n(testI18n)
  })
  it('blocks code requests while keeping code entry available until a mobile token exists', () => {
    const { t } = setFixture('resend ready', locale)
    mocks.flow.turnstileSiteKey = 'test-site-key'
    mocks.flow.turnstileToken = null
    mocks.flow.codeDigits = ['1', '2', '3', '4', '5', '6']
    const tree = render()
    expect(button(tree.root, t('auth.verify'))?.props.disabled).toBe(true)
    expect(button(tree.root, t('auth.resendCode'))?.props.disabled).toBe(true)
    expect(host(tree.root, 'TextInput')[0]?.props.editable).toBe(true)
    mocks.flow.turnstileToken = 'fresh-token'
    act(() => tree.update(<LoginContent />))
    expect(button(tree.root, t('auth.verify'))?.props.disabled).toBe(false)
    expect(button(tree.root, t('auth.resendCode'))?.props.disabled).toBe(false)
    expect(host(tree.root, 'TextInput')[0]?.props.editable).toBe(true)
    act(() => tree.unmount())
  })
  it('renders the complete localized legal sentence with both actions', () => {
    setFixture('email', locale)
    const tree = render()
    const sentence = locale === 'en'
      ? 'By continuing, you agree to the Terms and the Privacy policy.'
      : 'Ao continuar, você concorda com os Termos e a Política de privacidade.'
    expect(renderedText(tree.root)).toContain(sentence)
    expect(host(tree.root, 'Text').filter((node) => node.props.accessibilityRole === 'link')).toHaveLength(2)
    act(() => tree.unmount())
  })
  it('keeps both legal actions when the locale reverses their order', () => {
    setFixture('email', locale)
    const privacyLabel = locale === 'en' ? 'Privacy policy' : 'Política de privacidade'
    const termsLabel = locale === 'en' ? 'Terms' : 'Termos'
    const termsAction = vi.fn()
    const privacyAction = vi.fn()
    mocks.flow.openTerms = termsAction
    mocks.flow.openPrivacyPolicy = privacyAction
    const reorderedI18n = createInstance()
    void reorderedI18n.use(ICU).init({
      resources: { [locale]: { translation: {
        ...(locale === 'en' ? en : ptBR),
        auth: { ...(locale === 'en' ? en.auth : ptBR.auth),
          legalConsent: `First <privacy>${privacyLabel}</privacy>, then <terms>${termsLabel}</terms>.` },
      } } },
      lng: locale, fallbackLng: locale, initAsync: false,
    })
    setI18n(reorderedI18n)
    const tree = render()
    const links = host(tree.root, 'Text').filter((node) => node.props.accessibilityRole === 'link')
    expect(links.map(textOf)).toEqual([privacyLabel, termsLabel])
    expect(renderedText(tree.root)).toContain(`First ${privacyLabel}, then ${termsLabel}.`)
    act(() => (links[0]!.props.onPress as () => void)())
    act(() => (links[1]!.props.onPress as () => void)())
    expect(privacyAction).toHaveBeenCalledTimes(1)
    expect(termsAction).toHaveBeenCalledTimes(1)
    act(() => tree.unmount())
  })
  it.each(['resend ready', 'code expired'] as const)('puts the busy state on resend for %s', (state) => {
    const { t } = setFixture(state, locale)
    mocks.flow.isSubmitting = true
    mocks.flow.isResending = true
    const tree = render()
    expect(button(tree.root, t('auth.resendCode'))?.props.accessibilityState).toMatchObject({ busy: true })
    if (state === 'code expired') expect(button(tree.root, t('auth.verify'))).toBeUndefined()
    else expect(button(tree.root, t('auth.verify'))?.props.accessibilityState).toMatchObject({ busy: false })
    expect(host(tree.root, 'TextInput')[0]!.props.editable).toBe(false)
    act(() => tree.unmount())
  })

  describe.each(['dark', 'light'])('%s theme', (theme) => {
    it.each(authScreenStates)('renders %s with its available recovery actions', (state) => {
      mocks.theme = theme
      const fixture = setFixture(state, locale)
      const { t } = fixture
      const tree = render()
      const { root } = tree
      expect(root.findAll((node) => node.props.testID === 'orbit-lockup').length).toBeGreaterThan(0)
      if (state === 'account back') {
        expect(textOf(root)).toContain(t('auth.accountBack.title'))
        expect(buttons(root)).toHaveLength(1)
        act(() => (button(root, t('auth.accountBack.action'))!.props.onPress as () => void)())
        expect(mocks.action).toHaveBeenCalledTimes(1)
      } else if (fixture.step === 'email') {
        assertEmailState(root, state, fixture)
      } else {
        const inputs = host(root, 'TextInput')
        expect(inputs).toHaveLength(1)
        expect(inputs[0]!.props.value).toBe(fixture.codeDigits.join(''))
        const blocked = ['locked out', 'code expired'].includes(state)
        expect(inputs[0]!.props.editable).toBe(!['locked out', 'code expired', 'verifying'].includes(state))
        expect(Boolean(button(root, t('auth.verify')))).toBe(!blocked)
        expect(Boolean(button(root, t('auth.resendCode')))).toBe(['resend ready', 'code expired'].includes(state))
        expect(button(root, t('auth.changeEmail'))).toBeDefined()
        if (state === 'locked out') {
          expect(root.findAll((node) => node.props.testID === 'capacity-notice').length).toBeGreaterThan(0)
          expect(textOf(root)).toContain(t('auth.errors.tooManyAttempts'))
          expect(textOf(root)).not.toMatch(/\d+:\d{2}/)
        }
      }
      if (fixture.errorMessage) {
        expect(host(root, 'Text').some((node) => node.props.accessibilityRole === 'alert' && node.props.children === fixture.errorMessage)).toBe(true)
      }
      act(() => tree.unmount())
    })
  })
  it('keeps offline neutral on the code step and explains disabled actions', () => {
    const { t } = setFixture('code wrong', locale)
    mocks.flow.isOnline = false
    mocks.flow.canResend = true
    const tree = render()
    expect(textOf(tree.root)).toContain(t('auth.errors.offline'))
    expect(button(tree.root, t('auth.verify'))?.props.disabled).toBe(true)
    expect(button(tree.root, t('auth.resendCode'))?.props.disabled).toBe(true)
    expect(host(tree.root, 'Text').filter((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
    act(() => tree.unmount())
  })
  it('uses the singular habit count and retains referral on the code step', () => {
    const { t } = setFixture('from onboarding', locale)
    mocks.flow.plannedHabitCount = 1
    const tree = render()
    expect(textOf(tree.root)).toContain(t('auth.onboarding.habitOne'))
    setFixture('code', locale)
    mocks.flow.showReferralBanner = true
    act(() => tree.update(<LoginContent />))
    expect(textOf(tree.root)).toContain(t('referral.loginBanner'))
    act(() => tree.unmount())
  })
})


it('lets a callback failure yield to the next email validation result', () => {
  const { t } = setFixture('email', 'en')
  const callback = { state: 'failed' as const, onContinue: mocks.action }
  let tree: ReturnType<typeof render>
  act(() => { tree = create(<LoginContent callback={callback} />) })
  expect(textOf(tree!.root)).toContain(t('auth.errors.googleError'))
  act(() => (host(tree!.root, 'TextInput')[0]!.props.onChangeText as (value: string) => void)('incomplete'))
  setFixture('email invalid', 'en')
  act(() => tree!.update(<LoginContent callback={callback} />))
  expect(textOf(tree!.root)).toContain(t('auth.errors.invalidEmail'))
  expect(textOf(tree!.root)).not.toContain(t('auth.errors.googleError'))
  act(() => tree!.unmount())
})

function assertEmailState(root: Node, state: Parameters<typeof setFixture>[0], fixture: ReturnType<typeof setFixture>) {
  const { t } = fixture
        expect(button(root, t('auth.signInWithGoogle'))).toBeDefined()
        const submit = button(root, t(fixture.fromOnboarding ? 'auth.onboarding.continue' : 'auth.sendCode'))!
        if (['sending', 'google', 'offline', 'email'].includes(state)) expect(submit.props.disabled).toBe(true)
        expect(host(root, 'Text').filter((node) => node.props.accessibilityRole === 'link')).toHaveLength(2)
        if (fixture.fromOnboarding) expect(textOf(root)).toContain(t('auth.onboarding.habits', { count: 4 }))
        if (state === 'referred') expect(textOf(root)).toContain(t('referral.loginBanner'))
        if (state === 'offline') {
          expect(textOf(root)).toContain(t('auth.errors.offline'))
          expect(textOf(root)).toContain(t('auth.googleOffline'))
          expect(host(root, 'Text').filter((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
        }
}

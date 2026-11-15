import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { createLoginScreenFixture, type AuthScreenState } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AuthCallbackContent } from '@/app/(auth)/auth-callback/auth-callback-content'
import { LoginContent, type LoginCallback } from '@/app/(auth)/login/login-content'
import { AuthPageFrame } from '@/components/auth/auth-page-frame'
import { GuidedSignInContext } from '@/components/auth/guided-sign-in'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, FLOW_WIDTHS, centreOffset, compileAppStylesheet, measureFlowMarkup, stubViewportMedia } from '@/__tests__/support/flow-layout'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...await importOriginal<typeof import('next/navigation')>(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams('code=mobile-code&state=mobile-state') }))

const STATES = ['email', 'from onboarding', 'offline', 'code', 'code wrong', 'code expired', 'locked out', 'resend ready', 'account back'] as const satisfies readonly AuthScreenState[]
const cases = FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => STATES.map((state) => ({ width, locale, state }))))

/** The markup of one sign-in state inside the frame of the sign-in routes, rendered still. */
function captureState(state: AuthScreenState, locale: 'en' | 'pt-BR', width: number, overrides: Record<string, unknown> = {}, callback?: LoginCallback): string {
  stubViewportMedia(width)
  vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'org.useorbit.web')
  const action = vi.fn()
  mocks.flow = { ...createLoginScreenFixture(state, locale), ...overrides, t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }),
    setEmail: action, sendCode: action, refuseEmptyEmail: action, verifyCode: action, resendCode: action, backToEmail: action,
    signInWithGoogle: action, signInWithApple: action, onCodeChange: action, continueAccount: action }
  const view = render(<GuidedSignInContext value><AuthPageFrame><LoginContent callback={callback} /></AuthPageFrame></GuidedSignInContext>)
  const markup = view.container.innerHTML
  view.unmount()
  return markup
}

describe('guided sign-in layout in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $state block and holds each label on one line at $width px in $locale', async ({ width, locale, state }) => {
    const account = state === 'account back'
    const markup = captureState(state, locale, width)
      .replace('data-auth-page-frame=""', account ? 'data-auth-page-frame="" data-layout-free=""' : 'data-auth-page-frame=""')
      .replace('data-account-back=""', 'data-account-back="" data-layout-block=""')
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup)
    expect(centreOffset(layout), JSON.stringify(layout)).toBeLessThanOrEqual(1)
    expect(layout.questionLines, 'question').toBeGreaterThanOrEqual(1)
    expect(layout.questionLines, 'question').toBeLessThanOrEqual(2)
    expect(layout.orbitLineLines, 'Orbit line').toBeLessThanOrEqual(2)
    expect(layout.labels.length > 0).toBe(state !== 'locked out')
    for (const label of layout.labels) expect(label.lines, label.label).toBe(1)
    expect(layout.overflowX, 'horizontal overflow').toBe(false)
  }, 60_000)

  it.each(FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => (['google', 'apple'] as const).map((provider) => ({ width, locale, provider })))))('centres the failed $provider callback state in the sign-in frame at $width px in $locale', async ({ width, locale, provider }) => {
    const markup = captureState('email', locale, width, {}, { state: 'failed', provider, onContinue: vi.fn() })
    expect(markup).toContain('data-error-state=""')
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup
      .replace('data-auth-page-frame=""', 'data-auth-page-frame="" data-layout-free=""')
      .replace('data-error-state=""', 'data-error-state="" data-layout-block=""'))
    expect(centreOffset(layout), JSON.stringify(layout)).toBeLessThanOrEqual(1)
    expect(layout.overflowX, 'horizontal overflow').toBe(false)
  }, 60_000)

  it.each(FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.map((locale) => ({ width, locale }))))('centres the Android handoff state and holds its action on one line at $width px in $locale', async ({ width, locale }) => {
    stubViewportMedia(width)
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', 'org.useorbit.app')
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130.0' })
    vi.stubGlobal('location', { protocol: 'https:', host: 'app.useorbit.org', search: '?code=mobile-code&state=mobile-state', hash: '', assign: vi.fn() })
    const view = render(
      <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
        <GuidedSignInContext value><AuthPageFrame><AuthCallbackContent pendingWebStates={{ apple: null, google: null }} /></AuthPageFrame></GuidedSignInContext>
      </NextIntlClientProvider>,
    )
    await view.findByRole('link', { name: (locale === 'en' ? en : ptBR).auth.openInOrbit })
    const markup = view.container.innerHTML
    view.unmount()
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup
      .replace('data-auth-page-frame=""', 'data-auth-page-frame="" data-layout-free=""')
      .replace('data-app-handoff=""', 'data-app-handoff="" data-layout-block=""'))
    expect(centreOffset(layout), JSON.stringify(layout)).toBeLessThanOrEqual(1)
    expect(layout.questionLines, 'title').toBeGreaterThanOrEqual(1)
    expect(layout.questionLines, 'title').toBeLessThanOrEqual(2)
  }, 60_000)

  it.each(FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.map((locale) => ({ width, locale }))))('wraps a long address in the Orbit line of the code step inside the column at $width px in $locale', async ({ width, locale }) => {
    const markup = captureState('code', locale, width, { email: 'maria.fernanda.albuquerque.santos@contabilidade-exemplo.com.br' })
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup)
    expect(layout.overflowX, JSON.stringify(layout)).toBe(false)
  }, 60_000)
})

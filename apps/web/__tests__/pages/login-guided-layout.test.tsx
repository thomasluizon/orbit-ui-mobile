import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { createLoginScreenFixture, type AuthScreenState } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { AuthPageFrame } from '@/components/auth/auth-page-frame'
import { GuidedSignInContext } from '@/components/auth/guided-sign-in'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, FLOW_WIDTHS, centreOffset, compileAppStylesheet, measureFlowMarkup, stubViewportMedia } from '@/__tests__/support/flow-layout'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

const STATES = ['email', 'from onboarding', 'offline', 'code', 'code wrong', 'code expired', 'locked out', 'resend ready', 'account back'] as const satisfies readonly AuthScreenState[]
const cases = FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => STATES.map((state) => ({ width, locale, state }))))

/** The markup of one sign-in state inside the frame of the sign-in routes, rendered still. */
function captureState(state: AuthScreenState, locale: 'en' | 'pt-BR', width: number): string {
  stubViewportMedia(width)
  vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'org.useorbit.web')
  const action = vi.fn()
  mocks.flow = { ...createLoginScreenFixture(state, locale), t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }),
    setEmail: action, sendCode: action, refuseEmptyEmail: action, verifyCode: action, resendCode: action, backToEmail: action,
    signInWithGoogle: action, signInWithApple: action, onCodeChange: action, continueAccount: action }
  const view = render(<GuidedSignInContext value><AuthPageFrame><LoginContent /></AuthPageFrame></GuidedSignInContext>)
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
  }, 60_000)
})

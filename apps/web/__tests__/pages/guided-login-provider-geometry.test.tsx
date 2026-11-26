import { act, cleanup, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { authLocales, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { AuthPageFrame } from '@/components/auth/auth-page-frame'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { compileAppStylesheet, stubViewportMedia } from '@/__tests__/support/flow-layout'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

// WHY: Cloudflare sizes the flexible widget at 65px height https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
const FLEXIBLE_CHALLENGE_HEIGHT = 65
type CheckState = 'none' | 'loading' | 'challenge' | 'expired' | 'failed'
interface TurnstileOptions { callback: (token: string) => void; 'before-interactive-callback': () => void; 'expired-callback': () => void; 'error-callback': (code: string) => boolean }

async function renderSignIn(step: 'email' | 'code', check: CheckState, width: number) {
  stubViewportMedia(width)
  const observers = new Set<() => void>()
  vi.stubGlobal('ResizeObserver', class {
    private readonly callback: () => void
    constructor(callback: () => void) { this.callback = callback }
    observe() { observers.add(this.callback) }
    unobserve() {}
    disconnect() { observers.delete(this.callback) }
  })
  const renderWidget = vi.fn((_container: HTMLElement, _options: TurnstileOptions) => 'widget')
  vi.stubGlobal('turnstile', { render: renderWidget, reset: vi.fn(), remove: vi.fn() })
  mocks.flow = { ...createLoginScreenFixture(step, 'pt-BR'), t: createTranslator({ locale: 'pt-BR', messages: ptBR }),
    turnstileSiteKey: 'site-key', turnstileResetKey: 0, onTurnstileToken: vi.fn() }
  const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC"><AuthPageFrame><LoginContent /></AuthPageFrame></NextIntlClientProvider>)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const [challenge, options] = renderWidget.mock.calls[0]!
  if (check === 'none') act(() => options.callback('token'))
  if (check === 'expired') act(() => options['expired-callback']())
  // WHY: Cloudflare marks 110200 as a failure with no retry, so the widget shows the failure at once https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
  if (check === 'failed') act(() => { options['error-callback']('110200') })
  if (check === 'challenge') {
    challenge.innerHTML = `<div style="height:${FLEXIBLE_CHALLENGE_HEIGHT}px"></div>`
    vi.spyOn(challenge, 'getBoundingClientRect').mockReturnValue({ height: FLEXIBLE_CHALLENGE_HEIGHT } as DOMRect)
    act(() => { options['before-interactive-callback'](); for (const callback of observers) callback() })
  }
  return view.container.innerHTML
}

async function readBlock(chrome: { browser: Browser; stylesheet: string }, markup: string, viewport: { width: number; height: number }) {
  const page = await chrome.browser.newPage({ viewport, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${chrome.stylesheet}</style>${markup}`)
    await loadAppFonts(page)
    return await page.evaluate(() => {
      const block = document.querySelector('[data-question-flow] [data-flow-scroll] > [role="presentation"]')!.getBoundingClientRect()
      return { contentTop: block.top, contentBottom: block.bottom }
    })
  } finally { await page.close() }
}

const cases = [320, 1280].flatMap(width => authLocales.flatMap(locale =>
  [false, true].flatMap(apple => (['email', 'google', 'offline'] as const).map(state => ({ width, locale, apple, state }))),
))

describe('Guided sign-in provider geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('fills and stacks providers at $width in $locale, Apple $apple, $state', async ({ width, locale, apple, state }) => {
    stubViewportMedia(width)
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', apple ? 'test-client' : '')
    mocks.flow = { ...createLoginScreenFixture(state, locale),
      t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }) }
    const { container } = render(<AuthPageFrame><LoginContent /></AuthPageFrame>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const { column, providers } = await page.evaluate(() => {
        const rect = (element: Element) => { const bounds = element.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width } }
        const group = document.querySelector('[data-login-providers]')!
        return { column: rect(group), providers: [...group.querySelectorAll('button')].map(rect) }
      })
      expect(column.width).toBeGreaterThan(0)
      expect(providers).toHaveLength(apple ? 2 : 1)
      let previousBottom = column.top
      for (const provider of providers) {
        expect(provider.width).toBeCloseTo(column.width, 1)
        expect(provider.left).toBeCloseTo(column.left, 1)
        expect(provider.right).toBeCloseTo(column.right, 1)
        expect(provider.top).toBeGreaterThanOrEqual(previousBottom - 0.5)
        previousBottom = provider.bottom
      }
    } finally { await page.close() }
  })

  const steadyScreens = [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 1280, height: 915 }]
    .flatMap(screen => (['email', 'code'] as const).map(step => ({ ...screen, step })))
  it.each(steadyScreens)('keeps the $step content at one place and one height in every state of the check at $width x $height', async ({ width, height, step }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'test-client')
    const seen: { check: CheckState; contentTop: number; contentBottom: number }[] = []
    for (const check of ['loading', 'challenge', 'none', 'expired', 'failed'] as const) {
      const { contentTop, contentBottom } = await readBlock({ browser, stylesheet }, await renderSignIn(step, check, width), { width, height })
      seen.push({ check, contentTop, contentBottom })
      cleanup()
    }
    for (const { check, contentTop, contentBottom } of seen) {
      expect({ contentTop, contentBottom }, `${check}: the content moved or changed its height: ${JSON.stringify(seen)}`)
        .toEqual({ contentTop: seen[0]!.contentTop, contentBottom: seen[0]!.contentBottom })
    }
  })
})

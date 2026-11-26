import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { authLocales, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { SIGN_IN_BUTTON_HEIGHT } from '@orbit/shared/theme'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { AuthPageFrame } from '@/components/auth/auth-page-frame'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { settlePage } from '@/__tests__/support/settled-page'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('motion/react-m', async () => {
  const actual = await import('motion/react')
  return actual.m
})
vi.mock('motion/react', async () => {
  const React = await import('react')
  return { useReducedMotion: () => true,
    domMin: {},
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    m: { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) } }
})

// WHY: Cloudflare sizes the flexible widget at 65px height https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
const FLEXIBLE_CHALLENGE_HEIGHT = 65
const DRAWN_SPACE = 16
type CheckState = 'none' | 'loading' | 'challenge' | 'expired' | 'failed'
interface TurnstileOptions { callback: (token: string) => void; 'before-interactive-callback': () => void; 'expired-callback': () => void; 'error-callback': (code: string) => boolean }
const smallScreens = [{ width: 320, height: 640 }, { width: 375, height: 667 }].flatMap(screen =>
  (['email', 'code'] as const).flatMap(step => (['none', 'loading', 'challenge'] as const).map(check => ({ ...screen, step, check }))))

async function renderSignIn(step: 'email' | 'code', check: CheckState) {
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

async function readSignIn(chrome: { browser: Browser; stylesheet: string }, markup: string, viewport: { width: number; height: number }) {
  const page = await chrome.browser.newPage({ viewport })
  try {
    await page.setContent(`<style>${chrome.stylesheet}</style>${markup}`)
    await loadAppFonts(page)
    await settlePage(page)
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('[data-field-surface="responsive-card"]')!
      const padding = getComputedStyle(panel)
      const bounds = panel.getBoundingClientRect()
      const providers = [...document.querySelectorAll('button')].filter(button => button.querySelector('svg[data-asset="apple-sign-in-logo"], svg[data-asset="google-mark"]'))
      return { contentTop: bounds.top + Number.parseFloat(padding.paddingTop), contentBottom: bounds.bottom - Number.parseFloat(padding.paddingBottom),
        pageHeight: document.documentElement.scrollHeight, check: document.querySelector('[role="status"]:not(.sr-only)')?.textContent ?? '',
        providerHeights: providers.map(button => button.getBoundingClientRect().height) }
    })
    return { ...geometry, overflow: geometry.pageHeight - viewport.height, topGap: geometry.contentTop, bottomGap: geometry.pageHeight - geometry.contentBottom }
  } finally { await page.close() }
}

const cases = [320, 1280].flatMap(width => authLocales.flatMap(locale =>
  [false, true].flatMap(apple => (['email', 'google', 'offline'] as const).map(state => ({ width, locale, apple, state }))),
))

describe('Login provider geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('fills and stacks providers at $width in $locale, Apple $apple, $state', async ({ width, locale, apple, state }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', apple ? 'test-client' : '')
    mocks.flow = { ...createLoginScreenFixture(state, locale),
      t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }) }
    const { container } = render(<LoginContent />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await settlePage(page)
      const [primary, ...providers] = await page.getByRole('button').evaluateAll(buttons => buttons.map(button => {
        const bounds = button.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width }
      }))
      expect(primary!.width).toBeGreaterThan(0)
      expect(providers).toHaveLength(apple ? 2 : 1)
      let previousBottom = primary!.bottom
      for (const provider of providers) {
        expect(provider.width).toBeCloseTo(primary!.width, 1)
        expect(provider.left).toBeCloseTo(primary!.left, 1)
        expect(provider.right).toBeCloseTo(primary!.right, 1)
        expect(provider.top).toBeGreaterThan(previousBottom)
        previousBottom = provider.bottom
      }
    } finally { await page.close() }
  })

  it.each(smallScreens)('centres the $step content at $width x $height with the check $check, keeps the drawn space, and rests both providers at one height', async ({ width, height, step, check }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'test-client')
    const geometry = await readSignIn({ browser, stylesheet }, await renderSignIn(step, check), { width, height })
    const { overflow, topGap, bottomGap } = geometry
    expect(geometry.check, 'the loading sentence shows only in the loading state').toBe(check === 'loading' ? ptBR.auth.turnstileLoading : '')
    expect(topGap, `the drawn space stays above the Orbit mark: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(DRAWN_SPACE - 0.5)
    expect(bottomGap, `the drawn space stays below the last line at the end of the scroll: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(DRAWN_SPACE - 0.5)
    if (width >= 375) expect(overflow, 'the content fits, so the page does not scroll').toBe(0)
    else expect(overflow, 'only the drawn space can need a scroll').toBeLessThanOrEqual(2 * DRAWN_SPACE)
    if (overflow === 0) expect(Math.abs(topGap - bottomGap) / 2, JSON.stringify(geometry)).toBeLessThanOrEqual(0.5)
    if (step === 'email') expect(geometry.providerHeights).toEqual([SIGN_IN_BUTTON_HEIGHT, SIGN_IN_BUTTON_HEIGHT])
  })

  const steadyScreens = [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 1280, height: 915 }]
    .flatMap(screen => (['email', 'code'] as const).map(step => ({ ...screen, step })))
  it.each(steadyScreens)('keeps the $step content at one place and one height in every state of the check at $width x $height', async ({ width, height, step }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'test-client')
    const seen: { check: CheckState; contentTop: number; contentBottom: number }[] = []
    for (const check of ['loading', 'challenge', 'none', 'expired', 'failed'] as const) {
      const { contentTop, contentBottom } = await readSignIn({ browser, stylesheet }, await renderSignIn(step, check), { width, height })
      seen.push({ check, contentTop, contentBottom })
      cleanup()
    }
    for (const { check, contentTop, contentBottom } of seen) {
      expect({ contentTop, contentBottom }, `${check}: the content moved or changed its height: ${JSON.stringify(seen)}`)
        .toEqual({ contentTop: seen[0]!.contentTop, contentBottom: seen[0]!.contentBottom })
    }
  })

  it.each(['email', 'code'] as const)('keeps the drawn space above the Orbit mark and below the last line of the %s step when the content cannot fit', async (step) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'test-client')
    const geometry = await readSignIn({ browser, stylesheet }, await renderSignIn(step, 'challenge'), { width: 320, height: 480 })
    expect(geometry.overflow, 'the content is taller than the screen, so the page scrolls').toBeGreaterThan(0)
    // WHY: scrollHeight is a whole pixel, so the space below the last line at the end of the scroll can be short of the drawn space by less than one pixel. https://drafts.csswg.org/cssom-view/#dom-element-scrollheight
    expect(Math.abs(geometry.topGap - DRAWN_SPACE), JSON.stringify(geometry)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(geometry.bottomGap - DRAWN_SPACE), JSON.stringify(geometry)).toBeLessThanOrEqual(0.5)
  })
})

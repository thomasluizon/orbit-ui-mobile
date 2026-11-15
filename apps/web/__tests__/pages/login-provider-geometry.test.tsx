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
type CheckState = 'none' | 'loading' | 'challenge'
interface TurnstileOptions { callback: (token: string) => void; 'before-interactive-callback': () => void }
const smallScreens = [{ width: 320, height: 640 }, { width: 375, height: 667 }].flatMap(screen =>
  (['email', 'code'] as const).flatMap(step => (['none', 'loading', 'challenge'] as const).map(check => ({ ...screen, step, check }))))

/** jsdom has no layout, so the stub draws the challenge that Cloudflare puts in the container and reports its size. */
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
  if (check === 'challenge') {
    challenge.innerHTML = `<div style="height:${FLEXIBLE_CHALLENGE_HEIGHT}px"></div>`
    vi.spyOn(challenge, 'getBoundingClientRect').mockReturnValue({ height: FLEXIBLE_CHALLENGE_HEIGHT } as DOMRect)
    act(() => { options['before-interactive-callback'](); for (const callback of observers) callback() })
  }
  return view.container.innerHTML
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

  it.each(smallScreens)('centres the $step content at $width x $height with the check $check, above the bottom edge, and rests both providers at one height', async ({ width, height, step, check }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'test-client')
    const markup = await renderSignIn(step, check)
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('[data-field-surface="responsive-card"]')!
        const padding = getComputedStyle(panel)
        const bounds = panel.getBoundingClientRect()
        const providers = [...document.querySelectorAll('button')].filter(button => button.querySelector('svg[data-asset="apple-sign-in-logo"], svg[data-asset="google-mark"]'))
        return { contentTop: bounds.top + Number.parseFloat(padding.paddingTop), contentBottom: bounds.bottom - Number.parseFloat(padding.paddingBottom),
          pageHeight: document.documentElement.scrollHeight, check: document.querySelector('[role="status"]:not(.sr-only)')?.textContent ?? '',
          providerHeights: providers.map(button => button.getBoundingClientRect().height) }
      })
      const topGap = geometry.contentTop
      const bottomGap = height - geometry.contentBottom
      expect(geometry.check, 'the loading sentence shows only in the loading state').toBe(check === 'loading' ? ptBR.auth.turnstileLoading : '')
      expect(topGap, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0)
      expect(bottomGap, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0)
      expect(Math.abs(topGap - bottomGap) / 2, JSON.stringify(geometry)).toBeLessThanOrEqual(0.5)
      expect(geometry.pageHeight, 'the content fits, so the page does not scroll').toBe(height)
      if (step === 'email') expect(geometry.providerHeights).toEqual([SIGN_IN_BUTTON_HEIGHT, SIGN_IN_BUTTON_HEIGHT])
    } finally { await page.close() }
  })
})

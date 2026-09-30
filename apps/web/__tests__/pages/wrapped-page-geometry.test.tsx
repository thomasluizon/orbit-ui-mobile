import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  closeChrome,
  registerChromeLaunchHook,
  type Browser,
  type BrowserLaunch,
} from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
const READY_WRAPPED = { recap: { id: 'recap-1' }, isEmpty: false, isLoading: false, isError: false }
const wrapped = vi.hoisted(() => ({
  current: {} as { recap: { id: string } | null; isEmpty: boolean; isLoading: boolean; isError: boolean },
}))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: () => ({ ...wrapped.current, slides: [], refetch: vi.fn() }),
}))

import WrappedPage from '@/app/(app)/wrapped/page'
import { useVersionGateStore } from '@/stores/version-gate-store'

const VIEWPORTS = [
  { width: 412, height: 800 },
  { width: 1440, height: 900 },
]
const LOCALES = ['en', 'pt-BR'] as const
const COVER_STATES = [
  { state: 'ready', ...READY_WRAPPED },
  { state: 'loading', recap: null, isEmpty: false, isLoading: true, isError: false },
  { state: 'failed', recap: null, isEmpty: false, isLoading: false, isError: true },
  { state: 'empty', recap: null, isEmpty: true, isLoading: false, isError: false },
]
const COLLISION_CASES = COVER_STATES.flatMap((cover) => [
  { width: 360, height: 640 },
  { width: 412, height: 400 },
  ...VIEWPORTS,
].flatMap((viewport) => [false, true].flatMap((reloadBanner) =>
  LOCALES.map((locale) => ({ ...cover, ...viewport, reloadBanner, locale })),
)))

describe('WrappedPage cover geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await browserLaunch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  beforeEach(() => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    wrapped.current = READY_WRAPPED
  })

  function renderPage(locale: 'en' | 'pt-BR' = 'en') {
    const messages = locale === 'en' ? en : pt
    const view = render(
      <NextIntlClientProvider locale={locale} messages={messages}><WrappedPage /></NextIntlClientProvider>,
    )
    return { container: view.container, backLabel: messages.common.backToProfile }
  }

  async function measureCover(
    viewport: { width: number; height: number },
    { container, backLabel }: ReturnType<typeof renderPage>,
  ) {
    const page = await browser.newPage({ viewport })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      return await page.evaluate((label) => {
        const coverElement = document.querySelector('[data-state]')!
        const cover = coverElement.getBoundingClientRect()
        const banner = document.querySelector('[data-update-banner]')?.getBoundingClientRect()
        const backControl = document.querySelector(`[aria-label="${label}"]`)!.getBoundingClientRect()
        const firstElement = coverElement.firstElementChild!.getBoundingClientRect()
        return {
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          bannerBottom: banner?.bottom ?? 0,
          coverTop: cover.top,
          coverBottom: cover.bottom,
          coverClipped: coverElement.scrollHeight > coverElement.clientHeight,
          backControlTop: backControl.top,
          backControlBottom: backControl.bottom,
          backControlWidth: backControl.width,
          backControlHeight: backControl.height,
          intersectsFirstElement: backControl.left < firstElement.right
            && backControl.right > firstElement.left
            && backControl.top < firstElement.bottom
            && backControl.bottom > firstElement.top,
        }
      }, backLabel)
    } finally {
      await page.close()
    }
  }

  it.each(COLLISION_CASES)(
    'separates the back control from the $state cover at $width by $height, banner $reloadBanner, $locale',
    async ({ state, width, height, reloadBanner, locale, ...wrappedState }) => {
      wrapped.current = wrappedState
      if (reloadBanner) useVersionGateStore.getState().requireReload('appUpdated')
      const rendered = renderPage(locale)
      expect(rendered.container.querySelector('[data-state]')).toHaveAttribute('data-state', state)

      const measured = await measureCover({ width, height }, rendered)

      expect(measured.intersectsFirstElement).toBe(false)
      expect(measured.backControlBottom).toBeLessThanOrEqual(measured.coverTop)
      expect(measured.backControlWidth).toBe(44)
      expect(measured.backControlHeight).toBe(44)
      expect(rendered.container.querySelectorAll('h1')).toHaveLength(1)
    },
  )

  it.each(VIEWPORTS.flatMap((viewport) => LOCALES.map((locale) => ({ ...viewport, locale }))))(
    'fits the reload banner and the cover in $width by $height in $locale',
    async ({ locale, ...viewport }) => {
    useVersionGateStore.getState().requireReload('appUpdated')
    const rendered = renderPage(locale)

    const measured = await measureCover(viewport, rendered)

    expect(measured.bannerBottom).toBeGreaterThan(0)
    expect(measured.documentHeight).toBe(measured.viewportHeight)
    expect(measured.coverTop).toBe(measured.bannerBottom + 56)
    expect(measured.coverBottom).toBe(measured.viewportHeight)
    expect(measured.backControlTop).toBeGreaterThanOrEqual(measured.bannerBottom)
  })

  it.each(VIEWPORTS)('fills $width by $height with the cover when no banner shows', async (viewport) => {
    const rendered = renderPage()

    const measured = await measureCover(viewport, rendered)

    expect(measured.documentHeight).toBe(measured.viewportHeight)
    expect(measured.coverTop).toBe(56)
    expect(measured.coverBottom).toBe(measured.viewportHeight)
  })

  it('grows the page instead of clipping the cover in a short 412 by 400 viewport', async () => {
    useVersionGateStore.getState().requireReload('appUpdated')
    const rendered = renderPage()

    const measured = await measureCover({ width: 412, height: 400 }, rendered)

    expect(measured.coverClipped).toBe(false)
    expect(measured.coverTop).toBe(measured.bannerBottom + 56)
    expect(measured.documentHeight).toBeCloseTo(measured.coverBottom, 0)
    expect(measured.documentHeight).toBeGreaterThan(measured.viewportHeight)
  })

  it.each([
    { state: 'loading', recap: null, isEmpty: false, isLoading: true, isError: false },
    { state: 'failed', recap: null, isEmpty: false, isLoading: false, isError: true },
    { state: 'empty', recap: null, isEmpty: true, isLoading: false, isError: false },
  ].flatMap((cover) => LOCALES.map((locale) => ({ ...cover, locale }))))(
    'keeps the $state cover whole under the reload banner in 360 by 640 in $locale',
    async ({ state, locale, ...wrappedState }) => {
    wrapped.current = wrappedState
    useVersionGateStore.getState().requireReload('appUpdated')
    const rendered = renderPage(locale)
    expect(rendered.container.querySelector('[data-state]')).toHaveAttribute('data-state', state)

    const measured = await measureCover({ width: 360, height: 640 }, rendered)

    expect(measured.coverClipped).toBe(false)
    expect(measured.coverTop).toBe(measured.bannerBottom + 56)
    expect(measured.backControlTop).toBeGreaterThanOrEqual(measured.bannerBottom)
    expect(measured.documentHeight).toBeCloseTo(Math.max(measured.viewportHeight, measured.coverBottom), 0)
  })
})

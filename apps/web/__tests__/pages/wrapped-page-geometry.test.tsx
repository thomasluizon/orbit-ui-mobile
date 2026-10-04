import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'
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
import { resolveWebThemeVariables } from '@/lib/theme-dom'
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
    insets = { top: 0, bottom: 0, left: 0, right: 0 },
  ) {
    await act(async () => {})
    const page = await browser.newPage({ viewport })
    try {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets })
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
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
          backControlLeft: backControl.left,
          backControlRight: backControl.right,
          contentLeft: cover.left,
          contentRight: cover.right,
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

  it.each(COVER_STATES.flatMap((cover) => [
    { width: 412, height: 915, top: 24, bottom: 34, left: 0, right: 0 },
    { width: 844, height: 390, top: 0, bottom: 21, left: 44, right: 44 },
    { width: 844, height: 390, top: 0, bottom: 0, left: 0, right: 0 },
  ].map((viewport) => ({ ...cover, ...viewport }))))(
    'keeps the $state cover inside all insets at $width by $height',
    async ({ state, width, height, top, bottom, left, right, ...wrappedState }) => {
      wrapped.current = wrappedState
      const rendered = renderPage()
      expect(rendered.container.querySelector('[data-state]')).toHaveAttribute('data-state', state)
      const measured = await measureCover({ width, height }, rendered, { top, bottom, left, right })
      expect(measured.backControlTop).toBeGreaterThanOrEqual(top)
      expect(measured.backControlBottom).toBeLessThanOrEqual(height - bottom)
      expect(measured.backControlLeft).toBeGreaterThanOrEqual(left)
      expect(measured.backControlRight).toBeLessThanOrEqual(width - right)
      expect(measured.contentLeft).toBeGreaterThanOrEqual(left)
      expect(measured.contentRight).toBeLessThanOrEqual(width - right)
      if (top === 0 && left === 0) expect(measured.backControlTop).toBe(4)
    },
  )

  it.each(LOCALES.flatMap((locale) => (['dark', 'light'] as const).map((mode) => ({ locale, mode }))))(
    'uses the drawn period chip tokens in $locale, $mode',
    async ({ locale, mode }) => {
      const messages = locale === 'en' ? en : pt
      let rendered!: ReturnType<typeof renderPage>
      await act(async () => { rendered = renderPage(locale) })
      const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
      try {
        for (const period of RECAP_SHARE_PERIODS) {
          fireEvent.click(screen.getByRole('button', { name: messages.wrapped.periods[period] }))
          await act(async () => {})
          const themeStyle = Object.entries(resolveWebThemeVariables('orange', mode))
            .map(([key, value]) => `${key}:${value}`).join(';')
          await page.setContent(`<html class="${mode}" style="${themeStyle}"><style>${stylesheet}</style><body>${rendered.container.innerHTML}</body></html>`)
          const chips = await page.evaluate((label) => {
            const group = document.querySelector(`[aria-label="${label}"]`)!
            const reference = document.createElement('span')
            document.body.append(reference)
            const resolveColor = (token: string) => {
              reference.style.backgroundColor = `var(${token})`
              return getComputedStyle(reference).backgroundColor
            }
            return Array.from(group.querySelectorAll('button')).map((button) => {
              const selected = button.getAttribute('aria-pressed') === 'true'
              const style = getComputedStyle(button)
              reference.style.fontSize = 'var(--fs-sm)'
              reference.style.boxShadow = selected
                ? 'inset 0 0 0 1.5px var(--primary)'
                : 'inset 0 0 0 1px var(--hairline)'
              const bounds = button.getBoundingClientRect()
              return {
                selected,
                fontSize: style.fontSize,
                expectedFontSize: getComputedStyle(reference).fontSize,
                background: style.backgroundColor,
                expectedBackground: resolveColor(selected ? '--primary-dim' : '--bg-well'),
                color: style.color,
                expectedColor: resolveColor(selected ? '--fg-1' : '--fg-2'),
                ring: style.boxShadow,
                expectedRing: getComputedStyle(reference).boxShadow,
                height: bounds.height,
                right: bounds.right,
              }
            })
          }, messages.wrapped.periodGroup)
          expect(chips).toHaveLength(3)
          expect(chips.filter((chip) => chip.selected)).toHaveLength(1)
          for (const chip of chips) {
            expect(chip.fontSize).toBe(chip.expectedFontSize)
            expect(chip.background).toBe(chip.expectedBackground)
            expect(chip.color).toBe(chip.expectedColor)
            expect(chip.ring).toBe(chip.expectedRing)
            expect(chip.height).toBeGreaterThanOrEqual(48)
            expect(chip.right).toBeLessThanOrEqual(320)
          }
        }
      } finally {
        await page.close()
      }
    },
  )

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
      expect(measured.backControlWidth).toBe(48)
      expect(measured.backControlHeight).toBe(48)
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

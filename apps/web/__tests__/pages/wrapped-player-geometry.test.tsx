import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile, createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import type { Recap } from '@orbit/shared/types/gamification'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import {
  closeChrome,
  registerChromeLaunchHook,
  type Browser,
  type BrowserLaunch,
} from '@/__tests__/support/chromium'

const wrapped = vi.hoisted(() => ({
  recap: null as Recap | null,
  slides: [] as unknown[],
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: createMockProfile({ weekStartDay: 1 }) }),
}))

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-wrapped', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-wrapped')>(),
  useWrapped: () => ({
    recap: wrapped.recap,
    slides: wrapped.slides,
    isEmpty: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/components/share/share-card-qr', () => ({ ShareCardQr: () => null }))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null },
    isSharing: false,
    hasError: false,
    canShareFiles: true,
    share: vi.fn(),
    download: vi.fn(),
  }),
}))

import WrappedPage from '@/app/(app)/wrapped/page'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 640, height: 360 },
  { width: 412, height: 700 },
  { width: 500, height: 706 },
  { width: 412, height: 800 },
  { width: 1440, height: 900 },
].concat([{ width: 844, height: 390 }]).flatMap((viewport) => [
  { ...viewport, locale: 'en', toast: false, safeArea: false },
  { ...viewport, locale: 'en', toast: true, safeArea: false },
  { ...viewport, locale: 'pt-BR', toast: true, safeArea: false },
  ...([320, 412, 500, 844].includes(viewport.width) ? [{ ...viewport, locale: 'pt-BR', toast: viewport.width !== 844, safeArea: true }] : []),
])

function playerInsets(width: number, safeArea: boolean) {
  if (!safeArea) return { top: 0, bottom: 0, left: 0, right: 0 }
  return width === 844
    ? { top: 0, bottom: 21, left: 44, right: 44 }
    : { top: 24, bottom: 34, left: 0, right: 0 }
}

describe('WrappedPage player reload banner geometry in Chromium', () => {
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

  afterEach(() => { vi.useRealTimers() })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 1, 12))
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    useAppToastStore.setState({ currentToast: null, queue: [] })
    wrapped.recap = createMockRecap({ metrics: createMockRetrospectiveMetrics({ periodDays: 4 }) })
    wrapped.slides = buildWrappedSlides(wrapped.recap)
  })

  async function measureSlide(viewport: { width: number; height: number }, markup: string, safeArea = false) {
    const page = await browser.newPage({ viewport })
    try {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: playerInsets(viewport.width, safeArea) })
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      await loadAppFonts(page)
      return await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')!
        const notice = dialog.querySelector('[data-shell-notice]')!
        const pager = dialog.querySelector('[data-testid="wrapped-pager"]')!
        const frame = dialog.querySelector('[data-testid="wrapped-frame"]')!.getBoundingClientRect()
        const banner = notice.querySelector('[data-update-banner]')!.getBoundingClientRect()
        const slideParts = dialog.querySelectorAll('[data-testid="wrapped-motion-part"]')
        const close = dialog.querySelector('button')!
        const unavailableValueOverflow = [...dialog.querySelectorAll('[data-unavailable]')].filter((column) => {
          const bounds = column.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(column.firstElementChild!)
          return [...range.getClientRects()].some((text) => text.left < bounds.left - 0.5 || text.right > bounds.right + 0.5)
        }).length
        const atStart = {
          undersizedControls: [...dialog.querySelectorAll('button')].filter((button) => {
            const bounds = button.getBoundingClientRect()
            return bounds.width > 0 && bounds.height > 0 && (bounds.width < 44 || bounds.height < 44)
          }).map((button) => button.getAttribute('aria-label') ?? button.textContent),
          unavailableColumnCount: dialog.querySelectorAll('[data-unavailable]').length,
          unavailableValueOverflow,
          controls: [...dialog.querySelectorAll('button, h1, h2, p, [data-shell-notice], [data-testid="wrapped-pager"]')].map((element) => {
            const bounds = element.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right }
          }),
          closeTop: close.getBoundingClientRect().top,
          closeBottom: close.getBoundingClientRect().bottom,
          noticeTop: notice.getBoundingClientRect().top,
          noticeBottom: notice.getBoundingClientRect().bottom,
          pagerTop: pager.getBoundingClientRect().top,
          pagerBottom: pager.getBoundingClientRect().bottom,
          bannerInset: { left: banner.left - frame.left, right: frame.right - banner.right },
        }
        const scroller = dialog.querySelector('[data-testid="wrapped-page-scroll"]') ?? dialog
        scroller.scrollTop = scroller.scrollHeight
        return {
          ...atStart,
          closeTopAtEnd: close.getBoundingClientRect().top,
          closeBottomAtEnd: close.getBoundingClientRect().bottom,
          pagerBottomAtEnd: pager.getBoundingClientRect().bottom,
          noticeTopAtEnd: notice.getBoundingClientRect().top,
          lastSlidePartBottomAtEnd: slideParts[slideParts.length - 1]!.getBoundingClientRect().bottom,
        }
      })
    } finally {
      await page.close()
    }
  }

  it.each(VIEWPORTS)('keeps the banner and pager in view on every slide at $width by $height in $locale, toast $toast', async ({ locale, toast, safeArea = false, ...viewport }) => {
    const messages = locale === 'en' ? en : pt
    const insets = playerInsets(viewport.width, safeArea)
    useVersionGateStore.getState().requireReload('appUpdated')
    if (toast) {
      useAppToastStore.getState().showToast({
        kind: 'neutral', message: messages.errors.api.appUpdated, actionLabel: messages.errors.api.reload, onAction: vi.fn(),
      })
    }
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messages}><WrappedPage /></NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: messages.wrapped.start }))
    await act(async () => {})
    expect(container.querySelectorAll('[role="dialog"] [data-shell-notice] [role="status"]')).toHaveLength(toast ? 2 : 1)

    for (const slide of wrapped.slides as { id: string }[]) {
      const measured = await measureSlide(viewport, container.innerHTML, safeArea)

      expect({ slide: slide.id, pagerBottom: measured.pagerBottom <= viewport.height - insets.bottom })
        .toEqual({ slide: slide.id, pagerBottom: true })
      for (const control of measured.controls) {
        expect(control.left).toBeGreaterThanOrEqual(insets.left)
        expect(control.right).toBeLessThanOrEqual(viewport.width - insets.right)
      }
      expect(measured.unavailableColumnCount).toBe(slide.id === 'consistency' ? 3 : 0)
      expect(measured.unavailableValueOverflow).toBe(0)
      expect(measured.undersizedControls, `slide ${slide.id} control targets`).toEqual([])
      expect(measured.closeTop).toBeGreaterThanOrEqual(insets.top)
      expect(measured.closeBottom).toBeLessThanOrEqual(viewport.height)
      expect(measured.closeTopAtEnd).toBeGreaterThanOrEqual(0)
      expect(measured.closeBottomAtEnd).toBeLessThanOrEqual(viewport.height)
      expect(measured.pagerBottomAtEnd).toBeLessThanOrEqual(viewport.height - insets.bottom)
      expect(measured.bannerInset).toEqual({ left: 0, right: 0 })
      expect(measured.noticeTop).toBeGreaterThanOrEqual(0)
      expect(measured.noticeBottom).toBeLessThanOrEqual(measured.pagerTop + 0.5)
      expect(measured.lastSlidePartBottomAtEnd).toBeLessThanOrEqual(measured.noticeTopAtEnd + 0.5)

      const next = screen.queryByTestId('wrapped-next-zone')
      if (next) fireEvent.click(next)
    }
  })

  it.each([
    { width: 412, height: 915, top: 24, bottom: 34, left: 0, right: 0 },
    { width: 844, height: 390, top: 0, bottom: 21, left: 44, right: 44 },
    { width: 844, height: 390, top: 0, bottom: 0, left: 0, right: 0 },
  ])('restores the cover inset after closing the player at $width', async ({ width, height, ...insets }) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}><WrappedPage /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: en.wrapped.start }))
    fireEvent.click(screen.getByRole('button', { name: en.wrapped.close }))
    await act(async () => {})
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets })
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const back = (await page.getByRole('button', { name: en.common.backToProfile }).boundingBox())!
      expect(back.y).toBe(insets.top + 4)
      expect(back.x).toBe(insets.left + 16)
      expect(back.x + back.width).toBeLessThanOrEqual(width - insets.right)
      expect(container.querySelector('[role="dialog"]')).toBeNull()
    } finally { await page.close() }
  })

  it.each(['dark', 'light'] as const)('fills the whole close target on hover and press in %s mode', async (mode) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}><WrappedPage /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: en.wrapped.start }))
    await act(async () => {})
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
    try {
      const declarations = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${declarations}} button{transition:none !important}</style>${container.innerHTML}`)
      const close = page.getByRole('button', { name: en.wrapped.close, exact: true })
      const bounds = await close.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(44)
      expect(bounds!.height).toBeGreaterThanOrEqual(44)
      const readFill = () => close.evaluate((element) => {
        const style = getComputedStyle(element)
        const probe = document.createElement('span')
        probe.style.backgroundColor = 'var(--bg-hover)'
        element.append(probe)
        const expected = getComputedStyle(probe).backgroundColor
        probe.remove()
        return {
          background: style.backgroundColor, expected, overflow: style.overflow,
          before: getComputedStyle(element, '::before').content,
          after: getComputedStyle(element, '::after').content,
        }
      })
      await close.hover()
      const hovered = await readFill()
      expect(hovered).toMatchObject({ background: hovered.expected, overflow: 'hidden', before: 'none', after: 'none' })
      await page.mouse.down()
      const pressed = await readFill()
      expect(pressed.background).toBe(pressed.expected)
      await page.mouse.up()
    } finally { await page.close() }
  })
})

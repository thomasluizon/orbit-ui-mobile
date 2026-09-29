import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
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

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 640, height: 360 },
  { width: 412, height: 800 },
  { width: 1440, height: 900 },
].flatMap((viewport) => [
  { ...viewport, locale: 'en', toast: false },
  { ...viewport, locale: 'en', toast: true },
  { ...viewport, locale: 'pt-BR', toast: true },
])

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

  beforeEach(() => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    useAppToastStore.setState({ currentToast: null, queue: [] })
    wrapped.recap = createMockRecap()
    wrapped.slides = buildWrappedSlides(wrapped.recap)
  })

  async function measureSlide(viewport: { width: number; height: number }, markup: string) {
    const page = await browser.newPage({ viewport })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      return await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')!
        const notice = dialog.querySelector('[data-shell-notice]')!
        const pager = dialog.querySelector('[data-testid="wrapped-pager"]')!
        const frame = dialog.querySelector('[data-testid="wrapped-frame"]')!.getBoundingClientRect()
        const banner = notice.querySelector('[data-update-banner]')!.getBoundingClientRect()
        const slideParts = dialog.querySelectorAll('[data-testid="wrapped-motion-part"]')
        const atStart = {
          noticeTop: notice.getBoundingClientRect().top,
          noticeBottom: notice.getBoundingClientRect().bottom,
          pagerTop: pager.getBoundingClientRect().top,
          pagerBottom: pager.getBoundingClientRect().bottom,
          bannerInset: { left: banner.left - frame.left, right: frame.right - banner.right },
        }
        dialog.scrollTop = dialog.scrollHeight
        return {
          ...atStart,
          noticeTopAtEnd: notice.getBoundingClientRect().top,
          lastSlidePartBottomAtEnd: slideParts[slideParts.length - 1]!.getBoundingClientRect().bottom,
        }
      })
    } finally {
      await page.close()
    }
  }

  it.each(VIEWPORTS)('keeps the banner and pager in view on every slide at $width by $height in $locale, toast $toast', async ({ locale, toast, ...viewport }) => {
    const messages = locale === 'en' ? en : pt
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
    expect(container.querySelectorAll('[role="dialog"] [data-shell-notice] [role="status"]')).toHaveLength(toast ? 2 : 1)

    for (const slide of wrapped.slides as { id: string }[]) {
      const measured = await measureSlide(viewport, container.innerHTML)

      expect({ slide: slide.id, pagerBottom: measured.pagerBottom <= viewport.height })
        .toEqual({ slide: slide.id, pagerBottom: true })
      expect(measured.bannerInset).toEqual({ left: 0, right: 0 })
      expect(measured.noticeTop).toBeGreaterThanOrEqual(0)
      expect(measured.noticeBottom).toBeLessThanOrEqual(measured.pagerTop + 0.5)
      expect(measured.lastSlidePartBottomAtEnd).toBeLessThanOrEqual(measured.noticeTopAtEnd + 0.5)

      const next = screen.queryByTestId('wrapped-next-zone')
      if (next) fireEvent.click(next)
    }
  })
})

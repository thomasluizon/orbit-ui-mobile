import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import { TodayAstra } from '@/components/today/today-astra'
import { DestinationShell } from '@/components/shell/destination-shell'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [createMockNotification({ url: '/chat', body: 'Sua rotina mudou. Vamos conversar?', createdAtUtc: new Date().toISOString() })] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))

describe('Hoje proactive line perimeter', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: 'Geist'; src: url(data:font/ttf;base64,${font}); } :root { --font-sans: 'Geist'; }`
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 600, 840].flatMap((width) => (['dark', 'light'] as const).flatMap((mode) =>
    (width === 320 ? [1, 2] : [1]).map((textScale) => ({ width, mode, textScale })),
  )))('insets the fill and contains keyboard focus at $width in $mode with $textScale text scale', async ({ width, mode, textScale }) => {
    const { container, unmount } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}>
      <DestinationShell onCreate={() => {}}>
        <div className="relative mx-auto w-full max-w-[740px]">
          <TodayAstra today={formatAPIDate(new Date())} isTodaySelected suppressed={false} />
        </div>
        <div aria-hidden="true" style={{ height: 1200 }} />
      </DestinationShell>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${variables}}</style>${container.innerHTML}`)
      await page.evaluate(async ({ mode, textScale }) => {
        document.documentElement.className = mode
        document.querySelector<HTMLElement>('[data-shell-scroller]')!.style.scrollbarGutter = 'stable'
        const sentence = document.querySelector<HTMLElement>('.today-astra-sentence')!
        sentence.style.fontSize = `${Number.parseFloat(getComputedStyle(sentence).fontSize) * textScale}px`
        await document.fonts.ready
      }, { mode, textScale })
      const line = page.locator('.today-astra-line')
      await line.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      expect(await line.evaluate((element) => element === document.activeElement && element.matches(':focus-visible'))).toBe(true)
      const geometry = await line.evaluate(async (element) => {
        await Promise.all(document.getAnimations().map((animation) => animation.finished))
        const scroller = element.closest<HTMLElement>('[data-shell-scroller]')!
        const scrollBounds = scroller.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const outlineWidth = Number.parseFloat(style.outlineWidth)
        const extent = outlineWidth + Number.parseFloat(style.outlineOffset)
        const sentence = element.querySelector<HTMLElement>('.today-astra-sentence')!
        return {
          leftInset: bounds.left - scrollBounds.left - scroller.clientLeft,
          rightInset: scrollBounds.left + scroller.clientLeft + scroller.clientWidth - bounds.right,
          ringLeft: bounds.left - extent, ringRight: bounds.right + extent,
          ringTop: bounds.top - extent, ringBottom: bounds.bottom + extent,
          clientLeft: scrollBounds.left + scroller.clientLeft,
          clientRight: scrollBounds.left + scroller.clientLeft + scroller.clientWidth,
          clientTop: scrollBounds.top + scroller.clientTop,
          clientBottom: scrollBounds.top + scroller.clientTop + scroller.clientHeight,
          outlineWidth, outlineStyle: style.outlineStyle, shadow: style.boxShadow,
          height: bounds.height, sentenceHeight: sentence.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(sentence).lineHeight),
        }
      })
      expect.soft(geometry.leftInset).toBeCloseTo(16, 1)
      expect.soft(geometry.rightInset).toBeCloseTo(16, 1)
      expect.soft(geometry.ringLeft).toBeGreaterThanOrEqual(geometry.clientLeft)
      expect.soft(geometry.ringRight).toBeLessThanOrEqual(geometry.clientRight)
      expect.soft(geometry.ringTop).toBeGreaterThanOrEqual(geometry.clientTop)
      expect.soft(geometry.ringBottom).toBeLessThanOrEqual(geometry.clientBottom)
      expect(geometry.outlineWidth).toBe(2)
      expect(geometry.outlineStyle).toBe('solid')
      expect(geometry.shadow).toBe('none')
      expect(geometry.height).toBeGreaterThanOrEqual(48)
      expect(geometry.sentenceHeight).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1)
    } finally { unmount(); await page.close() }
  })
})

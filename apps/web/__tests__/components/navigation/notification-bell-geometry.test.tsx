import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { NotificationBell, NotificationBellDisplay } from '@/components/navigation/notification-bell'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/query-client'
import { NotificationsPreload } from '@/lib/notifications-preload'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: () => new Promise(() => {}) }))

const cases = [320, 600, 840].flatMap((width) => [5, 12].flatMap((count) => [1, 2].flatMap((textScale) =>
  (['dark', 'light'] as const).flatMap((mode) => (['en', 'pt-BR'] as const).map((locale) => ({ width, count, textScale, mode, locale }))),
)))

describe('root bell count geometry in Chromium', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: TestMono; src: url(data:font/ttf;base64,${font}); } :root { --font-geist-mono: TestMono; --font-mono: TestMono; }`
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it('renders the inline count in server markup before a browser request can move the sibling', async () => {
    const markup = renderToString(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <NotificationsPreload initialNotifications={{ items: [], unreadCount: 15 }}>
        <QueryClientProvider client={createQueryClient()}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button data-sibling="" style={{ width: 48 }}>Opções</button>
            <NotificationBell />
          </div>
        </QueryClientProvider>
      </NotificationsPreload>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 600, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      const bell = page.getByRole('button', { name: 'Avisos, 15 sem ler', exact: true })
      await expect.poll(() => bell.locator('[data-notification-count]').textContent()).toBe('9+')
      const bounds = await bell.boundingBox()
      expect(bounds!.width).toBeGreaterThan(48)
      const sibling = await page.locator('[data-sibling]').boundingBox()
      expect(sibling!.x + sibling!.width).toBeCloseTo(bounds!.x, 1)
    } finally { await page.close() }
  })

  it.each(cases)('contains $count unread at $width with $textScale text scale in $mode and $locale', async ({ width, count, textScale, mode, locale }) => {
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <div data-row="" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', minHeight: 48, paddingInline: 16 }}>
        <NotificationBellDisplay count={count} onClick={vi.fn()} />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${theme};font-size:${16 * textScale}px}</style><div class="${mode}">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate(() => {
        const box = (element: Element) => {
          const bounds = element.getBoundingClientRect()
          return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height, centerY: bounds.top + bounds.height / 2 }
        }
        const button = document.querySelector('button')!
        const count = button.querySelector('[data-notification-count]')!
        return { control: box(button), icon: box(button.querySelector('svg')!), count: box(count), row: box(document.querySelector('[data-row]')!), text: count.textContent.trim(), radius: getComputedStyle(count).borderRadius }
      })
      expect(Math.abs(geometry.count.centerY - geometry.icon.centerY)).toBeLessThanOrEqual(1)
      expect(geometry.count.top - geometry.row.top).toBeGreaterThanOrEqual(4)
      expect(geometry.count.left - geometry.icon.right).toBe(4)
      expect(geometry.control.right).toBe(width - 16)
      expect(geometry.control.width).toBeGreaterThan(48)
      expect(geometry.control.height).toBeGreaterThanOrEqual(48)
      expect(geometry.text).toBe(count > 9 ? '9+' : String(count))
      expect(geometry.radius).toBe('8px')
      for (const content of [geometry.icon, geometry.count]) {
        expect(content.left - geometry.control.left).toBeGreaterThanOrEqual(8)
        expect(geometry.control.right - content.right).toBeGreaterThanOrEqual(8)
        expect(content.top - geometry.control.top).toBeGreaterThanOrEqual(4)
        expect(geometry.control.bottom - content.bottom).toBeGreaterThanOrEqual(4)
      }
      const button = page.getByRole('button')
      for (const state of ['hover', 'press', 'focus'] as const) {
        if (state === 'hover') await button.hover()
        if (state === 'press') await page.mouse.down()
        if (state === 'focus') { await page.mouse.up(); await page.mouse.move(0, 900); await page.keyboard.press('Tab'); await button.focus() }
        await expect.poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(mode === 'dark' ? 'rgba(250, 250, 250, 0.13)' : 'rgba(9, 9, 11, 0.11)')
        expect(await button.boundingBox()).toMatchObject({ width: geometry.control.width, height: geometry.control.height })
      }
    } finally { await page.close() }
  })
})

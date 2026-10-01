import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { NotificationRow } from '@/components/navigation/notification-row'
import { NotificationBellDisplay } from '@/components/navigation/notification-bell'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications' }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 2 }) }))

const CASES = [320, 412, 1352].flatMap((width) => (['en', 'pt-BR'] as const)
  .flatMap((locale) => (['dark', 'light'] as const).map((mode) => ({ width, locale, mode }))))

describe('notification row targets in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    stylesheet += `\n@font-face { font-family: TestGeist; src: url(data:font/ttf;base64,${font}); } :root { --font-sans: TestGeist; }`
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(CASES)('keeps sibling targets distinct at $width in $locale and $mode', async ({ width, locale, mode }) => {
    const title = locale === 'en' ? 'A reminder with a long notification title' : 'Um lembrete com um título de aviso mais longo'
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
      <div style={{ maxWidth: 560, padding: 16 }}>
        <NotificationBellDisplay count={2} />
        <ul style={{ margin: 0, padding: 0 }}>
          {[false, true].map((isRead) => <NotificationRow key={String(isRead)}
            item={createMockNotification({ title, body: 'NotificationContentWithoutBreaks'.repeat(8), isRead })}
            onOpen={vi.fn()} onDelete={vi.fn()} />)}
        </ul>
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('purple', mode)).map(([name, value]) => `${name}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet} :root { ${theme} }</style><div class="${mode}">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('li')).map((row) => {
          const [body, remove] = Array.from(row.querySelectorAll('button'))
          const bodyBounds = body!.getBoundingClientRect()
          const removeBounds = remove!.getBoundingClientRect()
          const hit = document.elementFromPoint(removeBounds.x + removeBounds.width / 2, removeBounds.y + removeBounds.height / 2)
          remove!.focus()
          return {
            width: removeBounds.width, height: removeBounds.height,
            gap: removeBounds.left - bodyBounds.right, right: removeBounds.right,
            sibling: body!.parentElement === remove!.parentElement,
            hit: hit?.closest('button') === remove,
            focus: remove!.matches(':focus-visible'),
            outline: getComputedStyle(remove!).outlineStyle,
            label: remove!.getAttribute('aria-label'),
          }
        })
        return { rows, badgeRadius: getComputedStyle(document.querySelector('[data-notification-count]')!).borderRadius,
          scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }
      })
      expect(geometry.rows).toHaveLength(2)
      for (const row of geometry.rows) {
        expect(row.width).toBe(44)
        expect(row.height).toBe(44)
        expect(row.gap).toBe(4)
        expect(row.right).toBeLessThanOrEqual(width)
        expect(row.sibling).toBe(true)
        expect(row.hit).toBe(true)
        expect(row.focus).toBe(true)
        expect(row.outline).toBe('solid')
        expect(row.label).toBe(`${locale === 'en' ? 'Delete' : 'Apagar'}: ${title}`)
      }
      expect(geometry.badgeRadius).toBe('8px')
      expect(geometry.scrollWidth).toBe(geometry.viewportWidth)
    } finally {
      await page.close()
    }
  })
})

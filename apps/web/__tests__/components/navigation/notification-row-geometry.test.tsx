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
import { measureTitleWords } from '../../../e2e/layout/title-word-geometry'
import { FailureScreen } from '@/components/ui/failure-screen'
import { NotFoundContent } from '@/components/ui/not-found-content'
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
        expect(row.width).toBe(48)
        expect(row.height).toBe(48)
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
  it.each([320, 412].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('keeps notification words whole and error prose wrappable at $width in $locale', async ({ width, locale }) => {
    const titles = ['W'.repeat(60), 'Extraordinarily comprehensive internationalization responsibilities']
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
      <div style={{ padding: 16 }}><ul>{titles.map((title) => <NotificationRow key={title}
        item={createMockNotification({ title })} onOpen={vi.fn()} onDelete={vi.fn()} />)}</ul></div>
      <NotFoundContent />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await page.evaluate(() => document.fonts.ready)
      const titleElements = await page.locator('[data-notification-title]').all()
      expect(titleElements).toHaveLength(2)
      for (const [index, element] of titleElements.entries()) {
        const measured = await element.evaluate(measureTitleWords)
        expect(measured.splitWords).toEqual([])
        expect(measured.visibleLines).toBeGreaterThan(0)
        expect(index === 0 ? measured.textOverflow : measured.lineClamp).toBe(index === 0 ? 'ellipsis' : '2')
        expect(measured.visibleLines).toBeLessThanOrEqual(index === 0 ? 1 : 2)
        expect(measured.height).toBeLessThanOrEqual(measured.lineHeight * (index === 0 ? 1 : 2) + 1)
        expect(measured.overflow).toBe('hidden')
        expect(measured.text).toBe(titles[index])
        const name = await element.locator('xpath=ancestor::button').getAttribute('aria-label')
        expect(name).toContain(titles[index])
      }
      for (const element of await page.locator('.error-surface-title, .error-surface-action a').all()) {
        const measured = await element.evaluate(measureTitleWords)
        expect(measured.splitWords).toEqual([])
        expect(measured.overflowWrap).toBe('normal')
      }
      expect(await page.locator('.error-surface-body').evaluate((element) => getComputedStyle(element).overflowWrap)).toBe('anywhere')
    } finally { await page.close() }
  })

  it('limits emergency wrapping to error prose', async () => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}>
      <FailureScreen error={new Error('failure')} retry={vi.fn()} />
      <NotFoundContent />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const styles = await page.locator('.error-surface-title, .error-surface-action button, .error-surface-action a').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).overflowWrap))
      expect(styles).toEqual(['normal', 'normal', 'normal', 'normal'])
      expect(await page.locator('.error-surface-body').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).overflowWrap))).toEqual(['anywhere', 'anywhere'])
    } finally { await page.close() }
  })

})

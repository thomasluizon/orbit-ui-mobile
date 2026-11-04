import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { contrastOnSurface, controlContrast } from '@orbit/shared/__tests__/contrast'
import { createMockNotification, createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { measureNotificationFill } from '../../../e2e/layout/notification-fill-geometry'
import { measureTitleWords } from '../../../e2e/layout/title-word-geometry'
import { FailureScreen } from '@/components/ui/failure-screen'
import { NotFoundContent } from '@/components/ui/not-found-content'
import { PickerRow } from '@/components/ui/picker-row'
import { ListRow } from '@/components/ui/list-row'
import { HabitBlockRow } from '@/components/chat/habit-block-row'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { NotificationRow } from '@/components/navigation/notification-row'
import { NotificationBellDisplay } from '@/components/navigation/notification-bell'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications' }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 2 }) }))

vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-date-format', () => ({ useDateFormat: () => ({ displayDate: (date: string) => date }) }))

function RelatedRows() {
  const t = useTranslations()
  return <div style={{ display: 'grid', gap: 16, padding: 16 }}>
    <PickerRow name="Picker" selected={false} disabled={false} onToggle={vi.fn()} value="Value" valueClassName="text-sm" controlClassName="orbit-list-row-body rounded-[12px] p-2" actionsClassName="flex items-center gap-2" />
    <ListRow title="Row" description="Description" onClick={vi.fn()} action={{ icon: 'trash', label: 'Delete', onPress: vi.fn() }} />
    <HabitBlockRow title="Habit" meta="Metadata" onOpen={vi.fn()} control={<button type="button">Action</button>} />
    <CalendarSyncEventRow event={createMockCalendarSyncEvent()} weekStartDay={1} selected={false} isReviewMode suggestionId="suggestion" dismissPending={false} t={t} onToggle={vi.fn()} onDismiss={vi.fn()} />
  </div>
}

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
  it.each(CASES)('fills the whole read and unread row at $width in $locale and $mode', async ({ width, locale, mode }) => {
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
      <ul style={{ padding: 16 }}>{[false, true].map((isRead) => <NotificationRow key={String(isRead)} item={createMockNotification({ isRead, habitId: 'notification-fill', url: '/habits/notification-fill' })} onOpen={vi.fn()} onDelete={vi.fn()} />)}</ul>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet} :root { ${theme} }</style><div class="${mode}">${container.innerHTML}</div>`)
      for (const row of await page.locator('li').all()) {
        const [body, remove] = await row.locator('button').all()
        for (const control of [body!, remove!]) {
          await control.hover()
          const measured = await row.evaluate(measureNotificationFill)
          await expect.poll(async () => (await row.evaluate(measureNotificationFill)).fill).toEqual(measured.row)
          const colors = await row.evaluate((element) => {
            const style = getComputedStyle(element)
            const remove = element.querySelector('button:last-child')!
            const text = Array.from(element.querySelectorAll('*')).filter((child) => Array.from(child.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())).map((child) => getComputedStyle(child).color)
            const graphics = Array.from(element.querySelectorAll('svg')).map((glyph) => getComputedStyle(glyph).color)
            return { text, graphics, layers: [style.getPropertyValue('--bg').trim(), style.backgroundColor, getComputedStyle(element, '::before').backgroundColor],
              glyph: getComputedStyle(remove.querySelector('svg')!).color, actionFill: getComputedStyle(remove, '::before').backgroundColor }
          })
          for (const color of colors.graphics) expect(contrastOnSurface(color, colors.layers)).toBeGreaterThanOrEqual(3)
          for (const color of colors.text) expect(contrastOnSurface(color, colors.layers)).toBeGreaterThanOrEqual(4.5)
          expect(contrastOnSurface(colors.glyph, [...colors.layers, colors.actionFill])).toBeGreaterThanOrEqual(3)
          if (control === remove) expect(controlContrast(colors.glyph, colors.actionFill, colors.layers).step).toBeGreaterThanOrEqual(1.25)
          await page.mouse.down()
          expect((await row.evaluate(measureNotificationFill)).fill).toEqual(measured.row)
          await page.mouse.move(0, 0)
          expect((await row.evaluate(measureNotificationFill)).fill).toEqual(measured.row)
          await page.mouse.up()
        }
        await page.keyboard.press('Tab')
        await body!.focus()
        expect((await row.evaluate(measureNotificationFill)).fill).toEqual((await row.evaluate(measureNotificationFill)).row)
        await remove!.focus()
        expect((await row.evaluate(measureNotificationFill)).fill).toEqual((await row.evaluate(measureNotificationFill)).row)
        await remove!.evaluate((element) => element.blur())
      }
    } finally { await page.close() }
  })

  it.each([320, 1352].flatMap((width) => (['light', 'dark'] as const).map((mode) => ({ width, mode }))))('fills sibling-action list surfaces at $width in $mode', async ({ width, mode }) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}><RelatedRows /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet} :root { ${theme} }</style><div class="${mode}">${container.innerHTML}</div>`)
      const rows = await page.locator('.orbit-list-row-shell, [data-habit-block-row], .orbit-list-row-column, [data-picker-row]').all()
      expect(rows).toHaveLength(4)
      for (const row of rows) {
        const body = row.locator('button').first()
        await body.hover()
        await expect.poll(async () => (await row.evaluate(measureNotificationFill)).fill).toEqual((await row.evaluate(measureNotificationFill)).row)
        await page.mouse.down()
        expect((await row.evaluate(measureNotificationFill)).fill).toEqual((await row.evaluate(measureNotificationFill)).row)
        await page.mouse.move(0, 0)
        expect((await row.evaluate(measureNotificationFill)).fill).toEqual((await row.evaluate(measureNotificationFill)).row)
        await page.mouse.up()
      }
    } finally { await page.close() }
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

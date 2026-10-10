import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { settleAnimations } from './settle-animations'

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Calendar options rows in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'trial' })
    const words = locale === 'pt-BR' ? ptBR : en
    for (const width of [320, 360, 384, 412, 600]) {
      test(`aligns row text with the sheet title and keeps a 52px floor at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 915 })
        await page.goto('/calendar')
        await page.getByRole('button', { name: words.calendar.options, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: words.calendar.options, exact: true })
        await expect(dialog).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await dialog.evaluate(settleAnimations)
        const titleLeft = await dialog.getByRole('heading', { name: words.calendar.options, exact: true }).evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return range.getBoundingClientRect().left
        })
        for (const label of [words.calendar.showRecurring, words.calendar.googleCalendar, words.calendar.legendTitle]) {
          const geometry = await dialog.getByText(label, { exact: true }).evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const text = range.getBoundingClientRect()
            const row = element.closest('button')!
            const bounds = row.getBoundingClientRect()
            const style = getComputedStyle(element)
            const fill = row.querySelector('[data-press-fill]')?.getBoundingClientRect()
            return { left: text.left, lines: new Set(Array.from(range.getClientRects()).map((rect) => rect.top)).size, height: bounds.height, fontSize: style.fontSize, fontWeight: style.fontWeight, fillLeft: fill?.left, fillRight: fill?.right, rowRight: bounds.right, textRight: text.right }
          })
          expect(geometry.left).toBeCloseTo(titleLeft, 1)
          expect(geometry.height).toBeGreaterThanOrEqual(52)
          expect(geometry.lines).toBe(1)
          expect(geometry.fontSize).toBe('17px')
          expect(geometry.fontWeight).toBe('400')
          expect(geometry.fillLeft).toBeCloseTo(titleLeft - 16, 1)
          expect(geometry.fillRight).toBeCloseTo(geometry.rowRight + 16, 1)
          expect(geometry.textRight).toBeLessThanOrEqual(geometry.rowRight)
        }
      })
    }
  })
}

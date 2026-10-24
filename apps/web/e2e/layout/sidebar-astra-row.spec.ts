import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { expectInteractionFill } from './label-interaction-fill'
import { inspectFocusedRing, readOutlineVisibility } from './focus-indicators'
import { getShellConversationEntry } from './shell-conversation-entry'

for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
  for (const width of [1100, 1352, 1440]) {
    test.describe(`sidebar Astra in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { aiMessagesUsed: 0 } })
      test('shares destination geometry and opens, closes and navigates with focus', async ({ page }) => {
        await page.goto('/')
        const sidebar = page.locator('[data-shell-sidebar]')
        const row = getShellConversationEntry(page, width, words)
        const label = row.getByText(words.nav.astra, { exact: true })
        const today = sidebar.getByRole('link', { name: words.nav.today, exact: true })
        const calendar = sidebar.getByRole('link', { name: words.nav.calendar, exact: true })
        await expect(row).toBeVisible()
        await expect(sidebar.locator('nav > button').first()).toHaveAccessibleName(words.nav.astra)
        await expect(label).toBeVisible()
        await expect(label).toHaveAttribute('translate', 'no')
        await page.evaluate(() => document.fonts.ready)
        const astraBox = (await row.boundingBox())!
        const todayBox = (await today.boundingBox())!
        expect(astraBox.x).toBe(todayBox.x)
        expect(astraBox.width).toBe(todayBox.width)
        expect(astraBox.height).toBeGreaterThanOrEqual(48)
        expect(astraBox.y + astraBox.height + 4).toBeCloseTo(todayBox.y, 1)
        await expect(row.locator('svg')).toHaveAttribute('width', '20')
        await expect(row.locator('svg')).toHaveAttribute('height', '20')
        await expect(row).toHaveText(words.nav.astra)
        const labelBox = (await label.boundingBox())!
        expect(labelBox.width).toBeGreaterThan(1)
        expect(labelBox.height).toBeGreaterThan(1)
        expect(labelBox.x).toBeGreaterThanOrEqual(astraBox.x)
        expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(astraBox.x + astraBox.width)
        const markGeometry = await row.locator('svg').evaluate(element => {
          const mark = element.getBoundingClientRect()
          const row = element.closest('button')!.getBoundingClientRect()
          return { height: mark.height, left: mark.left, right: mark.right, rowLeft: row.left, rowRight: row.right,
            centerOffset: Math.abs(mark.top + mark.height / 2 - row.top - row.height / 2) }
        })
        expect(markGeometry.height).toBe(20)
        expect(markGeometry.left).toBeGreaterThanOrEqual(markGeometry.rowLeft)
        expect(markGeometry.right).toBeLessThanOrEqual(markGeometry.rowRight)
        expect(markGeometry.centerOffset).toBeLessThanOrEqual(0.5)
        await expectInteractionFill(row)
        await page.keyboard.press('Tab')
        await row.focus()
        const outline = await readOutlineVisibility(row)
        expect(outline.visible).toBe(true)
        expect(outline.clippedBy).toEqual([])
        expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
        await expect(row).toHaveCSS('border-radius', '12px')
        const neutral = await calendar.evaluate(element => getComputedStyle(element).color)
        await page.keyboard.press('Enter')
        const conversation = page.locator('[data-shell-conversation]')
        await expect(conversation.locator('[data-composer-input]')).toBeFocused()
        await expect(row).toHaveAttribute('aria-expanded', 'true')
        await expect(today).toHaveAttribute('aria-current', 'page')
        await expect(row.locator('svg')).toHaveAttribute('color', 'var(--primary)')
        await expect(today).toHaveCSS('color', neutral)
        await page.keyboard.press('Escape')
        await expect(conversation).toHaveCount(0)
        await expect(row).toBeFocused()
        await expect(row).toHaveAttribute('aria-expanded', 'false')
        const toggle = sidebar.locator('[data-shell-sidebar-toggle]')
        await toggle.click()
        await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
        await expect(row).toHaveAccessibleName(words.nav.astra)
        await expect(row).toHaveAttribute('title', words.nav.astra)
        await expect(label).toHaveText(words.nav.astra)
        await expect(label).toHaveCSS('position', 'absolute')
        await expect(label).toHaveCSS('clip-path', 'inset(50%)')
        const hiddenLabelBox = (await label.boundingBox())!
        expect(hiddenLabelBox.width).toBe(1)
        expect(hiddenLabelBox.height).toBe(1)
        await toggle.click()
        await expect(sidebar).not.toHaveAttribute('data-collapsed')
        await expect(label).toHaveCSS('position', 'static')
        await expect(label).toHaveCSS('clip-path', 'none')
        await expect(label).toBeVisible()
        await row.click()
        await calendar.click()
        await expect(conversation).toHaveCount(0)
        await expect(page).toHaveURL(/\/calendar/)
        await expect(page.locator('[data-shell-scroller]')).toBeVisible()
      })
    })
  }
  for (const width of [840, 412]) {
    test.describe(`compact sidebar in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('has no sidebar Astra row', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('[data-shell-astra-row]')).toHaveCount(0)
      })
    })
  }
}

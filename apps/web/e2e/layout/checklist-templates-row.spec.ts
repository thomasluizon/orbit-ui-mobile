import { expect, test } from '@playwright/test'
import messages from '@orbit/shared/i18n/en.json'

for (const width of [412, 1280] as const) {
  test.describe(`checklist templates row at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('keeps its hover fill rounded, inset, and below the checklist input', async ({ page }) => {
      await page.goto('/')
      const create = width === 1280
        ? page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.nav.createHabit })
        : page.getByRole('button', { name: messages.habits.createManually })
      await create.click()
      await page.getByRole('button', { name: messages.habits.form.moreDetails }).click()

      const disclosure = page.locator('.habit-form-disclosure[data-open="true"]')
      const input = disclosure.getByPlaceholder(messages.habits.form.checklistPlaceholder)
      const inputBlock = input.locator('xpath=..')
      const button = disclosure.getByRole('button', { name: messages.habits.form.templates })
      const row = button.locator('xpath=..')
      await expect(input).toBeVisible()
      await expect(row).toHaveClass(/orbit-list-row-form/)
      await button.hover()

      const inputBox = await input.boundingBox()
      const inputBlockBox = await inputBlock.boundingBox()
      const rowBox = await row.boundingBox()
      expect(inputBox).not.toBeNull()
      expect(inputBlockBox).not.toBeNull()
      expect(rowBox).not.toBeNull()
      if (!inputBox || !inputBlockBox || !rowBox) return
      expect(rowBox.x).toBeGreaterThan(inputBlockBox.x)
      expect(rowBox.x + rowBox.width).toBeLessThan(inputBlockBox.x + inputBlockBox.width)
      expect(rowBox.y - (inputBox.y + inputBox.height)).toBeGreaterThanOrEqual(8)
      expect(rowBox.height).toBe(52)
      await expect(row).toHaveCSS('border-radius', '12px')
      await expect.poll(() => row.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe('rgba(0, 0, 0, 0)')

      const glyph = row.locator('[data-icon="template"] svg')
      await expect(glyph).toBeVisible()
      const glyphBox = await glyph.boundingBox()
      expect(glyphBox?.width).toBeGreaterThan(0)
      expect(glyphBox?.height).toBeGreaterThan(0)
    })
  })
}

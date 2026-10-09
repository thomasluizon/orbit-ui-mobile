import { expect, test } from '@playwright/test'
import messages from '@orbit/shared/i18n/en.json'

for (const width of [412, 1280] as const) {
  test.describe(`checklist templates row at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('keeps its hover fill rounded, aligned, and below the checklist input', async ({ page }) => {
      await page.goto('/habits/new')
      const screen = page.locator('[data-habit-create-screen]')
      await expect(screen).toBeVisible()
      await screen.getByRole('button', { name: messages.habits.form.moreDetails }).click()

      const disclosure = screen.locator('.habit-form-disclosure[data-open="true"]')
      const input = disclosure.getByPlaceholder(messages.habits.form.checklistPlaceholder)
      const inputBlock = input.locator('xpath=..')
      const button = disclosure.getByRole('button', { name: messages.habits.form.useTemplate })
      const row = button.locator('xpath=..')
      const fill = row.locator('[data-slot="list-row-body"]')
      const first = row.locator('[data-slot="list-row-icon"]')
      await expect(input).toBeVisible()
      await expect(button).not.toContainText(/\d/)
      await button.hover()

      const inputBox = await input.boundingBox()
      const inputBlockBox = await inputBlock.boundingBox()
      const rowBox = await row.boundingBox()
      expect(inputBox).not.toBeNull()
      expect(inputBlockBox).not.toBeNull()
      expect(rowBox).not.toBeNull()
      if (!inputBox || !inputBlockBox || !rowBox) return
      expect(rowBox.x).toBeCloseTo(inputBlockBox.x, 1)
      expect(rowBox.x + rowBox.width).toBeCloseTo(inputBlockBox.x + inputBlockBox.width, 1)
      expect(rowBox.y - (inputBox.y + inputBox.height)).toBeGreaterThanOrEqual(8)
      expect(rowBox.height).toBe(52)
      await expect(button).toHaveCSS('border-radius', '12px')
      const buttonBox = await button.boundingBox()
      expect(buttonBox).toEqual(rowBox)
      const fillBox = (await fill.boundingBox())!
      const contentBox = (await first.boundingBox())!
      expect(contentBox.x).toBeCloseTo(inputBlockBox.x, 1)
      expect(fillBox.x).toBeCloseTo(inputBlockBox.x - 16, 1)
      expect(fillBox.x + fillBox.width).toBeCloseTo(inputBlockBox.x + inputBlockBox.width + 16, 1)
      await expect(fill).toHaveCSS('padding-block', '12px')
      await expect.poll(() => fill.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe('rgba(0, 0, 0, 0)')

      const glyph = row.locator('[data-icon="template"] svg')
      await expect(glyph).toBeVisible()
      const glyphBox = await glyph.boundingBox()
      expect(glyphBox?.width).toBeGreaterThan(0)
      expect(glyphBox?.height).toBeGreaterThan(0)
    })
  })
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { checklistTemplateSchema } from '@orbit/shared/types/checklist-template'
import { test } from './layout-test'
import { setLayoutFixtureSession } from './profile-session'
import { readControlPaint } from './control-paint'
import { openOptionalStep, reachCreateSummary } from './guided-habit-steps'

const TEMPLATES_ABOVE_QUICK_OPTIONS = ['Workout', 'Morning', 'Evening', 'Weekly review', 'Packing'].map((name, index) =>
  checklistTemplateSchema.parse({ id: `template-${index}`, name, items: ['One', 'Two'] }))

for (const width of [412, 1280] as const) {
  test.describe(`checklist templates row at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('keeps its hover fill rounded, on the column edge, and clear of the delete action', async ({ page, context }) => {
      await setLayoutFixtureSession(context, [{ path: API.checklistTemplates.list, body: TEMPLATES_ABOVE_QUICK_OPTIONS }])
      await page.goto('/habits/new')
      await reachCreateSummary(page, messages)
      await openOptionalStep(page, messages, 'checklist')
      await page.getByRole('button', { name: messages.habits.flow.checklist.useTemplate, exact: true }).click()
      await expect(page.getByRole('heading', { name: messages.habits.flow.templates.question, exact: true })).toBeVisible()

      const list = page.locator('[data-template-row]')
      await expect(list).toHaveCount(TEMPLATES_ABOVE_QUICK_OPTIONS.length)
      const row = list.first()
      const button = row.getByRole('button', { name: /^Workout/ })
      const remove = row.getByRole('button', { name: `${messages.common.delete}: Workout`, exact: true })
      await expect(button).not.toContainText(/^\d/)
      await button.hover()

      const rowBox = (await row.boundingBox())!
      const buttonBox = (await button.boundingBox())!
      const removeBox = (await remove.boundingBox())!
      const columnBox = (await page.locator('[data-flow-scroll] > div').first().boundingBox())!
      expect(rowBox.x).toBeCloseTo(columnBox.x, 1)
      expect(rowBox.x + rowBox.width).toBeCloseTo(columnBox.x + columnBox.width, 1)
      expect(buttonBox.height).toBeGreaterThanOrEqual(48)
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(removeBox.x)
      await expect(button).toHaveCSS('border-radius', '12px')
      await expect.poll(async () => (await button.evaluate(readControlPaint)).background).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/)
      const paint = await button.evaluate(readControlPaint)
      expect(paint.bounds.left).toBeCloseTo(columnBox.x, 1)
      expect(paint.bounds.right).toBeLessThanOrEqual(columnBox.x + columnBox.width + 0.5)
    })
  })
}

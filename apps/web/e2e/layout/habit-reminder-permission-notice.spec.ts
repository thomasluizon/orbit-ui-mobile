import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { expectInteractionFill } from './label-interaction-fill'

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`habit reminder permission notice in ${locale}`, () => {
    test.use({ appLocale: locale })

    for (const width of [412, 840, 1100]) {
      test(`makes the whole notice a padded settings link at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await page.addInitScript(() => {
          Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'denied' })
        })
        const habit = habitDetailSchema.parse({
          ...makeHabitDetail(), dueTime: '08:00:00', reminderEnabled: true, reminderTimes: [15],
        })
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
        await page.goto('/habits/habit-1')
        const messages = locale === 'en' ? en : ptBr
        await page.getByRole('button', { name: messages.habits.detail.moreDetails }).click()
        const fields = page.locator('#habit-detail-fields')
        const notice = fields.getByRole('status').filter({ hasText: messages.habits.form.reminderPermissionNeeded })
        await expect(notice).toBeVisible()
        const control = notice.getByRole('link', { name: messages.habits.form.reminderPermissionNeeded, exact: true })
        await expect(notice.locator('a, button, input, select, textarea, [tabindex="0"]')).toHaveCount(1)
        await expect(control).toHaveText(messages.habits.form.reminderPermissionNeeded)
        await expect(notice).toHaveText(await control.innerText())
        await expect(control).toHaveAttribute('href', '/profile/notifications')
        await expect(control).toHaveAttribute('target', '_blank')
        await expect(control).toHaveAccessibleDescription(messages.habits.form.reminderSettingsDescription)
        await page.evaluate(() => document.fonts.ready)
        expect(await control.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48)
        const inlineActions = await fields.locator('p').evaluateAll((paragraphs) => paragraphs.filter((paragraph) => {
          if (!paragraph.querySelector('a, button')) return false
          const copy = paragraph.cloneNode(true) as HTMLElement
          copy.querySelectorAll('a, button').forEach((action) => action.remove())
          return Boolean(copy.textContent.trim())
        }).length)
        expect(inlineActions).toBe(0)
        await expectInteractionFill(control)
      })
    }
  })
}

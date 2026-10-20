import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const habit = habitDetailSchema.parse(makeHabitDetail())
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [412, 1280]) {
    test.describe(`habit detail chips in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('keeps pause and rename in order and one Ask Astra row', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))
        await page.goto(`/habits/${habit.id}`)

        const suggestions = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel, exact: true })
        await expect(suggestions).toBeVisible()
        await expect(suggestions.getByRole('button')).toHaveText([
          messages.shell.composer.chips.habitDetail.pauseThisWeek,
          messages.shell.composer.chips.habitDetail.rename,
        ])
        await expect(suggestions.getByRole('button', { name: messages.habits.detail.askAstra, exact: true })).toHaveCount(0)
        const askAstra = page.getByRole('button', { name: messages.habits.detail.askAstra, exact: true })
        await expect(askAstra).toHaveCount(1)
        await expect(askAstra).toBeVisible()
      })
    })
  }
}

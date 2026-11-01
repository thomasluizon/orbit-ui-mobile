import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { createSmokeHabit } from '../support/smoke-adapters'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [412, 1280]) {
    test.describe(`smoke creation from zero habits in ${locale} at ${width}px`, () => {
      test.use({
        appLocale: locale,
        viewport: { width, height: 915 },
        layoutProfile: {
          hasCreatedFirstHabit: false, hasLoggedFirstHabit: false,
          hasTriedAstra: false, hasCompletedOnboardingChecklist: false,
        },
      })

      test('creates through the real empty Today entry without a FAB', async ({ page, context }) => {
        const messages = locale === 'en' ? en : ptBR
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: emptyHabitsPageFixture }])
        await page.goto('/')
        await expect(page.getByRole('region', { name: messages.today.setupChecklist.title, exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: messages.habits.createManually, exact: true })).toBeVisible()
        await expect(page.locator('[data-shell-fab]')).toHaveCount(0)

        await createSmokeHabit(page, 'Smoke first habit')

        await expect(page.getByRole('textbox', { name: messages.habits.form.taskDescribe, exact: true })).toBeHidden()
      })
    })
  }
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import {
  progressGoalsEmptyGamification, progressGoalsEmptyProfile, progressGoalsEmptyStreak,
} from './progress-goals-empty-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [412, 1352]) {
    test.describe(`Streak loading frame in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, subscriptionState: 'trial', layoutProfile: progressGoalsEmptyProfile,
        viewport: { width, height: 915 } })
      test('keeps the goals heading at the same top when the delayed streak response lands', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [
          { path: API.gamification.profile, body: progressGoalsEmptyGamification },
          { path: API.gamification.streak, body: progressGoalsEmptyStreak, delayMs: 8_000 },
        ])
        await page.goto('/progress')
        const words = locale === 'en' ? en : ptBR
        const streak = page.getByRole('region', { name: words.progressScreen.sections.streak })
        const goals = page.getByRole('heading', { name: words.progressScreen.sections.goals, exact: true })
        const bank = streak.locator('[data-component="freeze-bank"]')
        await expect(bank).toHaveAttribute('aria-busy', 'true')
        await expect(streak.locator('[data-scope="account"] [data-state]')).toHaveCount(14)
        await page.evaluate(() => document.fonts.ready)
        const before = await goals.evaluate((heading) => heading.getBoundingClientRect().top)
        await expect(bank).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
        expect(await goals.evaluate((heading) => heading.getBoundingClientRect().top)).toBe(before)
      })
    })
  }
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { progressStreakStates } from '@orbit/shared/__tests__/progress-streak-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import {
  progressGoalsEmptyGamification, progressGoalsEmptyProfile,
} from './progress-goals-empty-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [412, 1352]) {
    test.describe(`Streak loading frame in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, subscriptionState: 'trial', layoutProfile: { ...progressGoalsEmptyProfile, language: locale },
        viewport: { width, height: 915 } })
      for (const { name, streak: response } of progressStreakStates) {
        test(`keeps the summary bottom fixed after delayed ${name}`, async ({ page, context }) => {
          await setLayoutFixtureSession(context, [
            { path: API.gamification.profile, body: progressGoalsEmptyGamification },
            { path: API.gamification.streak, body: response, delayMs: 8_000 },
          ])
          await page.goto('/progress/streak')
          const words = locale === 'en' ? en : ptBR
          const summary = page.getByRole('region', { name: words.progressScreen.sections.streak })
          const heading = page.getByRole('heading', { name: words.progressScreen.sections.streak, level: 1, exact: true })
          const entry = page.getByRole('button', { name: words.progressScreen.streak.freezes, exact: true })
          await expect(summary).toHaveAttribute('aria-busy', 'true')
          await expect(entry).toBeDisabled()
          await expect(summary.locator('[data-scope="account"] [data-state]')).toHaveCount(14)
          await page.evaluate(() => document.fonts.ready)
          const before = await summary.evaluate((element) => element.getBoundingClientRect().bottom)
          const headerTop = await heading.evaluate((element) => element.getBoundingClientRect().top)
          await expect(summary).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
          expect(await summary.evaluate((element) => element.getBoundingClientRect().bottom)).toBe(before)
          await expect(entry).toBeEnabled()
          expect(await heading.evaluate((element) => element.getBoundingClientRect().top)).toBe(headerTop)
        })
      }
    })
  }
}

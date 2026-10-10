import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal()], page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
})

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Progress stat values in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'trial', layoutProfile: { canViewGamification: true } })
    const words = locale === 'pt-BR' ? ptBR : en

    for (const width of [412, 500, 1352, 1440]) {
      test(`spaces streak groups and figure tiles by 16px at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        const streak = streakInfoSchema.parse({
          currentStreak: 0, longestStreak: 21, lastActiveDate: '2026-09-01',
          freezesUsedThisMonth: 1, freezesAvailable: 2, maxFreezesPerMonth: 3,
          isFrozenToday: false, recentFreezeDates: ['2026-08-31'],
          streakFreezesAccumulated: 2, maxStreakFreezesAccumulated: 3,
          daysUntilNextFreeze: 3, freezesAvailableToUse: 2, canEarnMore: true,
          isRepairAvailable: true, repairableGapDates: ['2026-09-02', '2026-09-03'],
        })
        await context.route(`${LAYOUT_ORIGIN}${API.gamification.streak}`, (route) => route.fulfill({ json: streak }))
        await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goals }))
        const retrospective = retrospectiveResponseSchema.parse({
          period: 'month', metrics: createMockRetrospectiveMetrics(),
          narrative: { highlights: '', missed: '', trends: '', suggestion: '' }, fromCache: false,
        })
        await context.route(
          (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.retrospective,
          (route) => route.fulfill({ json: retrospective }),
        )
        await page.goto('/progress')
        const section = page.getByRole('region', { name: words.progressScreen.sections.streak })
        const bank = section.locator('[data-component="freeze-bank"]')
        await expect(bank).toHaveAttribute('data-protected-state', 'protected')
        const gapCard = section.getByRole('button', { name: new RegExp(words.progressScreen.streak.repairAction.split('{')[0]!) }).locator('..')
        await expect(gapCard).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(await bank.evaluate((element) => {
          const groups = Array.from(element.children)
          const bounds = groups.map((group) => group.getBoundingClientRect())
          const tiles = Array.from(groups[1]!.children).map((tile) => tile.getBoundingClientRect())
          return {
            groupGaps: bounds.slice(1).map((current, index) => current.top - bounds[index]!.bottom),
            tileGap: tiles[1]!.top >= tiles[0]!.bottom
              ? tiles[1]!.top - tiles[0]!.bottom : tiles[1]!.left - tiles[0]!.right,
            gapCardGap: element.nextElementSibling!.getBoundingClientRect().top - bounds[3]!.bottom,
          }
        })).toEqual({ groupGaps: [16, 16, 16], tileGap: 16, gapCardGap: 16 })
        const windowSection = page.getByRole('region', { name: words.progressScreen.sections.window })
        const tiles = windowSection.locator('[data-state="default"]')
        await expect(tiles).toHaveCount(3)
        expect(await tiles.evaluateAll((elements) => {
          const parent = elements[0]!.parentElement!
          return { row: getComputedStyle(parent).rowGap, column: getComputedStyle(parent).columnGap }
        })).toEqual({ row: '16px', column: '16px' })
      })

      test(`keeps three figure values at the same size and the top habit in a row at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        const profile = profileSchema.parse({
          ...profileFixture, language: locale, plan: 'pro', hasProAccess: true,
          isTrialActive: true, trialEndsAt: '2026-09-18T12:00:00Z', canViewGamification: true,
        })
        await setLayoutProfileSession(context, profile)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goals }))
        const metrics = createMockRetrospectiveMetrics({
          completionRate: 38,
          activeDays: 2,
          weeklyConsistency: [100, 0, 0, 0, 0, 0, 0],
        })
        const topHabit = metrics.topHabits[0]!
        const response = retrospectiveResponseSchema.parse({
          period: 'month',
          metrics: { ...metrics, topHabits: [{ ...topHabit, name: 'Caminhar' }] },
          narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
          fromCache: false,
        })
        await context.route(
          (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.retrospective,
          (route) => route.fulfill({ json: response }),
        )
        await page.goto('/progress')
        const windowSection = page.getByRole('region', { name: words.progressScreen.sections.window })
        const values = windowSection.locator('[data-state="default"] > span[title]')
        await expect(values).toHaveText(['38%', '2', words.dates.daysAbbreviated.monday])
        const habitRow = windowSection.locator('[data-personal-text-action]').filter({ has: page.getByTestId('progress-top-habit') })
        const habitTitle = habitRow.locator('span[title]')
        await expect(habitRow).toBeVisible()
        await expect(habitRow).toContainText(words.progressScreen.window.topHabit)
        await expect(habitTitle).toHaveAttribute('title', 'Caminhar')
        await expect(habitTitle).toContainText('Caminhar')
        await expect(habitRow.locator('a, button, [role="button"], [data-state]')).toHaveCount(1)
        expect(await habitTitle.evaluate((element) => ({
          fontSize: getComputedStyle(element).fontSize,
          tabular: getComputedStyle(element).fontVariantNumeric.includes('tabular-nums'),
          precedingFigures: element.closest('[data-personal-text-action]')?.previousElementSibling?.querySelectorAll('[data-state="default"]').length,
        }))).toEqual({ fontSize: '17px', tabular: false, precedingFigures: 3 })
        await page.evaluate(() => document.fonts.ready)
        const geometry = await values.evaluateAll((elements) => elements.map((value) => {
          const tile = value.parentElement!
          const valueBounds = value.getBoundingClientRect()
          const tileBounds = tile.getBoundingClientRect()
          return {
            fontSize: getComputedStyle(value).fontSize,
            scrollWidth: value.scrollWidth,
            clientWidth: value.clientWidth,
            inside: valueBounds.left >= tileBounds.left && valueBounds.right <= tileBounds.right
              && valueBounds.top >= tileBounds.top && valueBounds.bottom <= tileBounds.bottom,
          }
        }))
        expect(geometry.map((value) => value.fontSize)).toEqual(['22px', '22px', '22px'])
        for (const value of geometry) {
          expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth)
          expect(value.inside).toBe(true)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      })
    }
  })
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal()], page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
})

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Progress stat values in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'trial' })
    const words = locale === 'pt-BR' ? ptBR : en

    for (const width of [412, 500, 1352, 1440]) {
      test(`keeps three figure values at the same size and the top habit in a row at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        const profile = profileSchema.parse({
          ...profileFixture, language: locale, plan: 'pro', hasProAccess: true,
          isTrialActive: true, trialEndsAt: '2026-09-18T12:00:00Z', canViewGamification: true,
        })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
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
        const habitRow = windowSection.getByTestId('progress-top-habit')
        const habitTitle = habitRow.locator('span[title]')
        await expect(habitRow).toBeVisible()
        await expect(habitRow).toContainText(words.progressScreen.window.topHabit)
        await expect(habitTitle).toHaveAttribute('title', 'Caminhar')
        await expect(habitTitle).toContainText('Caminhar')
        await expect(habitRow.locator('a, button, [role="button"], [data-state]')).toHaveCount(0)
        expect(await habitTitle.evaluate((element) => ({
          fontSize: getComputedStyle(element).fontSize,
          tabular: getComputedStyle(element).fontVariantNumeric.includes('tabular-nums'),
          precedingFigures: element.parentElement?.previousElementSibling?.querySelectorAll('[data-state="default"]').length,
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

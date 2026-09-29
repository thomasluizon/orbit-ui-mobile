import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { profileSchema } from '@orbit/shared/types/profile'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal()], page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
})

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  test.describe(`${locale} progress weekday at 360px`, () => {
    test.use({ viewport: { width: 360, height: 900 } })

    test('keeps the longest weekday complete inside its tile', async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
      const profile = profileSchema.parse({
        ...profileFixture, language: locale, hasProAccess: true, canViewGamification: true,
      })
      await setLayoutProfileSession(context, profile)
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goals }))
      const weekdayIndex = locale === 'en' ? 2 : 6
      const weeklyConsistency = Array(7).fill(0) as number[]
      weeklyConsistency[weekdayIndex] = 100
      const retrospective = retrospectiveResponseSchema.parse({
        period: 'month',
        metrics: createMockRetrospectiveMetrics({ weeklyConsistency }),
        narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
        fromCache: false,
      })
      await context.route(`${LAYOUT_ORIGIN}${buildRetrospectiveRequestUrl('month', locale)}`,
        (route) => route.fulfill({ json: retrospective }))

      await page.goto('/progress')
      const tile = page.getByText(messages.progressScreen.window.bestWeekday, { exact: true }).locator('..')
      const value = tile.locator('span').first()
      const weekday = locale === 'en' ? messages.dates.daysValue.wednesday : messages.dates.daysValue.sunday
      await expect(value).toHaveText(weekday)
      await page.evaluate(() => document.fonts.ready)

      const geometry = await value.evaluate((element) => {
        const valueBounds = element.getBoundingClientRect()
        const tileBounds = element.parentElement!.getBoundingClientRect()
        return {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          valueBounds: { left: valueBounds.left, right: valueBounds.right, top: valueBounds.top, bottom: valueBounds.bottom },
          tileBounds: { left: tileBounds.left, right: tileBounds.right, top: tileBounds.top, bottom: tileBounds.bottom },
        }
      })
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
      expect(geometry.valueBounds.left).toBeGreaterThanOrEqual(geometry.tileBounds.left)
      expect(geometry.valueBounds.right).toBeLessThanOrEqual(geometry.tileBounds.right)
      expect(geometry.valueBounds.top).toBeGreaterThanOrEqual(geometry.tileBounds.top)
      expect(geometry.valueBounds.bottom).toBeLessThanOrEqual(geometry.tileBounds.bottom)
    })
  })
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Progress stat values in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'trial' })
    const words = locale === 'pt-BR' ? ptBR : en

    for (const width of [412, 500, 1352, 1440]) {
      test(`keeps all four values at the same size at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
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
        const tiles = windowSection.locator('[data-state="default"]')
        await expect(tiles).toHaveCount(4)
        await expect(tiles.nth(2)).toContainText(words.dates.daysValue.monday)
        await expect(tiles.nth(3)).toContainText('Caminhar')
        await page.evaluate(() => document.fonts.ready)
        const geometry = await tiles.evaluateAll((elements) => elements.map((tile) => {
          const value = tile.firstElementChild!
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
        expect(geometry.map((value) => value.fontSize)).toEqual(['24px', '24px', '24px', '24px'])
        for (const value of geometry) {
          expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth)
          expect(value.inside).toBe(true)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      })
    }
  })
}

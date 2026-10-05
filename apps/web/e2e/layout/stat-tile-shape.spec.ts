import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const streak = streakInfoSchema.parse({
  currentStreak: 7, longestStreak: 21, lastActiveDate: '2026-09-04',
  freezesUsedThisMonth: 1, freezesAvailable: 2, maxFreezesPerMonth: 3,
  isFrozenToday: false, recentFreezeDates: [],
  streakFreezesAccumulated: 2, maxStreakFreezesAccumulated: 3,
  daysUntilNextFreeze: 3, freezesAvailableToUse: 2, canEarnMore: true,
  isRepairAvailable: false, repairableGapDates: [],
})
const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal()], page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
})
const retrospective = retrospectiveResponseSchema.parse({
  period: 'month', metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [100, 0, 0, 0, 0, 0, 0] }),
  narrative: { highlights: '', missed: '', trends: '', suggestion: '' }, fromCache: false,
})

async function tileGeometry(tiles: Locator) {
  return tiles.evaluateAll((elements) => elements.map((tile) => {
    const bounds = tile.getBoundingClientRect()
    const style = getComputedStyle(tile)
    const value = tile.children[0]!.getBoundingClientRect()
    const label = tile.children[1]!.getBoundingClientRect()
    return {
      top: bounds.top, height: bounds.height,
      valueStart: value.left - bounds.left - parseFloat(style.paddingLeft),
      labelStart: label.left - bounds.left - parseFloat(style.paddingLeft),
      gap: label.top - value.bottom,
      expectedHeight: parseFloat(style.paddingTop) + value.height + 8 + label.height + parseFloat(style.paddingBottom),
    }
  }))
}

function expectTileShape(geometry: Awaited<ReturnType<typeof tileGeometry>>) {
  for (const tile of geometry) {
    expect(Math.abs(tile.valueStart)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(tile.labelStart)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(tile.gap - 8)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(tile.height - tile.expectedHeight)).toBeLessThanOrEqual(0.5)
    for (const sibling of geometry.filter((candidate) => Math.abs(candidate.top - tile.top) <= 0.5)) {
      expect(Math.abs(tile.height - sibling.height)).toBeLessThanOrEqual(0.5)
    }
  }
}

for (const locale of ['pt-BR', 'en'] as const) {
  test.describe(`Stat tile shape in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'stripe', layoutProfile: { canViewGamification: true } })
    const words = locale === 'pt-BR' ? ptBR : en

    for (const width of [320, 412, 1280]) {
      test(`keeps streak and window figures at the start edge with stable loading height at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await context.route(`${LAYOUT_ORIGIN}${API.gamification.streak}`, (route) => route.fulfill({ json: streak }))
        await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goals }))
        let releaseWindow = () => {}
        const pendingWindow = new Promise<void>((resolve) => { releaseWindow = resolve })
        await context.route(
          (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.retrospective,
          async (route) => { await pendingWindow; await route.fulfill({ json: retrospective }) },
        )
        try {
          await page.goto('/progress')
          const windowSection = page.getByRole('region', { name: words.progressScreen.sections.window })
          const loadingTiles = windowSection.locator('[data-state="loading"]')
          await expect(loadingTiles).toHaveCount(3)
          await page.evaluate(() => document.fonts.ready)
          const loadingGeometry = await tileGeometry(loadingTiles)
          expectTileShape(loadingGeometry)
          releaseWindow()
          const loadedTiles = windowSection.locator('[data-state="default"]')
          await expect(loadedTiles).toHaveCount(3)
          const loadedGeometry = await tileGeometry(loadedTiles)
          expectTileShape(loadedGeometry)
          loadedGeometry.forEach((tile, index) => {
            expect(Math.abs(tile.height - loadingGeometry[index]!.height)).toBeLessThanOrEqual(0.5)
          })
          const streakSection = page.getByRole('region', { name: words.progressScreen.sections.streak })
          const streakTiles = streakSection.locator('[data-state="default"]')
          await expect(streakTiles).toHaveCount(2)
          expectTileShape(await tileGeometry(streakTiles))
        } finally { releaseWindow() }
      })
    }
  })
}

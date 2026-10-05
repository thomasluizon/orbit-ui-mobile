import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal()], page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
})
const payGate = { error: 'Pro access required', errorCode: 'PAY_GATE' }

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Progress Pro gate in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'free' })
    const words = locale === 'pt-BR' ? ptBR : en

    for (const width of [412, 1280]) {
      test(`shows the locked window on the first response at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goals }))
        const retrospectiveRoute = new RegExp(`${LAYOUT_ORIGIN}${API.habits.retrospective}(?:\\?.*)?$`)
        let requests = 0
        await context.route(retrospectiveRoute, async (route) => {
          requests += 1
          await route.fulfill({ status: 403, json: payGate })
        })
        const firstResponse = page.waitForResponse(retrospectiveRoute).then(() => performance.now())
        await page.goto('/progress', { waitUntil: 'commit' })
        const respondedAt = await firstResponse
        const section = page.getByRole('region', { name: words.progressScreen.sections.window })
        const lockedCard = section.getByTestId('progress-locked-card')
        await expect(lockedCard).toBeVisible({ timeout: Math.max(1, 1000 - (performance.now() - respondedAt)) })
        expect(performance.now() - respondedAt).toBeLessThanOrEqual(1000)
        await expect(lockedCard).toContainText(words.progressScreen.window.lockedTitle)
        await expect(lockedCard.getByRole('link', { name: words.progressScreen.window.lockedAction })).toHaveAttribute('href', '/upgrade')
        await expect(section.getByRole('progressbar')).toHaveCount(0)
        await page.waitForTimeout(8000)
        expect(requests).toBe(1)
      })
    }
  })
}

import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { LAYOUT_ORIGIN } from '../support/env'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

const goals = paginatedGoalResponseSchema.parse({
  items: Array.from({ length: 3 }, (_, index) => createMockGoal({ id: `inset-goal-${index}` })),
  page: 1, pageSize: 100, totalCount: 3, totalPages: 1,
})

async function measureTopInset(content: Locator) {
  return content.evaluate((element) => {
    const card = element.getBoundingClientRect()
    const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
    const scroller = element.closest('[data-shell-scroller]')!.getBoundingClientRect()
    return { column: card.top - column.top, scroller: card.top - scroller.top }
  })
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [412, 1352]) {
    test.describe(`destination top inset in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      const words = locale === 'pt-BR' ? ptBR : en

      test('insets Perfil and preserves Progresso spacing', async ({ page, context }) => {
        await context.route(
          (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
          (route) => route.fulfill({ json: goals }),
        )
        await page.goto('/profile')
        const firstCard = page.getByTestId('profile-settings-group-you').locator('.orbit-row-list')
        await expect(firstCard).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const profileInset = await measureTopInset(firstCard)
        expect(profileInset.column).toBeGreaterThanOrEqual(16)
        expect(profileInset).toEqual({ column: width < 1024 ? 16 : 32, scroller: width < 1024 ? 16 : 0 })

        await page.goto('/progress')
        const streak = page.getByRole('region', { name: words.progressScreen.sections.streak, exact: true })
        await expect(streak).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(await measureTopInset(streak)).toEqual({ column: width < 1024 ? 16 : 48, scroller: 16 })
      })
    })
  }
}

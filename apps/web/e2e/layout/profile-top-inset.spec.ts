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

      test('preserves the Calendário column and pinned header top inset', async ({ page }) => {
        await page.goto('/calendar')
        const header = page.getByTestId('calendar-shell-header')
        await expect(header).toBeVisible()
        const inset = await header.evaluate(element => {
          const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
          const header = element.getBoundingClientRect()
          return { columnTop: column.top, headerTop: header.top, inset: header.top - column.top }
        })
        expect(inset).toEqual({ columnTop: 0, headerTop: width < 1024 ? 0 : 32, inset: width < 1024 ? 0 : 32 })
      })

      test('insets Perfil and preserves Progresso spacing', async ({ page, context }) => {
        await context.route(
          (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
          (route) => route.fulfill({ json: goals }),
        )
        await page.goto('/')
        const todayBell = page.locator('[data-today-header-actions]').getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })
        if (width < 1024) await expect(todayBell).toBeVisible()
        const todayBellBounds = width < 1024 ? await todayBell.boundingBox() : null
        await page.goto('/profile')
        const firstCard = page.getByTestId('profile-settings-group-you').locator('.orbit-row-list')
        await expect(firstCard).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await assertBellRow(page.locator('[data-root-notification-header]'), todayBellBounds?.x, width)
        const profileInset = await measureTopInset(firstCard)
        expect(profileInset.column).toBeGreaterThanOrEqual(16)
        expect(profileInset).toEqual({ column: width < 1024 ? 76 : 32, scroller: width < 1024 ? 76 : 0 })

        await page.goto('/progress')
        const streak = page.getByRole('region', { name: words.progressScreen.sections.streak, exact: true })
        await expect(streak).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await assertBellRow(page.locator('[data-root-notification-header]'), todayBellBounds?.x, width)
        expect(await measureTopInset(streak)).toEqual({ column: width < 1024 ? 96 : 48, scroller: width < 1024 ? 96 : 16 })
      })
    })
  }
}

async function assertBellRow(row: Locator, todayBellX: number | undefined, width: number) {
  if (width >= 1024) {
    await expect(row).toHaveCount(0)
    return
  }
  await expect(row).toBeVisible()
  const bounds = await row.boundingBox()
  expect(bounds!.height).toBe(48)
  const bell = await row.getByRole('button').boundingBox()
  expect(bell!.x).toBe(todayBellX)
  expect(await row.evaluate((element) => Boolean(element.closest('[data-shell-scroller]')))).toBe(true)
}

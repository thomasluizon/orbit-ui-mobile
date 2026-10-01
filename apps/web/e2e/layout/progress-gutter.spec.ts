import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [
    makeHabitScheduleItem({ title: 'Read', children: [], hasSubHabits: false, isOverdue: true }),
    makeHabitScheduleItem({ id: 'habit-2', title: 'Walk', children: [], hasSubHabits: false, isOverdue: true }),
  ],
  totalCount: 2,
})
const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Walk', position: 1 })],
  page: 1, pageSize: 100, totalCount: 2, totalPages: 1,
})

for (const width of [1352, 1100, 840, 412]) {
  for (const panelOpen of [false, true]) {
    for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
      test.describe(`${locale} Progress gutter at ${width}px with conversation open=${panelOpen}`, () => {
        test.use({ viewport: { width, height: 900 } })

        test('aligns streak, headings and cards to Hoje', async ({ page, context }) => {
          await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
          const profile = profileSchema.parse({
            ...profileFixture, language: locale, currentStreak: 4, longestStreak: 9, totalXp: 150,
          })
          await setLayoutProfileSession(context, profile)
          await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
          await context.route(new RegExp(`${API.habits.list}(?:\\?.*)?$`), (route) => route.fulfill({ json: habits }))
          await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goals }))

          const presentation = width >= 1024 ? 'panel' : 'overlay'
          await page.goto('/')
          const todayPanel = page.locator('.habit-panel').first()
          await expect(todayPanel).toBeVisible()
          if (panelOpen) {
            await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()
            await expect(page.locator(`[data-shell-conversation="${presentation}"]`)).toBeVisible()
          }
          const today = await todayPanel.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right }
          })

          await page.goto('/progress')
          const streak = page.getByRole('region', { name: messages.progressScreen.sections.streak, includeHidden: true })
          await expect(streak).toBeVisible()
          if (panelOpen) {
            await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()
            await expect(page.locator(`[data-shell-conversation="${presentation}"]`)).toBeVisible()
          }
          await page.evaluate(() => document.fonts.ready)
          const surfaces = [
            streak,
            page.getByRole('heading', { name: messages.progressScreen.sections.goals, exact: true, includeHidden: true }),
            page.getByRole('heading', { name: messages.progressScreen.sections.window, exact: true, includeHidden: true }),
            page.locator('[data-goal-id]').first(),
          ]
          for (const surface of surfaces) {
            const bounds = await surface.evaluate((element) => {
              const rect = element.getBoundingClientRect()
              return { left: rect.left, right: rect.right }
            })
            expect(bounds.left).toBeCloseTo(today.left, 1)
            expect(bounds.right).toBeCloseTo(today.right, 1)
          }
          const firstTile = page.getByText(messages.progressScreen.streak.longest, { exact: true }).locator('..')
          const tileBounds = await firstTile.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return { left: rect.left, right: rect.right }
          })
          expect(tileBounds.left).toBeCloseTo(today.left, 1)
          expect(tileBounds.right).toBeLessThanOrEqual(today.right)
        })
      })
    }
  }
}

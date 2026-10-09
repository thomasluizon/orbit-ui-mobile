import { expect, test, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const selectedDate = '2026-09-04'
const leaf = habitDetailSchema.parse({ ...makeHabitDetail(), title: 'Ler', children: [] })
const children = [0, 1].map((position) => makeHabitScheduleItem({
  id: `empty-ring-child-${position}`, title: `Child ${position}`, position,
  children: [], hasSubHabits: false, scheduledDates: [selectedDate],
}))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ id: 'empty-ring-parent', title: 'Rotina', children, scheduledDates: [selectedDate] })],
  totalCount: 1,
})
const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal({ id: 'empty-ring-goal', title: 'Ler mais', currentValue: 0, progressPercentage: 0 })],
  page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
})
const metrics = habitMetricsSchema.parse({
  currentStreak: 0, longestStreak: 0, weeklyCompletionRate: 0,
  monthlyCompletionRate: 0, totalCompletions: 0, lastCompletedDate: null,
})

async function expectNoPaintedAccent(ring: Locator) {
  await expect(ring).toBeVisible()
  expect(await ring.evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--primary)'
    element.append(probe)
    const primary = getComputedStyle(probe).color
    probe.remove()
    return Array.from(element.querySelectorAll('circle')).filter((circle) => {
      const style = getComputedStyle(circle)
      if (style.visibility !== 'visible' || style.stroke === 'none' || Number(style.strokeWidth.replace('px', '')) === 0) return false
      for (let ancestor: Element | null = circle; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor)
        if (ancestorStyle.display === 'none' || Number(ancestorStyle.opacity) === 0) return false
      }
      return style.stroke === primary
    }).length
  })).toBe(0)
}

for (const width of [412, 1280]) {
  for (const mode of ['dark', 'light'] as const) {
    test.describe(`empty ring tracks at ${width}px in ${mode}`, () => {
      test.use({ viewport: { width, height: 915 }, colorScheme: mode })

      test.beforeEach(async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', themePreference: mode })
        await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
          (route) => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(leaf.id)}`, (route) => route.fulfill({ json: leaf }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(leaf.id)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(leaf.id)}`, (route) => route.fulfill({ json: metrics }))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
          (route) => route.fulfill({ json: goals }))
        await page.clock.setFixedTime(new Date(`${selectedDate}T12:00:00Z`))
      })

      test('the unlogged leaf header uses the bare empty status ring', async ({ page }) => {
        await page.goto(`/habits/${leaf.id}`)
        const header = page.locator('[data-habit-detail-header-row]')
        await expectNoPaintedAccent(header)
        const ring = header.locator('[data-status="empty"]')
        await expect(ring).toBeVisible()
        await expect(header.locator('[role="progressbar"]')).toHaveCount(0)
        expect(await ring.evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          children: element.childElementCount,
          shadow: getComputedStyle(element).boxShadow,
        }))).toMatchObject({ background: 'rgba(0, 0, 0, 0)', children: 0, shadow: expect.stringContaining('inset') })
      })

      test('Hoje paints only the parent track at zero of two children done', async ({ page }) => {
        await page.goto('/')
        const parent = page.getByTestId('habit-row').filter({ hasText: 'Rotina' })
        const ring = parent.locator('[data-habit-row-control="ring"]')
        await expect(ring).toHaveAttribute('aria-label', /0\/2/)
        await expect(ring.locator('circle')).toHaveCount(2)
        await expectNoPaintedAccent(ring)
      })

      test('Progresso paints only the goal track at zero percent', async ({ page }) => {
        await page.goto('/progress')
        const ring = page.locator('[data-goal-id="empty-ring-goal"]').getByRole('progressbar')
        await expect(ring).toHaveAttribute('aria-valuenow', '0')
        await expect(ring.locator('circle')).toHaveCount(2)
        await expect.poll(async () => Number(await ring.locator('circle').last().getAttribute('stroke-dasharray'))).toBeGreaterThan(0)
        await expectNoPaintedAccent(ring)
        await expect(page.getByRole('heading', { name: ptBr.progressScreen.sections.goals, exact: true })).toBeVisible()
      })
    })
  }
}

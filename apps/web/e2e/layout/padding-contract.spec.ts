import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './layout-test'
import { completeInstallOnboarding } from './install-onboarding'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { openTodayListOptions } from './hydration-guard'

async function padding(surface: Locator) {
  return surface.evaluate((element) => {
    const style = getComputedStyle(element)
    return { inline: Number.parseFloat(style.paddingInlineStart), block: Number.parseFloat(style.paddingBlockStart) }
  })
}

async function gutter(surface: Locator) {
  return surface.evaluate((element) => element.getBoundingClientRect().left
    - document.querySelector('[data-shell-column]')!.getBoundingClientRect().left)
}

for (const width of [412, 840, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test(`shared padding on all four destinations at ${width}px in ${locale}`, async ({ page, context }) => {
      const words = locale === 'en' ? en : ptBR
      const date = '2026-09-04'
      const habits = [0, 1].map((position) => makeHabitScheduleItem({
        id: `padding-habit-${position}`, title: `Habit ${position}`, position,
        children: [], hasSubHabits: false, scheduledDates: [date], dueDate: date,
      }))
      const goal = createMockGoal()
      const profile = profileSchema.parse({ ...profileFixture, language: locale, currentStreak: 4, longestStreak: 9, totalXp: 150 })
      await page.setViewportSize({ width, height: 1800 })
      await completeInstallOnboarding(page)
      await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [
        { path: API.profile.get, body: profile },
        { path: API.habits.list, body: { ...emptyHabitsPageFixture, items: habits, totalCount: habits.length } },
      ])
      await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: {
        items: [goal], page: 1, pageSize: 100, totalCount: 1, totalPages: 1,
      } }))

      await page.goto(`/?date=${date}`)
      await openTodayListOptions(page, words.habits.listOptions)
      await page.getByRole('menu', { name: words.habits.listOptions }).getByRole('menuitem', { name: words.habits.refresh }).click()
      const habit = page.getByTestId('habit-row').first()
      await expect(habit).toHaveAttribute('data-habit-title', habits[0]!.title)
      expect(await gutter(habit)).toBeCloseTo(16, 1)
      await expect(page.locator('[data-today-day-transition]')).toHaveCSS('row-gap', '24px')
      const habitBody = habit.locator('[data-habit-row-body]').first()
      expect(await padding(habitBody)).toEqual({ inline: 8, block: 8 })

      await page.goto('/calendar')
      const daySlot = page.getByTestId('calendar-day-card-slot')
      const dayCard = daySlot.locator('section[data-field-surface="card"]').first()
      await expect(dayCard).toBeVisible()
      expect(await gutter(dayCard)).toBeCloseTo(16, 1)
      expect(await padding(dayCard)).toEqual({ inline: 24, block: 24 })
      expect(await padding(daySlot)).toEqual({ inline: 16, block: 24 })

      await page.goto('/progress')
      const goalCard = page.getByRole('button', { name: new RegExp(goal.title) }).first()
      await expect(goalCard).toBeVisible()
      expect(await gutter(goalCard)).toBeCloseTo(16, 1)
      expect(await padding(goalCard)).toEqual({ inline: 16, block: 16 })
      const achievements = page.getByRole('region', { name: words.progressScreen.sections.achievements })
      await expect(achievements).toHaveCSS('row-gap', '12px')
      await expect(achievements.locator('..')).toHaveCSS('row-gap', '32px')

      await page.goto('/profile')
      const groups = page.getByTestId('profile-settings-groups')
      const firstGroup = page.getByTestId('profile-settings-group-you')
      await expect(firstGroup).toContainText(profile.name)
      expect(await gutter(firstGroup)).toBeCloseTo(16, 1)
      await expect(groups).toHaveCSS('row-gap', '32px')
      await expect(page.getByTestId('profile-settings-group-more')).toHaveCSS('row-gap', '12px')
      const accountBody = firstGroup.locator('[data-slot="list-row-body"]').first()
      expect(await padding(accountBody)).toEqual({ inline: 16, block: 12 })
    })
  }
}

import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'

const habit = habitDetailSchema.parse({ ...makeHabitDetail(), dueTime: '21:00' })
const schedule = makeHabitScheduleItem({ id: habit.id, dueTime: habit.dueTime })
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
const metrics = habitMetricsSchema.parse({
  currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100,
  monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null,
})

for (const width of [412, 1280]) {
  for (const theme of ['dark', 'light'] as const) {
    test.describe(`time picker selection at ${width}px in ${theme}`, () => {
      test.use({ viewport: { width, height: 915 }, colorScheme: theme })

      test('reserves the accent fill for the done action', async ({ page, context }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', themePreference: theme, uses24HourClock: true })
        await setLayoutProfileSession(context, profile)
        await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))

        await page.goto(`/habits/${habit.id}`)
        await page.getByRole('button', { name: messages.habits.detail.moreDetails, exact: true }).click()
        await page.getByRole('button', { name: `${messages.habits.form.exactTime}: ${messages.common.selectTime}`, exact: true }).click()
        const sheet = page.getByRole('dialog', { name: messages.common.selectTime, exact: true })
        await expect(sheet).toBeVisible()
        const hours = sheet.getByRole('radiogroup', { name: messages.common.hours })
        const minutes = sheet.getByRole('radiogroup', { name: messages.common.minutes })
        await expect(hours.getByRole('radio', { name: '21', exact: true })).toHaveAttribute('aria-checked', 'true')
        await expect(minutes.getByRole('radio', { name: '00', exact: true })).toHaveAttribute('aria-checked', 'true')

        const painted = await sheet.evaluate((element) => {
          const resolveColor = (property: 'color' | 'backgroundColor', token: string) => {
            const probe = document.createElement('span')
            probe.style[property] = `var(${token})`
            element.append(probe)
            const resolved = getComputedStyle(probe)[property]
            probe.remove()
            return resolved
          }
          const primary = resolveColor('backgroundColor', '--primary')
          const tint = resolveColor('backgroundColor', '--bg-hover')
          const foreground = resolveColor('color', '--fg-1')
          return {
            primary, tint, foreground,
            selected: Array.from(element.querySelectorAll('[role="radio"][aria-checked="true"]')).map((option) => {
              const style = getComputedStyle(option)
              return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow }
            }),
            filled: Array.from(element.querySelectorAll('*')).filter((child) => getComputedStyle(child).backgroundColor === primary).map((child) => ({
              tag: child.tagName, label: child.textContent.trim(),
            })),
          }
        })
        expect(painted.filled).toEqual([{ tag: 'BUTTON', label: messages.common.done }])
        expect(painted.selected).toHaveLength(2)
        for (const option of painted.selected) {
          expect(option.background).not.toBe(painted.primary)
          expect(option.background).toBe(painted.tint)
          expect(option.color).toBe(painted.foreground)
          expect(option.shadow).toContain(`${painted.primary} 0px 0px 0px 2px inset`)
        }
      })
    })
  }
}

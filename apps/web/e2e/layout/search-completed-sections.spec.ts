import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { expectLabelsFit } from './label-fit-contract'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  totalCount: 2,
  items: [
    makeHabitScheduleItem({ id: 'weekly', title: 'Weekly check coders board', children: [], hasSubHabits: false, searchMatches: [{ field: 'description', value: null }] }),
    makeHabitScheduleItem({ id: 'profile', title: 'Profile linkedin', children: [], hasSubHabits: false, frequencyUnit: null, isCompleted: true, completedOn: '2026-08-04', searchMatches: [{ field: 'description', value: null }] }),
  ],
})

for (const width of [320, 360, 384, 412, 1440]) {
  for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`Completed search sections at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('keeps the section title whole and the completed result openable', async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }, { path: API.habits.list, body: habits }])
        await page.goto('/search')
        const surfaces = [page.locator('#orbit-main')]
        if (width >= 1024) {
          await page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.nav.search }).click()
          surfaces.unshift(page.getByRole('dialog', { name: messages.command.title }))
        }
        for (const surface of surfaces) {
          await surface.getByRole('combobox').fill('coders')
          const section = surface.getByRole('group', { name: messages.charts.bar.completed })
          await expect(section.getByRole('option')).toHaveCount(1)
          await expect(section.getByRole('option')).toContainText('Profile linkedin')
          await expect(section.locator('[data-habit-check][data-status="done"]')).toBeVisible()
          await expect(section.locator('[data-habit-row-meta-token]')).toHaveCount(2)
          const heading = surface.locator('[cmdk-group-heading]').filter({ hasText: messages.charts.bar.completed })
          await heading.evaluate((element) => element.setAttribute('data-layout-label', ''))
          await expectLabelsFit(page, surface)
          const geometry = await heading.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const bounds = element.getBoundingClientRect()
            return { lines: range.getClientRects().length, textWidth: range.getBoundingClientRect().width, width: bounds.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
          })
          expect(geometry.lines).toBe(1)
          expect(geometry.textWidth).toBeLessThanOrEqual(geometry.width)
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
          if (width >= 1024 && surface === surfaces[0]) await surface.getByRole('combobox').press('Escape')
        }
        await page.locator('#orbit-main').getByRole('group', { name: messages.charts.bar.completed }).getByRole('option').click()
        await expect(page).toHaveURL(/\/habits\/profile$/)
      })
    })
  }
}

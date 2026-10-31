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
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  totalCount: 2,
  items: ['first', 'second'].map((id) => makeHabitScheduleItem({
    id, title: `Weekly check coders board ${id}`, children: [], hasSubHabits: false,
    searchMatches: [{ field: 'description', value: null }, { field: 'child', value: 'Anytime coders' }],
  })),
})

for (const width of [412, 840, 1440]) {
  for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`Search result padding at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('contains multiline content inside the active and hovered fills', async ({ page, context }) => {
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
          const rows = surface.getByRole('option')
          await expect(rows).toHaveCount(2)
          await surface.getByRole('combobox').press('Home')
          await expect(rows.first()).toHaveAttribute('aria-selected', 'true')
          await rows.nth(1).hover()
          const geometry = await rows.evaluateAll((elements) => elements.map((element, index) => {
            const bounds = element.getBoundingClientRect()
            const content = [...element.children].map((child) => child.getBoundingClientRect())
            return {
              neighbour: index < elements.length - 1 ? elements[index + 1]!.getBoundingClientRect().top - bounds.bottom : null,
              top: Math.min(...content.map((child) => child.top - bounds.top)),
              bottom: Math.min(...content.map((child) => bounds.bottom - child.bottom)),
              left: Math.min(...content.map((child) => child.left - bounds.left)),
              right: Math.min(...content.map((child) => bounds.right - child.right)),
            }
          }))
          for (const { neighbour, ...insets } of geometry) {
            for (const inset of Object.values(insets)) expect(inset).toBeGreaterThanOrEqual(12)
            if (neighbour !== null) expect(neighbour).toBeGreaterThanOrEqual(8)
          }
          if (width >= 1024 && surface === surfaces[0]) await surface.getByRole('combobox').press('Escape')
        }
      })
    })
  }
}

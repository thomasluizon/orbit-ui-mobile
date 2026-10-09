import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const habitTitle = 'Rotina da casa'
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ title: habitTitle, children: [], hasSubHabits: false, isOverdue: true })],
  totalCount: 1,
})

for (const width of [412, 1280]) {
  for (const [locale, words] of [['pt-BR', pt], ['en', en]] as const) {
    for (const atLimit of [false, true]) {
      test.describe(`empty conversation suggestions in ${locale} at ${width}px, at limit ${atLimit}`, () => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale,
          aiMessagesUsed: atLimit ? profileFixture.aiMessagesLimit : 0 })
        test.use({ appLocale: locale, layoutProfile: profile, viewport: { width, height: 915 } })
        test.beforeEach(async ({ context }) => {
          await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, route => route.fulfill({ json: profile }))
          await context.route(url => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
            route => route.fulfill({ json: habits }))
        })

        test('keeps the empty introduction chip-free and lets the composer own the suggestion set', async ({ page }) => {
          await page.goto('/')
          await page.locator('[data-today-header-actions]').getByRole('button', { name: words.habits.listOptions, exact: true }).click()
          await page.getByRole('menu', { name: words.habits.listOptions, exact: true })
            .getByRole('menuitem', { name: words.habits.refresh, exact: true }).click()
          await expect(page.locator(`[data-habit-title="${habitTitle}"]`)).toBeVisible()
          await page.getByRole('button', { name: width >= 1024 ? words.chat.title : words.todayAstra.openConversation, exact: true }).click()
          const conversation = page.locator('[data-shell-conversation="overlay"]')
          const empty = conversation.getByRole('feed', { name: words.chat.title })
          await expect(empty.getByText(words.chat.empty.title, { exact: true })).toBeVisible()
          await expect(empty.locator('[data-asset="astra-mark"]')).toBeVisible()
          await expect(empty.getByText(words.aiDisclosure.notMedicalAdvice, { exact: true })).toBeVisible()
          await expect(empty.getByRole('button')).toHaveCount(0)
          const strip = conversation.getByRole('group', { name: words.shell.composer.suggestionsLabel, exact: true })
          if (atLimit) {
            await expect(strip).toHaveCount(0)
            await expect(conversation.locator('[data-composer-root]')).toHaveAttribute('data-state', 'atLimit')
          } else {
            await expect(strip).toHaveCount(1)
            await expect(strip.getByRole('button').first()).toBeVisible()
            expect(await strip.getByRole('button').count()).toBeGreaterThanOrEqual(3)
            const stripBounds = await strip.boundingBox()
            const inputBounds = await conversation.getByRole('textbox').boundingBox()
            expect(stripBounds).not.toBeNull()
            expect(inputBounds).not.toBeNull()
            expect(stripBounds!.y + stripBounds!.height).toBeLessThanOrEqual(inputBounds!.y)
          }
        })
      })
    }
  }
}

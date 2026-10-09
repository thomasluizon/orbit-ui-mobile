import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ title: 'Rotina da casa', children: [], hasSubHabits: false, isOverdue: true })],
  totalCount: 1,
})
const VIEWPORTS = [
  { width: 1352, height: 600 },
  { width: 1352, height: 677 },
  { width: 1352, height: 915 },
  { width: 600, height: 677 },
  { width: 320, height: 600 },
]

for (const [locale, messages] of [['en', en], ['pt-BR', pt]] as const) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${locale} empty Astra conversation at ${viewport.width} by ${viewport.height}`, () => {
      test.use({ viewport })

      test('keeps the glyph reachable and the disclosure clear of the composer', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await setLayoutProfileSession(context, profileSchema.parse({ ...profileFixture, language: locale }))
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await page.goto('/')
        await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
        await page.getByRole('menu', { name: messages.habits.listOptions, exact: true })
          .getByRole('menuitem', { name: messages.habits.refresh }).click()
        await expect(page.locator('[data-habit-title="Rotina da casa"]')).toBeVisible()
        await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()
        const presentation = viewport.width >= 1024 ? 'panel' : 'overlay'
        const conversation = page.locator(`[data-shell-conversation="${presentation}"]`)
        await expect(conversation).toBeVisible()
        const scroller = conversation.getByRole('feed', { name: messages.chat.title })
        await expect(scroller.getByText(messages.chat.empty.title, { exact: true })).toBeVisible()
        await expect(scroller.getByRole('button')).toHaveCount(0)
        await expect(conversation.getByRole('group', { name: messages.shell.composer.suggestionsLabel, exact: true })).toHaveCount(1)
        await page.evaluate(() => document.fonts.ready)

        const top = await scroller.evaluate((element) => {
          element.scrollTop = 0
          return {
            scrollerTop: element.getBoundingClientRect().top,
            glyphTop: element.querySelector('[data-asset="astra-mark"]')!.getBoundingClientRect().top,
          }
        })
        expect(top.glyphTop).toBeGreaterThanOrEqual(top.scrollerTop)

        const end = await scroller.evaluate((element, disclosure) => {
          element.scrollTop = element.scrollHeight
          const disclaimer = Array.from(element.querySelectorAll('p')).find((paragraph) => paragraph.textContent === disclosure)!
          return {
            bottom: element.getBoundingClientRect().bottom,
            disclaimerBottom: disclaimer.getBoundingClientRect().bottom,
            padding: parseFloat(getComputedStyle(element).paddingBottom),
          }
        }, messages.aiDisclosure.notMedicalAdvice)
        expect(end.padding).toBe(16)
        expect(end.bottom - end.disclaimerBottom).toBeGreaterThanOrEqual(end.padding - 0.5)
        const composer = await conversation.locator('[data-composer-root]').boundingBox()
        expect(composer).not.toBeNull()
        expect(composer!.y - end.disclaimerBottom).toBeGreaterThanOrEqual(end.padding - 0.5)
      })
    })
  }
}

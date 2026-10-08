import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ title: 'Reading', children: [], hasSubHabits: false, isGeneral: true })],
  totalCount: 1,
})

for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
  for (const width of [320, 412, 600, 840, 1100, 1352]) {
    test.describe(`suggestion content widths in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 },
        layoutProfile: { lastCompletionDate: '2026-09-01' } })

      test('hugs every visible conversation chip and keeps the strip at the gutter', async ({ page, context }) => {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
          (route) => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: habits.totalCount } }))
        await page.goto('/')
        await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
        await page.getByRole('menu', { name: messages.habits.listOptions, exact: true })
          .getByRole('menuitem', { name: messages.habits.refresh }).click()
        await expect(page.locator('[data-habit-title="Reading"]')).toBeVisible()
        await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()
        const conversation = page.locator(`[data-shell-conversation="${width < 1024 ? 'overlay' : 'panel'}"]`)
        await expect(conversation).toBeVisible()
        const strip = conversation.getByRole('group', { name: messages.shell.composer.suggestionsLabel, exact: true })
        await expect(strip).toBeVisible()
        await expect(strip.getByRole('button').first()).toHaveText(messages.shell.composer.chips.today.logLastDays)
        await page.evaluate(() => document.fonts.ready)
        await expect(async () => {
          const measured = await strip.evaluate(element => {
            element.scrollLeft = 0
            const bounds = element.getBoundingClientRect()
            const composer = element.closest('[data-composer-root]')!
            const field = composer.querySelector('[data-composer-input-row]')!.getBoundingClientRect()
            const chips = [...element.querySelectorAll('button')].map(button => {
              const chip = button.getBoundingClientRect()
              const style = getComputedStyle(button)
              return { left: chip.left, right: chip.right, width: chip.width,
                content: button.querySelector('[data-suggestion-content]')!.getBoundingClientRect().width,
                padding: parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) }
            })
            const partial = chips.find(chip => chip.left < bounds.right && chip.right > bounds.right)
            return { right: bounds.right, fieldRight: field.right, overflow: element.scrollWidth > element.clientWidth,
              peek: partial ? bounds.right - partial.left : 0,
              hidden: partial ? partial.right - bounds.right : 0,
              visible: chips.filter(chip => chip.right > bounds.left && chip.left < bounds.right) }
          })
          expect(measured.visible.length).toBeGreaterThan(0)
          expect(Math.abs(measured.right - measured.fieldRight)).toBeLessThanOrEqual(1)
          for (const chip of measured.visible) expect(Math.abs(chip.width - chip.content - chip.padding)).toBeLessThanOrEqual(1)
          if (measured.overflow) {
            expect(measured.peek).toBeGreaterThanOrEqual(16)
            expect(measured.hidden).toBeGreaterThanOrEqual(16)
          }
        }).toPass({ timeout: 5000 })
      })
    })
  }
}

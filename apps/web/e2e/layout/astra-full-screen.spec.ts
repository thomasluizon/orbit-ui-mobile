import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const habit = makeHabitDetail()
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [makeHabitScheduleItem({ id: habit.id, children: [], hasSubHabits: false, isOverdue: true })],
  page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})
const viewports = [
  { width: 1352, height: 706, left: 422 },
  { width: 1440, height: 900, left: 466 },
  { width: 1100, height: 706, left: 296 },
  { width: 840, height: 915, left: 50 },
  { width: 412, height: 915, left: 0 },
]

for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
  for (const viewport of viewports) {
    test.describe(`full-screen Astra in ${locale} at ${viewport.width}`, () => {
      test.use({ appLocale: locale, viewport, layoutProfile: { aiMessagesUsed: 0 } })
      test.beforeEach(async ({ context }) => {
        await context.route(url => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
          route => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, route => route.fulfill({ json: habit }))
      })

      for (const scrolling of [false, true]) {
        test(`fills the column with scrolling=${scrolling}`, async ({ page, context }) => {
          const finalEvent = chatStreamEventSchema.parse({ type: 'final', response: {
            aiMessage: 'Podemos revisar a rotina com calma. '.repeat(120), actions: [],
          } })
          await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({
            contentType: 'text/event-stream', body: `data: ${JSON.stringify(finalEvent)}\n\n`,
          }))
          await page.goto('/')
          const columnLocator = page.locator('[data-shell-column]')
          const column = await columnLocator.boundingBox()
          const topInset = await columnLocator.evaluate(element => parseFloat(getComputedStyle(element).paddingTop))
          expect(column).not.toBeNull()
          const pinned = page.locator('[data-shell-pinned-slot] [data-composer-root]')
          await expect(pinned).toHaveCount(viewport.width < 1024 ? 1 : 0)
          const tabs = viewport.width < 1024 ? await page.locator('[data-shell-tab-bar]').boundingBox() : null
          await page.goto('/?astra=open')
          const conversation = page.locator('[data-shell-conversation="overlay"]')
          await expect(conversation).toBeVisible()
          await expect(page.locator('[data-shell-conversation="panel"]')).toHaveCount(0)
          const feed = conversation.getByRole('feed', { name: words.chat.title, exact: true })
          if (scrolling) {
            await conversation.locator('[data-composer-input]').fill('Como posso revisar a rotina?')
            await conversation.getByRole('button', { name: words.shell.composer.send, exact: true }).click()
            await expect(feed.getByRole('article')).toHaveCount(2)
            await expect(feed).toHaveAttribute('aria-busy', 'false')
            expect(await feed.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
          } else {
            await expect(feed.getByText(words.chat.empty.title, { exact: true })).toBeVisible()
            await expect(feed.getByRole('button')).toHaveCount(0)
          }
          const box = (await conversation.boundingBox())!
          for (const edge of ['x', 'width'] as const) expect(Math.abs(box[edge] - column![edge])).toBeLessThanOrEqual(0.5)
          expect(Math.abs(box.x - viewport.left)).toBeLessThanOrEqual(0.5)
          expect(Math.abs(box.y - (viewport.width >= 1024 ? column!.y + topInset : 0))).toBeLessThanOrEqual(0.5)
          expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(0.5)
          const composer = (await conversation.locator('[data-composer-root]').boundingBox())!
          expect(Math.abs(composer.y + composer.height - box.y - box.height)).toBeLessThanOrEqual(0.5)
          await expect(conversation.getByRole('group', { name: words.shell.composer.suggestionsLabel, exact: true })).toHaveCount(1)
          await expect(page.locator('[data-shell-scroller]')).toBeHidden()
          await expect(page.locator('[data-shell-destination]')).toHaveAttribute('inert')
          if (viewport.width >= 1024) await expect(page.locator('[data-shell-sidebar]')).toBeVisible()
          else {
            expect(tabs).not.toBeNull()
            expect(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('[data-shell-conversation]'),
              { x: tabs!.x + tabs!.width / 2, y: tabs!.y + tabs!.height / 2 })).toBe(true)
          }
          await page.getByRole('button', { name: words.common.closeConversation }).click()
          await expect(page.locator('[data-shell-scroller]')).toBeVisible()
          await page.goto(`/habits/${habit.id}`)
          await expect(page.locator('[data-habit-detail-content]')).toBeVisible()
          await expect(page.locator('[data-shell-pinned-slot] [data-composer-root]')).toHaveCount(1)
        })
      }

      if (viewport.width === 1352) {
        test('keeps its thread and draft while crossing the sidebar boundary', async ({ page, context }) => {
          const finalEvent = chatStreamEventSchema.parse({ type: 'final', response: { aiMessage: 'Podemos revisar a rotina.', actions: [] } })
          await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(finalEvent)}\n\n` }))
          await page.goto('/?astra=open')
          const conversation = page.locator('[data-shell-conversation]')
          const input = conversation.locator('[data-composer-input]')
          await input.fill('Como posso revisar a rotina?')
          await conversation.getByRole('button', { name: words.shell.composer.send, exact: true }).click()
          await expect(conversation.getByRole('article')).toHaveCount(2)
          await input.fill('Retained draft')
          for (const width of [840, 1100]) {
            await page.setViewportSize({ width, height: viewport.height })
            await expect(input).toHaveValue('Retained draft')
            await expect(conversation.getByRole('article')).toHaveCount(2)
            await expect(input).toBeFocused()
          }
        })
      }
    })
  }
}

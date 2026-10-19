import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { profileSchema } from '@orbit/shared/types/profile'
import { formatAPIDate } from '@orbit/shared/utils'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

for (const width of [320, 412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : pt
    test.describe(`Astra in-place blocks at ${width} in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profileSchema.parse({ ...profileFixture, language: locale, plan: 'pro', hasProAccess: true, aiMessagesUsed: 0 }) })
      test('keeps day and calendar targets at the touch floor', async ({ page, context }) => {
        const date = formatAPIDate(new Date())
        const habits = Array.from({ length: 25 }, (_, index) => createMockHabitScheduleItem({ id: `habit-${index}`, title: `Walk with the neighborhood group ${index}`, dueDate: date }))
        const events = calendarEventsResponseSchema.parse([{ id: 'event-one', title: 'Walk with the neighborhood group before the planning meeting', description: null, startDate: date, startTime: '13:00', endTime: '14:00', isRecurring: false, recurrenceRule: null, reminders: [] }])
        await context.route(`${LAYOUT_ORIGIN}${API.habits.list}?*`, route => route.fulfill({ json: { ...emptyHabitsPageFixture, items: habits, totalCount: habits.length } }))
        await context.route(`${LAYOUT_ORIGIN}${API.calendar.events}?*`, route => route.fulfill({ json: events }))
        await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => {
          const event = chatStreamEventSchema.parse({ type: 'final', response: { actions: [], aiMessage: '', parts: [
            { type: 'block', kind: 'daySummary', block: { date, due: 25, done: 0, completionRate: 0, overdueCount: 0, currentStreak: 0, surfaceId: 'today', totalRows: 25, rows: habits.map(habit => ({ id: habit.id, title: habit.title, emoji: null, depth: 0, isBadHabit: false, status: 'today' })) } },
            { type: 'block', kind: 'calendar', block: { events: [{ id: events[0]!.id, title: events[0]!.title, start: `${date}T13:00:00`, end: null, isAllDay: false }], surfaceId: 'calendar' } },
          ] } })
          return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(event)}\n\n` })
        })
        await page.goto('/')
        await page.getByRole('button', { name: width >= 1024 ? messages.chat.title : messages.todayAstra.openConversation, exact: true }).click()
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        await conversation.locator('[data-composer-input]').fill('How is my day and calendar?')
        await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
        const blocks = conversation.getByRole('feed').locator('section[data-state]')
        await expect(blocks).toHaveCount(2)
        await expect(blocks.first()).toHaveAttribute('data-state', 'resting')
        await expect(blocks.last()).toHaveAttribute('data-state', 'resting')
        const targets = blocks.locator('button[aria-label]')
        expect(await targets.count()).toBeGreaterThanOrEqual(41)
        for (const target of await targets.all()) {
          const size = await target.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
          expect(size.width).toBeGreaterThanOrEqual(48)
          expect(size.height).toBeGreaterThanOrEqual(48)
        }
        const overflow = await blocks.evaluateAll(elements => elements.map(element => element.scrollWidth > element.clientWidth + 1))
        expect(overflow).toEqual([false, false])
      })
    })
  }
}

import { settleAnimations } from './settle-animations'
import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { inspectFocusedRing, readOutlineVisibility } from './focus-indicators'

const selectedDate = '2026-09-04'

for (const locale of ['en', 'pt-BR'] as const) {
for (const mode of ['dark', 'light'] as const) {
  test.describe(`Hoje proactive line in ${mode} and ${locale}`, () => {
    test.use({ appLocale: locale, layoutProfile: { themePreference: mode } })

    for (const width of [320, 412, 600, 840, 1024, 1352]) {
      for (const textScale of width === 320 ? [1, 2] : [1]) {
        test(`keeps the fill inset and the focus ring visible at ${width}px with ${textScale} text scale`, async ({ page, context }) => {
          await page.setViewportSize({ width, height: 915 })
          const habits = Array.from({ length: 12 }, (_, position) => makeHabitScheduleItem({
            id: `proactive-line-habit-${position}`, title: `Caminhar pela praça ${position + 1}`, position, children: [], hasSubHabits: false,
            scheduledDates: [selectedDate],
          }))
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: { ...emptyHabitsPageFixture, items: habits, totalCount: habits.length } }])
          await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: habits.length } }))
          const proactive = createMockNotification({
            url: '/chat', body: 'Sua rotina mudou. Vamos conversar?', createdAtUtc: `${selectedDate}T12:00:00Z`,
          })
          await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notificationsResponseSchema.parse({ items: [proactive], unreadCount: 1 }) }])
          await page.goto('/')
          const line = page.locator('.today-astra-line')
          await expect(line).toBeVisible()
          await expect(page.locator('.today-astra-sentence')).toHaveText(proactive.body)
          await expect(page.getByTestId('habit-row')).toHaveCount(habits.length)
          await page.evaluate(async (scale) => {
            document.documentElement.style.fontSize = `${16 * scale}px`
            const sentence = document.querySelector<HTMLElement>('.today-astra-sentence')!
            sentence.style.fontSize = `${Number.parseFloat(getComputedStyle(sentence).fontSize) * scale}px`
            await document.fonts.ready
          }, textScale)
          await page.evaluate(settleAnimations, undefined)
          await line.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
          await expect(line).toBeFocused()
          const focus = await inspectFocusedRing(page)
          expect(focus?.focusVisible).toBe(true)
          expect(focus?.indicators).toHaveLength(1)
          expect(await readOutlineVisibility(line)).toMatchObject({ visible: true, clippedBy: [] })

          await page.evaluate(settleAnimations, undefined)
          const geometry = await line.evaluate((element) => {
            const scroller = element.closest<HTMLElement>('[data-shell-scroller]')!
            const scrollerBounds = scroller.getBoundingClientRect()
            const left = scrollerBounds.left + scroller.clientLeft
            const top = scrollerBounds.top + scroller.clientTop
            const bounds = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            const extent = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
            const sentence = element.querySelector<HTMLElement>('.today-astra-sentence')!
            const sentenceBounds = sentence.getBoundingClientRect()
            const dateRow = document.querySelector('[data-today-date-row]')!
            const date = dateRow.querySelector('[title] p')!
            const title = document.querySelector('[data-habit-row-heading] > div > span, [data-habit-row-body] > div > span')!
            return {
              client: { left, right: left + scroller.clientWidth, top, bottom: top + scroller.clientHeight },
              line: { left: bounds.left, right: bounds.right, height: bounds.height },
              outline: { left: bounds.left - extent, right: bounds.right + extent,
                top: bounds.top - extent, bottom: bounds.bottom + extent },
              lineToDate: dateRow.getBoundingClientRect().top - bounds.bottom,
              sentenceLeft: sentenceBounds.left, dateLeft: date.getBoundingClientRect().left,
              titleLeft: title.getBoundingClientRect().left,
              sentenceHeight: sentenceBounds.height,
              lineHeight: Number.parseFloat(getComputedStyle(sentence).lineHeight),
            }
          })
          expect(geometry.lineToDate).toBeCloseTo(24 * textScale, 1)
          expect.soft(geometry.line.left - geometry.client.left).toBeCloseTo(16, 1)
          expect.soft(geometry.client.right - geometry.line.right).toBeCloseTo(16, 1)
          expect.soft(geometry.outline.left).toBeGreaterThanOrEqual(geometry.client.left)
          expect.soft(geometry.outline.right).toBeLessThanOrEqual(geometry.client.right)
          expect.soft(geometry.outline.top).toBeGreaterThanOrEqual(geometry.client.top)
          expect.soft(geometry.outline.bottom).toBeLessThanOrEqual(geometry.client.bottom)
          expect(Math.abs(geometry.sentenceLeft - geometry.dateLeft)).toBeLessThanOrEqual(1)
          expect(Math.abs(geometry.sentenceLeft - geometry.titleLeft)).toBeLessThanOrEqual(1)
          expect(geometry.line.height).toBeGreaterThanOrEqual(48)
          expect(geometry.sentenceHeight).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1)
        })
      }
    }
  })
}
}

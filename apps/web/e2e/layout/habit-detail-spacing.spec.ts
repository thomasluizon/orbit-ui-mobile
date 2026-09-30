import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

const habitId = 'habit-1'
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

for (const width of [412, 1280]) {
  test.describe(`habit detail spacing at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const { hasTags, hasDescription } of [
      { hasTags: false, hasDescription: false },
      { hasTags: true, hasDescription: false },
      { hasTags: false, hasDescription: true },
      { hasTags: true, hasDescription: true },
    ]) {
      test(`uses the drawn gaps with tags ${hasTags} and description ${hasDescription}`, async ({ page, context }) => {
        const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title: 'Beber água', dueTime: '08:00:00', description: hasDescription ? 'Uma pausa para cuidar da rotina.' : null })
        const schedule = makeHabitScheduleItem({ id: habitId, title: habit.title, dueTime: habit.dueTime, description: habit.description, tags: hasTags ? makeHabitScheduleItem().tags : [] })
        const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
        await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) =>
          route.fulfill({ json: profileSchema.parse({ ...profileFixture, language: 'pt-BR' }) }))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))

        await page.goto(`/habits/${habitId}`)
        const column = page.locator('[data-habit-detail-content]')
        await expect(column.locator('.habit-detail-strip > p').first()).toHaveText(ptBr.habits.detail.lastThirtyDays)
        await expect(column.locator('[data-habit-detail-tags]')).toHaveCount(hasTags ? 1 : 0)
        await expect(column.locator('[data-habit-detail-description]')).toHaveCount(hasDescription ? 1 : 0)
        await page.evaluate(() => document.fonts.ready)
        const geometry = await column.evaluate((element) => {
          const header = element.querySelector('header')!
          const well = header.querySelector('button[aria-haspopup="dialog"]')!
          const strip = element.querySelector('.habit-detail-strip')!
          const label = strip.querySelector('p')!
          const headerSlot = Array.from(element.children).find((child) => child.contains(header))!
          const slots = Array.from(element.children)
          const between = slots.slice(slots.indexOf(headerSlot) + 1, slots.indexOf(strip))
          const metadata = Array.from(header.querySelectorAll('[data-habit-detail-tags], [data-habit-detail-description]'))
          let previousBottom = well.getBoundingClientRect().bottom
          const metadataGaps = metadata.map((block) => {
            const content = block.firstElementChild!
            const gap = content.getBoundingClientRect().top - previousBottom
            previousBottom = content.getBoundingClientRect().bottom
            return gap
          })
          return {
            headerToLabel: label.getBoundingClientRect().top - well.getBoundingClientRect().bottom,
            contentToLabel: label.getBoundingClientRect().top - previousBottom,
            metadataGaps,
            zeroHeightSlots: between.filter((child) => child.getBoundingClientRect().height === 0).length,
            interveningSlots: between.length,
            emptyLiveRegion: headerSlot.querySelector('[role="status"][aria-live="polite"]')?.textContent === '',
          }
        })
        if (!hasTags && !hasDescription) expect(geometry.headerToLabel).toBe(24)
        expect(geometry.contentToLabel).toBe(24)
        expect(geometry.metadataGaps).toEqual(Array(Number(hasTags) + Number(hasDescription)).fill(12))
        expect(geometry.zeroHeightSlots).toBe(0)
        expect(geometry.interveningSlots).toBe(0)
        expect(geometry.emptyLiveRegion).toBe(true)
      })
    }
  })
}

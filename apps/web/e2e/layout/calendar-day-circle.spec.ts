import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const today = '2026-09-11'
const scheduledDates = ['2026-09-08', '2026-09-09', '2026-09-10', today]
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: ['walk', 'read'].map((id) => makeHabitScheduleItem({ id, children: [], hasSubHabits: false, dueDate: scheduledDates[0], scheduledDates })),
  logs: {
    walk: ['2026-09-09', '2026-09-10', today].map((date) => ({ id: `walk-${date}`, date, value: 1, createdAtUtc: `${date}T12:00:00Z` })),
    read: ['2026-09-09', today].map((date) => ({ id: `read-${date}`, date, value: 1, createdAtUtc: `${date}T12:00:00Z` })),
  },
})

async function expectCircle(slot: Locator, status = true, todayRing = false, target = false) {
  const geometry = await slot.evaluate((slot) => {
    const bounds = slot.getBoundingClientRect()
    const probe = document.createElement('span')
    probe.style.color = 'var(--primary)'
    document.body.append(probe)
    const primary = getComputedStyle(probe).color
    probe.remove()
    const boxes = [slot, ...slot.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
      const bounds = element.getBoundingClientRect()
      return [null, '::before', '::after'].flatMap((pseudo) => {
        const style = getComputedStyle(element, pseudo)
        if (pseudo && (style.content === 'none' || style.content === 'normal')) return []
        const background = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
        const border = ['Top', 'Right', 'Bottom', 'Left'].some((edge) => Number.parseFloat(style.getPropertyValue(`border-${edge.toLowerCase()}-width`)) > 0)
        if (!background && style.boxShadow === 'none' && !border && style.outlineStyle === 'none') return []
        const width = pseudo ? Number.parseFloat(style.width) : bounds.width
        const height = pseudo ? Number.parseFloat(style.height) : bounds.height
        const left = pseudo ? bounds.left + Number.parseFloat(style.left) : bounds.left
        const top = pseudo ? bounds.top + Number.parseFloat(style.top) : bounds.top
        return [{ width, height, radius: Number.parseFloat(style.borderRadius), centerX: left + width / 2, centerY: top + height / 2,
          primaryRing: (style.boxShadow.includes(primary) && style.boxShadow.includes('2px')) || (style.outlineColor === primary && style.outlineWidth === '2px'),
          ring: style.boxShadow, background: style.backgroundColor }]
      })
    })
    const disc = slot.querySelector('[data-day-disc]')?.getBoundingClientRect()
    const button = slot.querySelector('button')
    return { boxes, centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2,
      slotWidth: bounds.width, disc: disc && { width: disc.width, height: disc.height, centerX: disc.left + disc.width / 2, centerY: disc.top + disc.height / 2 },
      target: button && { width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height },
      hits: button && [bounds.left + 2, bounds.right - 2].map((x) => button.contains(document.elementFromPoint(x, bounds.top + bounds.height / 2))) }
  })
  expect(geometry.boxes.length).toBeGreaterThan(0)
  for (const box of geometry.boxes) {
    expect(Math.abs(box.width - box.height), JSON.stringify(box)).toBeLessThanOrEqual(0.5)
    expect(box.width).toBeLessThanOrEqual(44.5)
    expect(box.radius).toBeGreaterThanOrEqual(box.width / 2)
    expect(Math.abs(box.centerX - geometry.centerX)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(box.centerY - geometry.centerY)).toBeLessThanOrEqual(0.5)
  }
  if (status) {
    expect(geometry.disc).toBeDefined()
    expect(geometry.disc!.width).toBeCloseTo(34, 1)
    expect(geometry.disc!.height).toBeCloseTo(34, 1)
    expect(Math.abs(geometry.disc!.centerX - geometry.centerX)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(geometry.disc!.centerY - geometry.centerY)).toBeLessThanOrEqual(0.5)
  }
  if (todayRing) expect(geometry.boxes.filter((box) => box.primaryRing)).toHaveLength(1)
  if (target) {
    expect(geometry.target!.width).toBeCloseTo(geometry.slotWidth, 1)
    expect(geometry.target!.height).toBeGreaterThanOrEqual(44)
    expect(geometry.hits).toEqual([true, true])
  }
}

async function expectHeaderGap(grid: Locator) {
  const gap = await grid.evaluate((grid) => {
    const header = grid.parentElement!.querySelector('[data-testid="month-grid-header"]')!.getBoundingClientRect()
    return grid.getBoundingClientRect().top - header.bottom
  })
  expect(gap).toBeCloseTo(8, 1)
}

for (const width of [320, 412, 600, 1352]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} calendar day circle at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { timeZone: 'UTC', weekStartDay: 1 } })
      test('keeps month, period and habit history paint inside their circles', async ({ page, context }) => {
        await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, (route) => route.fulfill({ json: calendarMonth }))
        await page.goto('/calendar')
        const grid = page.locator('.orbit-calendar-grid-card [data-testid="month-grid-days"]')
        const current = grid.locator(`[data-calendar-date="${today}"]`)
        await expect(current.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
        await expectHeaderGap(grid)
        for (const date of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', today]) await expectCircle(grid.locator(`[data-calendar-date="${date}"]`), true, date === today, true)
        const partial = grid.locator('[data-calendar-date="2026-09-10"]')
        await partial.getByRole('button').click()
        await expect(partial.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
        await expectCircle(partial, true, true, true)
        await expectCircle(current, true, true, true)
        await partial.getByRole('button').hover()
        await expect.poll(() => partial.locator('[data-day-circle] > [data-press-fill]').evaluate((fill) => getComputedStyle(fill).opacity)).toBe('1')
        await expectCircle(partial, true, true, true)
        await page.keyboard.press('Tab')
        await partial.getByRole('button').focus()
        await expectCircle(partial, true, true, true)
        await page.getByTestId('calendar-header-group').getByRole('radio', { name: words.calendar.view.range, exact: true }).click()
        const periodToday = grid.locator('[data-outcome][aria-current="date"]')
        await expect(periodToday).toBeVisible()
        await expectCircle(periodToday, true, true)
        await expectHeaderGap(grid)

        const habitId = 'walk'
        const habit = habitDetailSchema.parse({ ...makeHabitDetail(), id: habitId, createdAtUtc: '2026-08-01T12:00:00Z' })
        const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [makeHabitScheduleItem({ id: habitId, children: [], hasSubHabits: false })], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
        const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: today })
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: calendarMonth.logs.walk }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))
        await page.goto(`/habits/${habitId}`)
        const history = page.getByTestId('month-grid-days')
        const historyToday = history.locator('[data-outcome][aria-current="date"]')
        await expect(historyToday).toBeVisible()
        await expectCircle(historyToday, true, true)
        await expectHeaderGap(history)
      })

      for (const view of ['month', 'range'] as const) {
        test(`keeps ${view} loading circles in their loaded positions`, async ({ page, context }) => {
          let release!: () => void
          const ready = new Promise<void>((resolve) => { release = resolve })
          await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`))
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, async (route) => { await ready; await route.fulfill({ json: calendarMonth }) })
          try {
            await page.goto('/calendar')
            await page.getByTestId('calendar-header-group').getByRole('radio', { name: words.calendar.view[view], exact: true }).click()
            const grid = page.locator('.orbit-calendar-grid-card [data-testid="month-grid-days"]')
            const placeholders = grid.locator('[data-variant="grid"]')
            await expect(placeholders.first()).toBeVisible()
            await expectHeaderGap(grid)
            for (const placeholder of await placeholders.all()) await expectCircle(placeholder, false)
            const before = await grid.evaluate((grid) => [...grid.children].map((slot) => {
              const box = slot.querySelector('[data-variant="grid"] span')!.getBoundingClientRect()
              return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }
            }))
            release()
            await expect(placeholders).toHaveCount(0)
            const after = await grid.evaluate((grid) => [...grid.children].flatMap((slot, index) => {
              const box = slot.querySelector('[data-day-circle]')?.getBoundingClientRect()
              return box ? [{ index, x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }] : []
            }))
            expect(after.length).toBeGreaterThanOrEqual(14)
            for (const box of after) for (const dimension of ['x', 'y', 'width', 'height'] as const) expect(box[dimension]).toBeCloseTo(before[box.index]![dimension], 1)
          } finally { release() }
        })
      }
    })
  }
}

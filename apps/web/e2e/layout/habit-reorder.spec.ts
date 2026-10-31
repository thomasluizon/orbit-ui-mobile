import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { reorderHabitsRequestSchema } from '@orbit/shared/types/habit'
import { z } from 'zod'
import { applyReorderPositions } from '../../lib/habit-mutation-helpers'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { test } from './layout-test'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { openTodayListOptions } from './hydration-guard'

function observeReorderRows(elements: Element[]) {
  return new Promise<string[]>((resolve) => {
    const failures = new Set<string>()
    const started = performance.now()
    const sample = () => {
      try {
        const list = elements[0]!.closest('[data-habit-list]')!
        const rows = Array.from(list.querySelectorAll('[data-testid="habit-row"]'))
        if (rows.length !== elements.length) failures.add('Rows disappeared while reordering')
        const slots = rows.map((row) => {
          const bounds = row.getBoundingClientRect()
          const sortable = row.parentElement!.parentElement!
          const transform = new DOMMatrixReadOnly(getComputedStyle(sortable).transform)
          const title = row.getAttribute('data-habit-title')!
          let top = bounds.top
          let bottom = bounds.bottom
          for (let ancestor: Element | null = row; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor)
            if (style.opacity !== '1' || style.visibility === 'hidden' || style.display === 'none') failures.add(`${title}: hidden`)
            if (['hidden', 'clip'].includes(style.overflowY)) {
              const clip = ancestor.getBoundingClientRect()
              top = Math.max(top, clip.top)
              bottom = Math.min(bottom, clip.bottom)
            }
            if (ancestor === list) break
          }
          if (bottom - top < 1) failures.add(`${title}: clipped`)
          const scroller = row.closest<HTMLElement>('[data-shell-scroller]')!
          const contentTop = bounds.top - scroller.getBoundingClientRect().top + scroller.scrollTop
          if (contentTop + bounds.height < 0 || contentTop > scroller.scrollHeight) failures.add(`${title}: unreachable`)
          return { top: bounds.top - transform.m42, bottom: bounds.bottom - transform.m42 }
        })
        for (let index = 1; index < slots.length; index++) {
          if (slots[index]!.top - slots[index - 1]!.bottom > 13) failures.add('Row slots exceed the shared gap')
        }
        if (performance.now() - started >= 750) resolve([...failures])
        else requestAnimationFrame(sample)
      } catch (cause) {
        failures.add(`Reorder sampler failed: ${cause instanceof Error ? cause.message : String(cause)}`)
        resolve([...failures])
      }
    }
    requestAnimationFrame(sample)
  })
}

for (const width of [320, 360, 384, 412, 600, 768, 1280]) for (const mode of ['light', 'dark'] as const) {
  test(`Hoje reorder keeps visible rows and contiguous slots at ${width}px in ${mode}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 915 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const date = '2026-09-04'
    const child = makeHabitScheduleItem({ id: 'child', title: 'Child', children: [], hasSubHabits: false, scheduledDates: [date] })
    const items = Array.from({ length: 5 }, (_, position) => makeHabitScheduleItem({
      id: `root-${position}`, title: `Habit ${position}`, position, dueDate: date, scheduledDates: [date],
      children: position === 0 ? [child] : [], hasSubHabits: position === 0,
    }))
    const order = [0, 2, 3, 1, 4]
    const reordered = applyReorderPositions(items, order.map((index, position) => ({ habitId: `root-${index}`, position })))
    const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'en', timeZone: 'UTC' })
    await setLayoutProfileSession(context, profile)
    const token = await setLayoutFixtureSession(context, [
      { path: API.profile.get, body: profile },
      { path: API.habits.count, body: { count: 6 } },
      { path: API.habits.list, body: { ...emptyHabitsPageFixture, items, totalCount: 5 },
        afterMutation: { method: 'PUT', path: API.habits.reorder, body: { ...emptyHabitsPageFixture, items: reordered, totalCount: 5 } } },
    ])
    await page.goto('/')
    const rows = page.getByTestId('habit-row')
    await expect(rows).toHaveCount(6)
    await page.evaluate(() => document.fonts.ready)
    await openTodayListOptions(page, 'List options')
    await expect(page.getByRole('menuitem', { name: 'Refresh', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(page.getByTestId('today-refetch-motion')).toHaveCSS('opacity', '1')
    const source = page.locator('[data-habit-title="Habit 1"]')
    const start = await source.locator('[data-habit-row-body]').boundingBox()
    const target = await page.locator('[data-habit-title="Habit 3"]').boundingBox()
    if (!start || !target) throw new Error('Missing reorder rows')
    await page.mouse.move(start.x + 12, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + 12, start.y + start.height / 2 + 8)
    const observations = rows.evaluateAll(observeReorderRows)
    await page.mouse.move(start.x + 12, target.y + target.height / 2, { steps: 20 })
    await page.mouse.up()
    expect(await observations).toEqual([])
    const expected = ['Habit 0', 'Child', 'Habit 2', 'Habit 3', 'Habit 1', 'Habit 4']
    await expect.poll(() => rows.evaluateAll((elements) => elements.map((row) => row.getAttribute('data-habit-title')))).toEqual(expected)
    const journal = await fetch('http://127.0.0.1:5099/_test/habit-mutations', { headers: { Authorization: `Bearer ${token}` } })
    expect(journal.status).toBe(200)
    const requests = z.array(z.object({ method: z.string(), path: z.string(), body: z.unknown() })).parse(await journal.json())
      .filter((request) => request.method === 'PUT' && request.path === API.habits.reorder)
    expect(requests).toHaveLength(1)
    expect(reorderHabitsRequestSchema.parse(requests[0]!.body).positions).toEqual(order.map((index, position) => ({ habitId: `root-${index}`, position })))
    await expect.poll(() => rows.evaluateAll((elements) => elements.every((row, index) => index === 0 || row.getBoundingClientRect().top - elements[index - 1]!.getBoundingClientRect().bottom <= 13))).toBe(true)
    await page.reload()
    await expect.poll(() => rows.evaluateAll((elements) => elements.map((row) => row.getAttribute('data-habit-title')))).toEqual(expected)
    await expect.poll(() => rows.evaluateAll((elements) => elements.every((row, index) => index === 0 || row.getBoundingClientRect().top - elements[index - 1]!.getBoundingClientRect().bottom <= 13))).toBe(true)
  })
}

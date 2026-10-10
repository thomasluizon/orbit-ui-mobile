import { setLayoutFixtureSession } from './profile-session'
import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './layout-test'
import { readExpandedControlGeometry } from './expanded-control-geometry'
import { API } from '@orbit/shared/api'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { readFieldIndicators, readOutlineVisibility } from './focus-indicators'

const habitId = 'habit-1'
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title: 'Beber água', dueTime: '08:00:00', description: null, children: [] })
const schedule = makeHabitScheduleItem({ id: habitId, title: habit.title, dueTime: habit.dueTime, description: null, tags: [] })
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

async function finishAnimations(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (const animation of document.getAnimations()) animation.finish()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

async function expectClearTitleIndicator(page: Page, heading: Locator, target: Locator) {
  await finishAnimations(page)
  await expect(target).toBeFocused()
  expect(await target.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  expect(await readFieldIndicators(heading, 'h1', { includeDescendants: true })).toHaveLength(1)
  expect(await readOutlineVisibility(target, '::before')).toMatchObject({ width: 2, visible: true, clippedBy: [] })
  const hit = await target.evaluate(readExpandedControlGeometry)
  expect(hit.edgeHits).toEqual([true, true, true, true])
  const clearance = await target.evaluate((element, bounds) => {
    const heading = element.closest('h1')!
    const summary = heading.nextElementSibling!.getBoundingClientRect()
    const style = getComputedStyle(element, '::before')
    const offset = Number.parseFloat(style.outlineOffset)
    const outerEdge = offset + Number.parseFloat(style.outlineWidth)
    const range = document.createRange()
    range.selectNodeContents(heading.querySelector('button')!)
    const text = range.getBoundingClientRect()
    return {
      glyphGap: Math.min(text.left - bounds.left + offset, bounds.right + offset - text.right, text.top - bounds.top + offset, bounds.bottom + offset - text.bottom),
      summaryGap: summary.top - bounds.bottom - outerEdge,
    }
  }, hit)
  expect(clearance.glyphGap).toBeGreaterThanOrEqual(2)
  expect(clearance.summaryGap).toBeGreaterThanOrEqual(0)
}

for (const width of [412, 1100]) {
  test.describe(`habit title focus at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test.beforeEach(async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language: 'pt-BR' }) }])
      await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
      await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))
      await page.goto(`/habits/${habitId}`)
      await expect(page.locator('[data-habit-detail-content] h1 > button')).toHaveText(habit.title)
      await finishAnimations(page)
    })

    test('leaves both title targets unfocused and without an indicator on direct load', async ({ page }) => {
      const heading = page.getByRole('heading', { level: 1, name: habit.title })
      const button = heading.getByRole('button')
      for (const target of [heading, button]) {
        await expect(target).not.toBeFocused()
        const styles = await target.evaluate((element) => {
          const style = getComputedStyle(element)
          return { outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0, shadow: style.boxShadow }
        })
        expect(styles).toEqual({ outline: false, shadow: 'none' })
      }
      expect(await readFieldIndicators(heading, 'h1', { includeDescendants: true })).toEqual([])
    })

    test('aligns the title glyphs with the summary and controls and retains the base height', async ({ page }) => {
      const heading = page.getByRole('heading', { level: 1, name: habit.title })
      const hit = await heading.getByRole('button').evaluate(readExpandedControlGeometry)
      expect(hit.edgeHits).toEqual([true, true, true, true])
      const geometry = await heading.evaluate((heading, hit) => {
        const button = heading.querySelector('button')!
        const summary = heading.nextElementSibling!
        const row = heading.closest('[data-habit-detail-header-row]')!
        const controls = row.firstElementChild!
        const range = document.createRange()
        range.selectNodeContents(button)
        const text = range.getBoundingClientRect()
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
        const lineTops = new Set<number>()
        while (walker.nextNode()) {
          range.selectNodeContents(walker.currentNode)
          for (const rect of range.getClientRects()) if (rect.width > 0) lineTops.add(Math.round(rect.top))
        }
        const lines = lineTops.size
        range.selectNodeContents(summary)
        const summaryText = range.getBoundingClientRect()
        const lineHeight = Number.parseFloat(getComputedStyle(button).lineHeight)
        return {
          titleX: text.left,
          summaryX: summaryText.left,
          controlsX: controls.getBoundingClientRect().left,
          hitHeight: hit.height,
          rowHeight: row.getBoundingClientRect().height,
          baseHeight: controls.getBoundingClientRect().height + 12 + Math.max(48, lines * lineHeight + 16) - 16 + 4 + summary.getBoundingClientRect().height,
        }
      }, hit)
      expect(Math.abs(geometry.titleX - geometry.summaryX)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.titleX - geometry.controlsX)).toBeLessThanOrEqual(1)
      expect(geometry.hitHeight).toBeGreaterThanOrEqual(48)
      expect(geometry.rowHeight).toBeCloseTo(geometry.baseHeight, 1)
    })

    test('draws one clear indicator after Tab from the controls and none after heading focus', async ({ page }) => {
      const heading = page.getByRole('heading', { level: 1, name: habit.title })
      const button = heading.getByRole('button')
      await page.locator('[data-habit-detail-header-row] > div').first().getByRole('button').last().focus()
      await page.keyboard.press('Tab')
      await expectClearTitleIndicator(page, heading, button)
      await heading.focus()
      await finishAnimations(page)
      await expect(heading).toBeFocused()
      await expect(heading).toHaveCSS('outline-style', 'none')
      expect(await readFieldIndicators(heading, 'h1', { includeDescendants: true })).toEqual([])
    })
  })
}

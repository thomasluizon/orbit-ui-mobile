import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'
import { clickWhenHydrated, fillWhenHydrated } from './hydration-guard'

const query = 'indinero'
const habits = { ...emptyHabitsPageFixture, totalCount: 1, items: [makeHabitScheduleItem({ id: 'walk', title: 'Walk', children: [], hasSubHabits: false })] }
const noMatches = { ...emptyHabitsPageFixture, totalCount: 0, items: [] }

async function measureEmptyState(page: Page, column: Locator, actionName: string) {
  await expect(column.getByRole('button', { name: actionName, exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  return column.evaluate((element, name) => {
    const box = (target: Element) => {
      const bounds = target.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
    }
    const button = element.querySelector(`button[aria-label="${name}"]`)!
    const [title, body] = [...element.querySelectorAll(':scope > p')]
    return {
      title: box(title!),
      body: box(body!),
      paint: box(button),
      glyph: box(button.querySelector('svg')!),
      hitExtension: Number.parseFloat(getComputedStyle(button, '::after').left),
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  }, actionName)
}

function expectStartEdgeAction(geometry: Awaited<ReturnType<typeof measureEmptyState>>) {
  const detail = JSON.stringify(geometry)
  const centre = (box: typeof geometry.paint) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 })
  expect(geometry.documentWidth, detail).toBe(geometry.viewportWidth)
  expect(geometry.paint.right - geometry.paint.left, detail).toBe(44)
  expect(geometry.paint.right - geometry.paint.left - 2 * geometry.hitExtension, detail).toBe(48)
  expect(Math.abs(centre(geometry.glyph).x - centre(geometry.paint).x), detail).toBeLessThanOrEqual(0.5)
  expect(Math.abs(centre(geometry.glyph).y - centre(geometry.paint).y), detail).toBeLessThanOrEqual(0.5)
  expect(Math.abs(geometry.body.left - geometry.title.left), detail).toBeLessThanOrEqual(0.5)
  expect(Math.abs(geometry.glyph.left - geometry.title.left), detail).toBeLessThanOrEqual(0.5)
}

for (const width of [412, 1280]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBr]] as const) {
    test.describe(`habit search empty state icon action at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('starts the Hoje clear glyph on the empty text column', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [
          { path: API.habits.list, body: habits },
          { path: API.habits.list, query: { search: query }, body: noMatches },
          { path: API.habits.count, body: { count: 1 } },
        ])
        await page.goto('/')
        await clickWhenHydrated(page.getByRole('button', { name: words.habits.search.title, exact: true }))
        const field = page.getByRole('textbox', { name: words.habits.search.question, exact: true })
        await expect(field).toBeFocused()
        await field.fill(query)
        const column = page.getByText(words.habits.search.emptyBody, { exact: true }).locator('..')
        expectStartEdgeAction(await measureEmptyState(page, column, words.common.clear))
      })

      test('starts the search page create glyph on the empty text column', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [
          { path: API.habits.list, body: habits },
          { path: API.habits.list, query: { search: query }, body: noMatches },
        ])
        await page.goto('/search')
        await fillWhenHydrated(page.locator('#orbit-main').getByRole('combobox', { name: words.habits.search.question }), query)
        const column = page.locator('#orbit-main').getByText(words.habits.search.emptyBody, { exact: true }).locator('..')
        expectStartEdgeAction(await measureEmptyState(page, column, words.habits.search.create))
      })
    })
  }
}

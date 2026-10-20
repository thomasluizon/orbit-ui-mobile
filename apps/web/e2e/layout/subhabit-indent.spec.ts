import { expect, type Page } from '@playwright/test'
import { test } from './layout-test'
import { setLayoutFixtureSession } from './profile-session'
import { openTodayListOptions } from './hydration-guard'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'

const date = '2026-09-04'
const child = { ...makeHabitScheduleItem().children[0]!, title: 'Leaf child', dueDate: date, scheduledDates: [date] }
const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Parent', dueDate: date, scheduledDates: [date], tags: [],
  children: [child, { ...child, id: 'branch', title: 'Branch child', hasSubHabits: true,
    children: [{ ...child, id: 'grandchild', title: 'Deeper child' }] }],
}))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})


async function assertChildIndentation(page: Page, width: number) {
  const rows = await page.locator('[data-testid="habit-row"]:visible').evaluateAll((elements) => elements.map((row) => {
    const bounds = row.getBoundingClientRect()
    const well = Array.from(row.querySelectorAll('span')).find((element) => {
      const style = getComputedStyle(element)
      return ['32px', '46px'].includes(style.width) && style.borderRadius === '12px'
    })!
    return { depth: Number(row.getAttribute('data-depth')), left: bounds.left, right: bounds.right,
      well: well.getBoundingClientRect().left, overflow: row.scrollWidth - row.clientWidth,
      targets: Array.from(row.querySelectorAll('[data-habit-row-control]')).map((control) => {
        const rect = control.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }
      }) }
  }))
  const root = rows.find((row) => row.depth === 0)!
  expect(rows.filter((row) => row.depth === 1).length).toBeGreaterThanOrEqual(2)
  for (const row of rows) {
    expect(row.left).toBe(root.left)
    expect(row.well - root.well).toBe(16 * row.depth)
    expect(row.well - row.left).toBe(8 + 16 * row.depth)
    expect(row.overflow).toBeLessThanOrEqual(1)
    expect(row.right).toBeLessThanOrEqual(width)
    for (const [index, target] of row.targets.entries()) {
      expect(target.width).toBeGreaterThanOrEqual(48)
      expect(target.height).toBeGreaterThanOrEqual(48)
      expect(target.left).toBeGreaterThanOrEqual(row.left)
      expect(target.right).toBeLessThanOrEqual(row.right)
      if (index > 0) expect(target.left).toBeGreaterThanOrEqual(row.targets[index - 1]!.right)
    }
  }
}

for (const width of [320, 412, 1352]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test.describe(`sub-habit indentation at ${width} in ${locale}, ${theme}`, () => {
        test.use({ viewport: { width, height: 915 } })
        test('insets child wells once with distinct targets at normal and enlarged text', async ({ page, context }) => {
          const words = locale === 'en' ? en : ptBR
          await setLayoutFixtureSession(context, [
            { path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language: locale, themePreference: theme }) },
            { path: API.habits.list, body: habits },
          ])
          await page.goto(`/?date=${date}`)
          const parent = page.locator('[data-habit-title="Parent"]')
          await expect(parent).toBeVisible()
          const leaf = page.locator('[data-habit-title="Leaf child"]')
          if (!await leaf.isVisible()) await parent.locator('[data-habit-row-control="disclosure"]').click()
          await expect(leaf).toBeVisible()
          await expect(page.locator('[data-habit-title="Branch child"]')).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          for (const selecting of [false, true]) {
            if (selecting) {
              await openTodayListOptions(page, words.habits.listOptions)
              await page.getByRole('menuitem', { name: words.common.select, exact: true }).click()
              await expect(leaf.locator('[data-habit-row-control="selection"]')).toBeVisible()
            }
            for (const scale of [1, 2]) {
              await page.evaluate(async (scale) => {
                document.documentElement.style.fontSize = `${16 * scale}px`
                await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
              }, scale)
              await assertChildIndentation(page, width)
            }
          }
        })
      })
    }
  }
}

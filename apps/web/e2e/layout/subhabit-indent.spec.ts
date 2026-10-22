import { expect, type Page } from '@playwright/test'
import { test } from './layout-test'
import { setLayoutFixtureSession } from './profile-session'
import { openTodayListOptions } from './hydration-guard'
import { assertHabitRows, setHabitTextScale } from './subhabit-indent-geometry'
import { measureTitleWords } from './title-word-geometry'
import { API } from '@orbit/shared/api'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'

const date = '2026-09-04'
const child = { ...makeHabitScheduleItem().children[0]!,
  title: 'Leaf child with a long title about reading a chapter and writing down the ideas to discuss with the group before breakfast',
  dueTime: '08:00:00', dueDate: date, scheduledDates: [date] }
const deepest = { ...child, id: 'great-grandchild', title: 'Deepest child' }
const grandchild = { ...child, id: 'grandchild', title: 'Deeper child',
  hasSubHabits: true, children: [deepest] }
const branch = { ...child, id: 'branch',
  title: 'Branch child with a long title about preparing the room and collecting every book and notebook for the next reading session',
  dueTime: null, hasSubHabits: true,
  children: [grandchild] }
const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Parent', dueDate: date, scheduledDates: [date], tags: [], children: [child, branch],
}))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})
const details = [habit, child, branch, grandchild, deepest].map((item) => habitDetailSchema.parse({ ...makeHabitDetail(), ...item }))
const metrics = habitMetricsSchema.parse({
  currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100,
  totalCompletions: 1, lastCompletedDate: null,
})

function habitRow(page: Page, title: string) {
  return page.getByTestId('habit-row').filter({ has: page.locator('[data-personal-text]', { hasText: title }) })
}

async function openFamily(page: Page) {
  await page.goto(`/?date=${date}`)
  const parent = page.locator('[data-habit-title="Parent"]')
  await expect(parent).toBeVisible()
  const leaf = habitRow(page, child.title)
  const disclosure = parent.locator('[data-habit-row-control="disclosure"]')
  if (!await leaf.isVisible()) {
    await disclosure.click()
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    await expect(leaf).toBeVisible()
  }
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(leaf).toBeHidden()
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(leaf).toBeVisible()
  await expect(habitRow(page, branch.title)).toBeVisible()
}

async function expectSupportingHeadings(page: Page, scale: number, titles: readonly string[], normalSupportingTitles: readonly string[]) {
  for (const title of titles) {
    await expect(habitRow(page, title).locator('[data-habit-row-heading]')).toHaveCount(scale === 2 || normalSupportingTitles.includes(title) ? 1 : 0)
  }
}

async function drillInto(page: Page, title: string, words: typeof en | typeof ptBR) {
  await habitRow(page, title).locator('[data-habit-row-control="menu"]').click()
  await page.getByRole('menu', { name: title, exact: true })
    .getByRole('menuitem', { name: words.habits.actions.openSubHabits, exact: true }).click()
  await expect(page.getByRole('heading', { name: title, level: 2, exact: true })).toBeVisible()
}

for (const width of [320, 412, 1352]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test.describe(`sub-habit indentation at ${width} in ${locale}, ${theme}`, () => {
        const words = locale === 'en' ? en : ptBR
        const familyItems = [habit, child, branch, grandchild, deepest]
        const familyDepths = [0, 1, 1, 2, 3]
        const familyAtScale = (scale: number) => {
          const visibleCount = width === 320 ? scale === 2 ? 3 : 4 : familyItems.length
          return { items: familyItems.slice(0, visibleCount), depths: familyDepths.slice(0, visibleCount) }
        }
        const normalSupportingTitles = width === 320 ? [grandchild.title, ...(locale === 'pt-BR' ? [branch.title] : [])] : []
        test.use({ viewport: { width, height: 915 } })
        test.beforeEach(async ({ context }) => {
          await setLayoutFixtureSession(context, [
            { path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language: locale, themePreference: theme }) },
            { path: API.habits.list, body: habits },
          ])
          for (const detail of details) {
            await context.route((url) => url.pathname === API.habits.get(detail.id), (route) => route.fulfill({ json: detail }))
            await context.route((url) => url.pathname === API.habits.logs(detail.id), (route) => route.fulfill({ json: [] }))
            await context.route((url) => url.pathname === API.habits.metrics(detail.id), (route) => route.fulfill({ json: metrics }))
          }
        })

        test('insets long leaf and branch titles once with distinct targets at normal and enlarged text', async ({ page }) => {
          await openFamily(page)
          for (const selecting of [false, true]) {
            if (selecting) {
              await openTodayListOptions(page, words.habits.listOptions)
              await page.getByRole('menuitem', { name: words.common.select, exact: true }).click()
              await expect(habitRow(page, child.title).locator('[data-habit-row-control="selection"]')).toBeVisible()
            }
            for (const scale of [1, 2]) {
              const { items: familyItems, depths: familyDepths } = familyAtScale(scale)
              await setHabitTextScale(page, scale, familyItems.map((item) => item.title), normalSupportingTitles)
              await expectSupportingHeadings(page, scale, familyItems.map((item) => item.title), normalSupportingTitles)
              const rows = await assertHabitRows(page.locator('[data-testid="habit-row"]:visible'), width, familyDepths, scale, selecting, normalSupportingTitles)
              for (const row of rows.slice(1)) {
                expect(row.bounds.left).toBe(rows[0]!.bounds.left)
                expect(row.well.left - rows[0]!.well.left).toBe(16 * row.depth)
                expect(row.metadata).not.toBeNull()
              }
              if (scale === 2) expect(rows[2]!.supporting).toBe(true)
            }
          }
        })

        if (width !== 320) return

        test('opens the width boundary disclosure and preserves selection after drill and back', async ({ page }) => {
          await openFamily(page)
          const rows = page.locator('[data-testid="habit-row"]:visible')
          for (const scale of [1, 2]) {
            const { items: familyItems, depths: familyDepths } = familyAtScale(scale)
            await setHabitTextScale(page, scale, familyItems.map((item) => item.title), normalSupportingTitles)
            await openTodayListOptions(page, words.habits.listOptions)
            await page.getByRole('menuitem', { name: words.common.select, exact: true }).click()
            const selectedLeaf = habitRow(page, child.title).locator('[data-habit-row-control="selection"]')
            await selectedLeaf.click()
            await expect(selectedLeaf).toHaveAttribute('aria-pressed', 'true')
            await assertHabitRows(rows, width, familyDepths, scale, true, normalSupportingTitles)
            const boundaryHabit = scale === 2 ? branch : grandchild
            const drilledChild = scale === 2 ? grandchild : deepest
            const boundary = habitRow(page, boundaryHabit.title).locator('[data-habit-row-control="disclosure"]')
            await expect(boundary).toHaveAccessibleName(words.habits.actions.openSubHabits)
            await expect(boundary).not.toHaveAttribute('aria-expanded')
            await expect(boundary).not.toHaveAttribute('aria-controls')
            await boundary.click()
            await expect(page.getByRole('heading', { name: boundaryHabit.title, level: 2, exact: true })).toBeVisible()
            await expect(habitRow(page, drilledChild.title)).toBeVisible()
            await assertHabitRows(rows, width, [0], scale, true)
            await expect(habitRow(page, drilledChild.title).locator('[data-habit-row-control="selection"]')).toHaveAttribute('aria-pressed', 'false')
            await page.getByRole('button', { name: words.common.back, exact: true }).click()
            await assertHabitRows(rows, width, familyDepths, scale, true, normalSupportingTitles)
            await expect(selectedLeaf).toHaveAttribute('aria-pressed', 'true')
            await page.getByRole('button', { name: words.common.cancel, exact: true }).click()
            await expect(page.locator('[data-habit-row-control="selection"]')).toHaveCount(0)
          }
        })

        test('opens the full long child titles through their existing detail action at 200% text', async ({ page }) => {
          for (const item of [child, branch]) {
            await openFamily(page)
            await setHabitTextScale(page, 2)
            await habitRow(page, item.title).locator('[data-habit-row-body]').click()
            await expect(page).toHaveURL(new RegExp(`/habits/${item.id}\\?`))
            const heading = page.getByRole('heading', { level: 1, name: item.title, exact: true })
            await expect(heading).toBeVisible()
            const title = heading.locator('[data-personal-text]')
            await expect(title).toHaveText(item.title)
            await setHabitTextScale(page, 2)
            const geometry = await title.evaluate(measureTitleWords)
            expect(await page.locator('html').evaluate((root) => getComputedStyle(root).fontSize)).toBe('32px')
            expect(geometry.lineClamp).toBe('none')
            expect(geometry.visibleLines).toBeGreaterThan(2)
            expect(geometry.height).toBeGreaterThan(2 * geometry.lineHeight)
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
          }
        })

        test('resets direct drill children to the root inset and discloses the long drill title', async ({ page }) => {
          await openFamily(page)
          await setHabitTextScale(page, 2)
          await drillInto(page, habit.title, words)
          const rows = page.locator('[data-testid="habit-row"]:visible')
          await assertHabitRows(rows, width, [0, 0], 2)
          await expect(habitRow(page, child.title)).toBeVisible()
          await expect(habitRow(page, branch.title)).toBeVisible()
          await drillInto(page, branch.title, words)
          await expect(habitRow(page, branch.children[0]!.title)).toBeVisible()
          await assertHabitRows(rows, width, [0], 2)
          await page.getByRole('button', { name: words.common.showFullText.replace('{name}', branch.title), exact: true }).click()
          const fullTitle = page.getByRole('dialog', { name: branch.title, exact: true })
          await expect(fullTitle.locator('[data-personal-text-expanded]').last()).toHaveText(branch.title)
          await fullTitle.getByRole('button', { name: words.common.close, exact: true }).click()
          await page.getByRole('button', { name: words.common.back, exact: true }).click()
          await assertHabitRows(rows, width, [0, 0], 2)
          await page.getByRole('button', { name: words.common.back, exact: true }).click()
          await assertHabitRows(rows, width, familyAtScale(2).depths, 2, undefined, normalSupportingTitles)
        })

        test('keeps one inset and the existing gap in the detail child composition at 200% text', async ({ page }) => {
          await page.goto(`/habits/${habit.id}?date=${date}`)
          await expect(page.getByRole('heading', { level: 1, name: habit.title, exact: true })).toBeVisible()
          await setHabitTextScale(page, 2)
          const children = page.getByTestId('detail-children').getByTestId('habit-row')
          await expect(habitRow(page, child.title)).toBeVisible()
          await expect(habitRow(page, branch.title)).toBeVisible()
          const rows = await assertHabitRows(children, width, [1, 1], 2)
          expect(rows[1]!.bounds.left).toBe(rows[0]!.bounds.left)
          expect(rows[1]!.bounds.top - rows[0]!.bounds.bottom).toBe(12)
        })
      })
    }
  }
}

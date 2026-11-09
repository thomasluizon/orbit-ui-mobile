import { expect, type BrowserContext, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { ASTRA_BUTTON_GAP, getAccountDay } from '@orbit/shared/utils'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { test } from './layout-test'

const conversation = '[data-shell-conversation="overlay"]'

async function openHoje(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-today-header-actions]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function seedOneHabit(context: BrowserContext) {
  const date = getAccountDay(new Date(LAYOUT_FIXED_TIME), 'UTC')
  const item = makeHabitScheduleItem({ id: 'astra-stack-habit', title: 'Read chapter 1', position: 0,
    dueDate: date, scheduledDates: [date], children: [], hasSubHabits: false })
  const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [item], page: 1, pageSize: 1, totalCount: 1, totalPages: 1 })
  const profile = profileSchema.parse({ ...profileFixture, language: 'en', timeZone: 'UTC' })
  await setLayoutProfileSession(context, profile)
  await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile },
    { path: API.habits.count, body: { count: 1 } }, { path: API.habits.list, body: habits }])
}

function measureStack() {
  const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null
  const button = rect('[data-astra-button]')!
  const create = rect('[data-shell-fab] button')
  const column = rect('[data-shell-fab-content]')!
  return { top: button.top, bottom: button.bottom, left: button.left, right: button.right, width: button.width,
    createTop: create?.top ?? null, createBottom: create?.bottom ?? null, createLeft: create?.left ?? null, createRight: create?.right ?? null,
    createWidth: create?.width ?? null, columnBottom: column.bottom, columnRight: column.right, tabsTop: rect('[data-shell-tab-bar]')!.top }
}

for (const width of [1280, 1352]) {
  test.describe(`wide Hoje Astra entry at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('renders no Astra button and opens Astra from the sidebar row', async ({ page }) => {
      await openHoje(page)
      await expect(page.locator('[data-astra-button]')).toHaveCount(0)
      await page.locator('[data-shell-sidebar]').getByRole('button', { name: en.nav.astra, exact: true }).click()
      await expect(page.locator(conversation)).toBeVisible()
    })
  })
}

for (const width of [412, 840]) {
  test.describe(`compact Hoje Astra button at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('sits directly above the create button, stays put through a drag and opens on a tap', async ({ page, context }) => {
      await seedOneHabit(context)
      await openHoje(page)
      await expect(page.locator('[data-shell-scroller] [data-testid="habit-row"]')).toHaveCount(1)
      const button = page.getByRole('button', { name: en.shell.astraButton.open, exact: true })
      await expect(button).toBeVisible()
      await expect(page.locator('[data-shell-fab] button')).toBeVisible()
      await expect.poll(async () => { const next = await page.evaluate(measureStack); return next.createTop! - next.bottom }).toBeCloseTo(ASTRA_BUTTON_GAP, 0)
      const stack = await page.evaluate(measureStack)
      expect(stack.left + stack.width / 2).toBeCloseTo(stack.createLeft! + stack.createWidth! / 2, 0)
      expect(stack.createBottom!).toBeCloseTo(stack.columnBottom, 0)
      expect(stack.createRight!).toBeCloseTo(stack.columnRight, 0)
      expect(stack.columnBottom).toBeLessThanOrEqual(stack.tabsTop)

      await page.mouse.move(stack.left + 30, stack.top + 30)
      await page.mouse.down()
      await page.mouse.move(0, 0, { steps: 10 })
      await page.mouse.up()
      await expect.poll(() => page.evaluate(measureStack)).toEqual(stack)
      await expect(page.locator(conversation)).toHaveCount(0)

      await button.click()
      await expect(page.locator(conversation)).toBeVisible()
    })

    test('takes the create button slot when Hoje has no create button', async ({ page }) => {
      await openHoje(page)
      await expect(page.getByRole('button', { name: en.shell.astraButton.open, exact: true })).toBeVisible()
      await expect(page.locator('[data-shell-fab]')).toHaveCount(0)
      const stack = await page.evaluate(measureStack)
      expect(stack.bottom).toBeCloseTo(stack.columnBottom, 0)
      expect(stack.right).toBeCloseTo(stack.columnRight, 0)
      expect(stack.columnBottom).toBeLessThanOrEqual(stack.tabsTop)
    })

    test('draws no canvas occlusion ring', async ({ page }) => {
      await openHoje(page)
      const button = page.locator('[data-astra-button]')
      await expect(button).toBeVisible()
      const paint = await button.evaluate(element => {
        const probe = document.createElement('i')
        probe.style.color = 'var(--bg)'
        document.body.append(probe)
        const canvas = getComputedStyle(probe).color
        probe.remove()
        return { shadow: getComputedStyle(element).boxShadow, canvas }
      })
      expect(paint.shadow).not.toMatch(/0px 0px 0px 6px/)
      expect(paint.shadow).not.toContain(paint.canvas)
    })
  })
}

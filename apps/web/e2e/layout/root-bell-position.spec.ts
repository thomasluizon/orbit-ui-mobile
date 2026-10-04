import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({ habits: [], logs: {} })
const goals = paginatedGoalResponseSchema.parse(emptyGoalsPageFixture)
const overflowingGoals = paginatedGoalResponseSchema.parse({
  ...emptyGoalsPageFixture,
  items: Array.from({ length: 40 }, (_, index) => createMockGoal({
    id: `goal-${index}`, title: `Livro ${index + 1}`, position: index,
  })),
  totalCount: 40,
})

async function waitForRoot(page: Page, root: string, words: typeof en | typeof ptBR, content: 'short' | 'long') {
  if (root === '/calendar') {
    await expect(page.getByTestId('calendar-day-select-2026-09-04')).toBeVisible()
    await expect(page.getByTestId('calendar-grid').getByRole('progressbar')).toHaveCount(0)
  } else if (root === '/progress') {
    if (content === 'short') await expect(page.getByText(words.progressScreen.goals.empty, { exact: true })).toBeVisible()
    else await expect(page.locator('[data-goal-id]')).toHaveCount(overflowingGoals.items.length)
  } else if (root === '/profile') {
    await expect(page.getByTestId('profile-settings-groups')).toBeVisible()
  }
}

async function measureBell(bell: Locator) {
  return bell.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const row = element.parentElement!.getBoundingClientRect()
    const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
    const scroller = element.closest('[data-shell-column]')!.querySelector<HTMLElement>('[data-shell-scroller]')!
    const gutter = scroller.offsetWidth - scroller.clientWidth
    return {
      right: bounds.right,
      centerY: bounds.top + bounds.height / 2,
      width: bounds.width,
      height: bounds.height,
      rowHeight: row.height,
      rowCenterY: row.top + row.height / 2,
      trailingInset: column.right - bounds.right - gutter,
      gutter,
      overflows: scroller.scrollHeight > scroller.clientHeight,
    }
  })
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [320, 412, 600, 840]) {
    test.describe(`root bell position in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })
      const words = locale === 'pt-BR' ? ptBR : en

      for (const content of ['short', 'long'] as const) {
        test(`aligns every root to Hoje with ${content} content and opens Avisos`, async ({ page, context }) => {
          await context.route(
            (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
            (route) => route.fulfill({ json: calendarMonth }),
          )
          await context.route(
            (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
            (route) => route.fulfill({ json: content === 'long' ? overflowingGoals : goals }),
          )
          let today: Awaited<ReturnType<typeof measureBell>> | undefined
          for (const root of ['/', '/calendar', '/progress', '/profile']) {
            await page.goto(root)
            await waitForRoot(page, root, words, content)
            const row = root === '/' ? page.locator('[data-today-header-actions]')
              : root === '/calendar' ? page.getByTestId('calendar-shell-header')
                : page.locator('[data-root-notification-header]')
            const bell = row.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })
            await expect(bell).toBeVisible()
            await page.evaluate(() => document.fonts.ready)
            await expect(async () => {
              const geometry = await measureBell(bell)
              today ??= geometry
              expect(Math.abs(geometry.right - today.right), `${root} trailing edge`).toBeLessThanOrEqual(0.5)
              if (root === '/') expect(geometry.overflows).toBe(false)
              if (root === '/progress' && content === 'long') {
                expect(geometry.overflows).toBe(true)
                expect(geometry.gutter).toBeGreaterThan(0)
              }
              expect(Math.abs(geometry.centerY - today.centerY), `${root} vertical centre`).toBeLessThanOrEqual(1)
              expect(geometry.trailingInset).toBe(16)
              expect(geometry.width).toBeGreaterThanOrEqual(48)
              expect(geometry.height).toBeGreaterThanOrEqual(48)
              expect(geometry.rowHeight).toBeGreaterThanOrEqual(48)
              expect(geometry.centerY).toBe(geometry.rowCenterY)
            }).toPass({ timeout: 5000 })
            if (root === '/progress' || root === '/profile') {
              await expect(row.getByRole('button')).toHaveCount(1)
              await expect(row.getByRole('heading')).toHaveCount(0)
              expect(await row.evaluate((element) => Boolean(element.closest('[data-shell-scroller]')))).toBe(true)
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
            await bell.click()
            await expect(page).toHaveURL(/\/notifications$/)
            await expect(page.getByRole('heading', { name: words.notifications.title, exact: true })).toBeVisible()
          }
        })
      }
    })
  }
}

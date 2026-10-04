import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({ habits: [], logs: {} })
const goals = paginatedGoalResponseSchema.parse(emptyGoalsPageFixture)

async function measureBell(bell: Locator) {
  return bell.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const row = element.parentElement!.getBoundingClientRect()
    const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
    return {
      right: bounds.right,
      centerY: bounds.top + bounds.height / 2,
      width: bounds.width,
      height: bounds.height,
      rowHeight: row.height,
      rowCenterY: row.top + row.height / 2,
      trailingInset: column.right - bounds.right,
    }
  })
}

test.beforeEach(async ({ context }) => {
  await context.route(
    (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
    (route) => route.fulfill({ json: calendarMonth }),
  )
  await context.route(
    (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
    (route) => route.fulfill({ json: goals }),
  )
})

for (const locale of ['en', 'pt-BR'] as const) {
  for (const { width, mode } of [320, 412, 840, 1100, 1352].flatMap((width) =>
    (['dark', 'light'] as const).map((mode) => ({ width, mode })),
  )) {
    test.describe(`root bell position in ${locale} at ${width}px in ${mode}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { themePreference: mode } })
      const words = locale === 'pt-BR' ? ptBR : en

      test('aligns every root to Hoje and opens Avisos', async ({ page }) => {
        let today: Awaited<ReturnType<typeof measureBell>> | undefined
        for (const root of ['/', '/calendar', '/progress', '/profile']) {
          await page.goto(root)
          await waitForRoot(page, root, words)
          const row = root === '/' ? page.locator('[data-today-header-actions]')
            : root === '/calendar' ? page.getByTestId('calendar-shell-header')
              : page.locator('[data-root-notification-header]')
          const bell = page.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) }).filter({ visible: true })
          await expect(bell).toHaveCount(1)
          if (width >= 1024) await expectWideBell(page, row, root, words)
          await page.evaluate(() => document.fonts.ready)
          if (width < 1024) await expect(async () => {
            const geometry = await measureBell(bell)
            today ??= geometry
            expect(Math.abs(geometry.right - today.right), `${root} trailing edge`).toBeLessThanOrEqual(1)
            expect(Math.abs(geometry.centerY - today.centerY), `${root} vertical centre`).toBeLessThanOrEqual(1)
            expect(geometry.trailingInset).toBe(16)
            expect(geometry.width).toBeGreaterThanOrEqual(48)
            expect(geometry.height).toBeGreaterThanOrEqual(48)
            expect(geometry.rowHeight).toBeGreaterThanOrEqual(48)
            expect(geometry.centerY).toBe(geometry.rowCenterY)
          }).toPass({ timeout: 5000 })
          if (width < 1024 && (root === '/progress' || root === '/profile')) {
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
    })
  }
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const mode of ['dark', 'light'] as const) {
    test.describe(`root bell resizing in ${locale} and ${mode}`, () => {
      test.use({ appLocale: locale, viewport: { width: 1023, height: 915 }, layoutProfile: { themePreference: mode } })
      const words = locale === 'pt-BR' ? ptBR : en

      test('moves one bell across the sidebar breakpoint without duplicate frames', async ({ page }) => {
        for (const root of ['/', '/calendar', '/progress', '/profile']) {
          await page.setViewportSize({ width: 1023, height: 915 })
          await page.goto(root)
          await waitForRoot(page, root, words)
          await expect(page.locator('[data-shell-tab-bar]')).toBeVisible()
          const bells = page.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) }).filter({ visible: true })
          await expect(bells).toHaveCount(1)
          const samples = recordBellFrames(page, words.notifications.bell)
          for (const width of [1024, 1100, 1023, 840, 1024, 1023]) {
            await page.setViewportSize({ width, height: 915 })
            await expect(bells).toHaveCount(1)
            await expect(page.locator('[data-shell-sidebar]').getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })).toHaveCount(width >= 1024 ? 1 : 0)
            if (root === '/calendar') await expect(page.getByTestId('calendar-shell-header').getByRole('button', { name: words.calendar.options, exact: true })).toBeVisible()
          }
          await page.evaluate(() => document.dispatchEvent(new Event('bell-resize-end')))
          const counts = await samples
          expect(counts.length).toBeGreaterThan(0)
          expect(counts.every((count) => count <= 1), `${root} visible bells per frame: ${counts.join(',')}`).toBe(true)
        }
      })
    })
  }
}

async function recordBellFrames(page: Page, label: string) {
  return page.evaluate((bellLabel) => new Promise<number[]>((resolve) => {
    const counts: number[] = []
    let frame: number
    const sample = () => {
      counts.push(Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]')).filter((button) => {
        const bounds = button.getBoundingClientRect()
        return button.getAttribute('aria-label')!.startsWith(bellLabel)
          && bounds.width > 0 && bounds.height > 0 && getComputedStyle(button).visibility !== 'hidden'
      }).length)
      frame = requestAnimationFrame(sample)
    }
    sample()
    document.addEventListener('bell-resize-end', () => { cancelAnimationFrame(frame); resolve(counts) }, { once: true })
  }), label)
}

async function waitForRoot(page: Page, root: string, words: typeof en) {
  if (root === '/calendar') {
    await expect(page.getByTestId('calendar-day-select-2026-09-04')).toBeVisible()
    await expect(page.getByTestId('calendar-grid').getByRole('progressbar')).toHaveCount(0)
  } else if (root === '/progress') {
    await expect(page.getByText(words.progressScreen.goals.empty, { exact: true })).toBeVisible()
  } else if (root === '/profile') {
    await expect(page.getByTestId('profile-settings-groups')).toBeVisible()
  }
}

async function expectWideBell(page: Page, row: Locator, root: string, words: typeof en) {
  await expect(page.locator('[data-shell-sidebar]').getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })).toHaveCount(1)
  await expect(row.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })).toHaveCount(0)
  if (root === '/calendar') await expect(row.getByRole('button', { name: words.calendar.options, exact: true })).toBeVisible()
}

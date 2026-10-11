import { settleAnimations } from './settle-animations'
import { setLayoutFixtureSession } from './profile-session'
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { createMockNotification, createMockRecap } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl } from '@orbit/shared/utils'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { completeInstallOnboarding } from './install-onboarding'

const HEIGHT = 915
const notification = createMockNotification({ title: 'Layout notification' })
const notifications = notificationsResponseSchema.parse({ items: [notification], unreadCount: 1 })

async function installLongToday(context: BrowserContext) {
  const items = Array.from({ length: 32 }, (_, index) => makeHabitScheduleItem({
    id: `safe-area-habit-${index}`, title: `Read chapter ${index}`, position: index,
    isGeneral: true, children: [], hasSubHabits: false,
  }))
  const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
    items, page: 1, pageSize: items.length, totalCount: items.length, totalPages: 1,
  })
  await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
  await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: items.length } }))
}

async function revealTodayControls(page: Page) {
  await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
  const menu = page.getByRole('menu', { name: messages.habits.listOptions })
  await menu.getByRole('menuitem', { name: messages.habits.refresh, exact: true }).click()
  await expect(menu).toHaveCount(0)
  await expect(page.locator('[data-shell-scroller] [data-habit-title]')).toHaveCount(32)
  const scroller = page.locator('[data-shell-scroller]')
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(915)
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await scroller.evaluate((element) => { element.scrollTop -= 64 })
  await expect(page.getByRole('button', { name: messages.common.backToTop, exact: true })).toBeVisible()
  await expect(page.locator('[data-shell-fab] button')).toBeVisible()
}

async function expectInsideInsets(surface: Locator, top: number, bottom: number) {
  await expect(surface).toBeVisible()
  const box = (await surface.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(top)
  expect(box.y + box.height).toBeLessThanOrEqual(HEIGHT - bottom)
}

async function setInsets(page: Page, top: number, bottom: number) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom } })
}

for (const width of [320, 412, 600]) {
  for (const top of [0, 24]) {
    const bottom = top ? 34 : 0
    test.describe(`viewport cover at ${width}px and insets ${top}/${bottom}`, () => {
      test.use({ appLocale: 'en', viewport: { width, height: HEIGHT } })
      test.beforeEach(async ({ page }) => { await setInsets(page, top, bottom) })

      test('Hoje keeps pinned controls and its focused skip link inside the safe viewport', async ({ page, context }) => {
        await installLongToday(context)
        await page.goto('/')
        await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /(?:^|,)\s*viewport-fit=cover(?:,|$)/)
        const header = page.locator('[data-shell-header]')
        await expect(header.locator('[data-today-header-actions]')).toBeVisible()
        await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
        const panel = page.getByRole('dialog', { name: messages.habits.listOptions })
        await expect(panel).toBeVisible()
        const menuItems = panel.getByRole('menuitem')
        expect(await menuItems.count()).toBeGreaterThan(0)
        for (const item of await menuItems.all()) await expectInsideInsets(item, top, bottom)
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await revealTodayControls(page)
        for (const selector of ['[data-shell-header] button', '[data-shell-pinned-slot] button', '[data-shell-pinned-slot] textarea', '[data-shell-tab-bar] button', '[data-shell-fab] button', '[data-shell-scroll-to-top] button']) {
          const controls = page.locator(selector).filter({ visible: true })
          expect(await controls.count(), selector).toBeGreaterThan(0)
          for (const control of await controls.all()) await expectInsideInsets(control, top, bottom)
        }
        const skip = page.getByRole('link', { name: messages.common.skipToContent })
        await skip.focus()
        await skip.evaluate(settleAnimations)
        await expectInsideInsets(skip, top, bottom)
        expect((await skip.boundingBox())!.y).toBe(Math.max(16, top))
        expect((await header.boundingBox())!.y).toBe(top)
        const shell = (await page.locator('[data-shell="wide"]').boundingBox())!
        expect(shell.y).toBe(0)
        expect(shell.y + shell.height).toBe(HEIGHT)
        const tabBar = (await page.locator('[data-shell-tab-bar]').boundingBox())!
        expect(tabBar.y + tabBar.height).toBe(HEIGHT - bottom)
      })

      test('the throttle screen keeps its text and retry control inside the safe viewport', async ({ page, context }) => {
        await completeInstallOnboarding(page)
        await context.clearCookies()
        await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
        await context.route(`${LAYOUT_ORIGIN}/api/auth/send-code`, (route) => route.fulfill({
          status: 429,
          json: { retryAfterUtc: '2026-09-04T12:01:00Z' },
        }))
        await page.goto('/login')
        await page.getByRole('textbox', { name: messages.auth.email, exact: true }).fill('layout@example.com')
        await page.getByRole('button', { name: messages.auth.sendCode, exact: true }).click()
        const throttle = page.getByRole('dialog', { name: messages.errorScreen.throttleTitle })
        await expect(throttle).toBeVisible()
        for (const selector of ['h1', '.error-surface-body', '[role="timer"]', 'button']) {
          await expectInsideInsets(throttle.locator(selector), top, bottom)
        }
        const box = (await throttle.boundingBox())!
        expect(box.y).toBe(0)
        expect(box.y + box.height).toBe(HEIGHT)
      })

      test('a queued-delete toast and notice slot stay above the bottom inset', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
        await page.goto('/notifications')
        await page.getByRole('button', { name: messages.notifications.deleteNotification.replace('{title}', notification.title), exact: true }).click()
        const toast = page.locator('[data-shell-notice] [data-kind="neutral"]').filter({ hasText: messages.notifications.deleteQueued })
        await expectInsideInsets(toast, top, bottom)
        await expectInsideInsets(toast.getByRole('button', { name: messages.notifications.deleteUndo, exact: true }), top, bottom)
        await expectInsideInsets(page.locator('[data-shell-notice]'), top, bottom)
        await toast.getByRole('button', { name: messages.notifications.deleteUndo, exact: true }).click()
        await expect(toast).toHaveCount(0)
      })
    })
  }
}

for (const inset of [0, 44]) {
  const insets = { top: 0, bottom: inset ? 21 : 0, left: inset, right: inset }
  test.describe(`landscape safe area with inline inset ${inset}`, () => {
    test.use({ appLocale: 'en', viewport: { width: 844, height: 390 } })
    test.beforeEach(async ({ page }) => {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets })
    })

    async function expectSafeBounds(subject: Locator) {
      await expect(subject).toBeVisible()
      const bounds = (await subject.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(insets.left)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(844 - insets.right)
      expect(bounds.y).toBeGreaterThanOrEqual(insets.top)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(390 - insets.bottom)
    }

    test('shell content, pinned controls and the focused skip link respect both inline edges', async ({ page, context }) => {
      await installLongToday(context)
      await page.goto('/')
      await revealTodayControls(page)
      for (const selector of ['[data-shell-header] button', '[data-shell-pinned-slot] button', '[data-shell-pinned-slot] textarea', '[data-shell-tab-bar] button', '[data-shell-fab] button', '[data-shell-scroll-to-top] button']) {
        const controls = page.locator(selector).filter({ visible: true })
        expect(await controls.count(), selector).toBeGreaterThan(0)
        for (const control of await controls.all()) await expectSafeBounds(control)
      }
      const column = (await page.locator('[data-shell-column]').boundingBox())!
      expect(column.x).toBeGreaterThanOrEqual(insets.left)
      expect(column.x + column.width).toBeLessThanOrEqual(844 - insets.right)
      if (inset === 0) { expect(column.x).toBe(52); expect(column.width).toBe(740) }
      const skip = page.getByRole('link', { name: messages.common.skipToContent })
      await skip.focus()
      await skip.evaluate(settleAnimations)
      await expectSafeBounds(skip)
      expect((await skip.boundingBox())!.x).toBe(Math.max(16, inset))
      const shell = (await page.locator('[data-shell="wide"]').boundingBox())!
      expect(shell).toMatchObject({ x: 0, y: 0, width: 844, height: 390 })
    })

    test('sheets, the palette, toasts and public content protect both inline edges', async ({ page, context }) => {
      await installLongToday(context)
      await page.goto('/')
      await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
      const sheet = page.getByRole('dialog', { name: messages.habits.listOptions })
      await expect(sheet).toBeVisible()
      const items = sheet.getByRole('menuitem')
      expect(await items.count()).toBeGreaterThan(0)
      for (const item of await items.all()) await expectSafeBounds(item)
      await page.keyboard.press('Escape')
      await expect(sheet).toHaveCount(0)
      await page.keyboard.press('Control+k')
      const palette = page.getByRole('dialog', { name: messages.command.title })
      await expectSafeBounds(palette)
      for (const control of await palette.locator('input,button').filter({ visible: true }).all()) await expectSafeBounds(control)
      await page.keyboard.press('Escape')
      await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
      await page.goto('/notifications')
      await page.getByRole('button', { name: messages.notifications.deleteNotification.replace('{title}', notification.title), exact: true }).click()
      const toast = page.locator('[data-shell-notice] [data-kind="neutral"]').filter({ hasText: messages.notifications.deleteQueued })
      await expectSafeBounds(toast)
      await expectSafeBounds(toast.getByRole('button', { name: messages.notifications.deleteUndo, exact: true }))
      await page.goto('/privacy')
      const content = page.locator('[data-flow-mode="document"]')
      await expectSafeBounds(content.getByRole('heading', { level: 1 }))
      const bounds = (await content.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(insets.left)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(844 - insets.right)
    })

    test('the throttle screen keeps text and retry inside the inline edges', async ({ page, context }) => {
      await completeInstallOnboarding(page)
      await context.clearCookies()
      await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
      await context.route(`${LAYOUT_ORIGIN}/api/auth/send-code`, (route) => route.fulfill({
        status: 429, json: { retryAfterUtc: '2026-09-04T12:01:00Z' },
      }))
      await page.goto('/login')
      const email = page.getByRole('textbox', { name: messages.auth.email, exact: true })
      await expectSafeBounds(email)
      await email.fill('layout@example.com')
      await page.getByRole('button', { name: messages.auth.sendCode, exact: true }).click()
      const throttle = page.getByRole('dialog', { name: messages.errorScreen.throttleTitle })
      for (const selector of ['h1', '.error-surface-body', '[role="timer"]', 'button']) {
        await expectSafeBounds(throttle.locator(selector))
      }
      expect(await throttle.boundingBox()).toMatchObject({ x: 0, y: 0, width: 844, height: 390 })
    })

    test('the Wrapped cover and player protect controls while their background fills the viewport', async ({ page, context }) => {
      await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`, (route) => route.fulfill({ json: recapResponseSchema.parse(createMockRecap()) }))
      await page.goto('/wrapped')
      const back = page.getByRole('button', { name: messages.common.backToProfile, exact: true })
      await expectSafeBounds(back)
      if (inset === 0) expect(await back.boundingBox()).toMatchObject({ x: 16, y: 4 })
      await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
      const player = page.getByRole('dialog', { name: messages.wrapped.title, exact: true })
      for (const control of await player.locator('button').filter({ visible: true }).all()) await expectSafeBounds(control)
      await expectSafeBounds(page.getByTestId('wrapped-header'))
      await expectSafeBounds(page.getByTestId('wrapped-pager'))
      expect(await player.boundingBox()).toMatchObject({ x: 0, y: 0, width: 844, height: 390 })
      if (inset === 0) {
        const close = (await page.getByRole('button', { name: messages.wrapped.close, exact: true }).boundingBox())!
        expect(close.x + close.width).toBe(836)
      }
      await page.getByRole('button', { name: messages.wrapped.close, exact: true }).click()
      await page.evaluate(() => window.scrollTo(0, 0))
      await expectSafeBounds(back)
    })
  })
}

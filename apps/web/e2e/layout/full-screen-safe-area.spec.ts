import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl } from '@orbit/shared/utils'
import { test } from './upgrade-fixtures'
import { LAYOUT_ORIGIN } from '../support/env'

test.use({ appLocale: 'en', viewport: { width: 412, height: 915 } })

for (const top of [0, 24, 48]) {
  test.describe(`full-screen safe area at ${top}px`, () => {
    test.beforeEach(async ({ page }) => {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom: 16 } })
    })

    async function expectSafeTop(header: Locator) {
      await expect(header).toBeVisible()
      const box = await header.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(top)
    }

    for (const entry of ['Hoje', 'habit detail'] as const) {
      test(`the conversation from ${entry} reserves one top inset and its bottom composer inset`, async ({ page, context }) => {
        if (entry === 'habit detail') {
          const habit = habitDetailSchema.parse(makeHabitDetail())
          const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))
          await page.goto(`/habits/${habit.id}`)
          await page.getByRole('button', { name: messages.habits.detail.askAstra, exact: true }).click()
        } else {
          await page.goto('/')
          await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()
        }
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        await expect(conversation).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const header = conversation.locator('header')
        await expectSafeTop(header)
        const headerBox = await header.boundingBox()
        expect(headerBox!.y).toBe(top)
        await expectSafeTop(conversation.getByRole('button', { name: messages.common.closeConversation }))
        const composer = await conversation.locator('[data-composer-root]').boundingBox()
        expect(composer).not.toBeNull()
        expect(915 - composer!.y - composer!.height).toBeGreaterThanOrEqual(16)
      })
    }

    test('the onboarding popup keeps its header and actions inside the safe viewport', async ({ page, context }) => {
      await context.clearCookies()
      await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
      await page.goto('/onboarding')
      const popup = page.getByRole('dialog')
      await expect(popup).toBeVisible()
      await expectSafeTop(popup.locator('[data-shell-header]'))
      const geometry = await popup.evaluate((element) => {
        const shell = element.querySelector('[data-shell="wide"]')!
        const actions = element.querySelector('[data-shell-bottom]')!
        return { shellTop: shell.getBoundingClientRect().top, shellBottom: shell.getBoundingClientRect().bottom, actionsBottom: actions.getBoundingClientRect().bottom }
      })
      expect(geometry.shellTop).toBe(top)
      expect(geometry.shellBottom).toBe(915)
      expect(geometry.actionsBottom).toBeLessThanOrEqual(915)
    })

    test('the Wrapped player keeps the header below the inset', async ({ page, context }) => {
      await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`, (route) => route.fulfill({ json: recapResponseSchema.parse(createMockRecap()) }))
      await page.goto('/wrapped')
      await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
      await expectSafeTop(page.getByTestId('wrapped-header'))
      const header = await page.getByTestId('wrapped-header').boundingBox()
      expect(header!.y).toBe(top)
      await expectSafeTop(page.getByRole('button', { name: messages.wrapped.close }))
    })

    test('the command palette starts at the larger of its base offset and the inset', async ({ page }) => {
      await page.goto('/')
      await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
      const listOptionsMenu = page.getByRole('menu', { name: messages.habits.listOptions })
      await listOptionsMenu.getByRole('menuitem', { name: messages.habits.refresh }).click()
      await expect(listOptionsMenu).toHaveCount(0)
      await page.keyboard.press('Control+k')
      const palette = page.getByRole('dialog', { name: messages.command.title })
      await expectSafeTop(palette)
      const box = await palette.boundingBox()
      expect(box!.y).toBe(Math.max(16, top))
    })
  })
}

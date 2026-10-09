import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl } from '@orbit/shared/utils'
import { test } from './upgrade-fixtures'
import { LAYOUT_ORIGIN } from '../support/env'

test.use({ appLocale: 'en' })

for (const width of [320, 412, 600, 844]) {
  const height = width === 844 ? 390 : 915
  const left = width === 844 ? 44 : 0
  const right = left
  for (const top of width === 844 ? [0] : [0, 24, 48]) {
    const bottom = width === 844 ? 21 : top === 0 ? 0 : 34
    test.describe(`full-screen safe area at ${width}px with top ${top}px`, () => {
      test.use({ viewport: { width, height } })
      test.beforeEach(async ({ page }) => {
        const session = await page.context().newCDPSession(page)
        await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left, right } })
      })

      async function expectSafeTop(header: Locator) {
        await expect(header).toBeVisible()
        const box = await header.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y).toBeGreaterThanOrEqual(top)
        expect(box!.x).toBeGreaterThanOrEqual(left)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width - right)
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
            await expect(page.getByRole('group', { name: messages.shell.composer.suggestionsLabel, exact: true })
              .getByRole('button', { name: messages.shell.composer.chips.habitDetail.pauseThisWeek, exact: true })).toBeVisible()
            await page.locator('#orbit-main').getByRole('button', { name: messages.habits.detail.askAstra, exact: true }).click()
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
          expect(height - composer!.y - composer!.height).toBeGreaterThanOrEqual(bottom)
        })
      }

      test('the onboarding popup keeps its header and actions inside the safe viewport', async ({ page, context }) => {
        await context.clearCookies()
        await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
        await page.goto('/onboarding')
        const popup = page.getByRole('dialog')
        await expect(popup).toBeVisible()
        await expectSafeTop(popup.locator('[data-shell-header]'))
        expect((await popup.locator('[data-shell-header]').boundingBox())!.y).toBe(top)
        const actions = popup.locator('[data-shell-bottom] button')
        for (const action of await actions.all()) {
          const box = (await action.boundingBox())!
          expect(box.y + box.height).toBeLessThanOrEqual(height - bottom)
        }
        const geometry = await popup.evaluate((element) => {
          const shell = element.querySelector('[data-shell="wide"]')!
          const actions = element.querySelector('[data-shell-bottom]')!
          return { shellTop: shell.getBoundingClientRect().top, shellBottom: shell.getBoundingClientRect().bottom, actionsBottom: actions.getBoundingClientRect().bottom }
        })
        expect(geometry.shellTop).toBe(0)
        expect(geometry.shellBottom).toBe(height)
        expect(geometry.actionsBottom).toBeLessThanOrEqual(height)
      })

      test('the Wrapped player keeps the header below the inset', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`, (route) => route.fulfill({ json: recapResponseSchema.parse(createMockRecap()) }))
        await page.goto('/wrapped')
        const back = page.getByRole('button', { name: messages.common.backToProfile, exact: true })
        await expectSafeTop(back)
        expect((await back.boundingBox())!.y).toBe(top + 4)
        await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
        await expectSafeTop(page.getByTestId('wrapped-header'))
        const header = await page.getByTestId('wrapped-header').boundingBox()
        expect(header!.y).toBe(top)
        await expectSafeTop(page.getByRole('button', { name: messages.wrapped.close }))
        const pager = (await page.getByTestId('wrapped-pager').boundingBox())!
        expect(pager.y + pager.height).toBeLessThanOrEqual(height - bottom)
        await page.getByRole('button', { name: messages.wrapped.close, exact: true }).click()
        await page.evaluate(() => window.scrollTo(0, 0))
        await expectSafeTop(back)
        expect((await back.boundingBox())!.y).toBe(top + 4)
      })

      for (const state of ['loading', 'failed', 'empty'] as const) {
        test(`the Wrapped ${state} cover protects Back before Start and after closing the player`, async ({ page, context }) => {
          const readyRecap = recapResponseSchema.parse(createMockRecap())
          const emptyRecap = recapResponseSchema.parse(createMockRecap({
            metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }), goalCompletions: 0,
          }))
          let releaseLoading!: () => void
          const loading = new Promise<void>((resolve) => { releaseLoading = resolve })
          await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`, (route) => route.fulfill({ json: readyRecap }))
          await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('month')}`, async (route) => {
            if (state === 'loading') await loading
            await route.fulfill(state === 'failed' ? { status: 500, json: { message: 'Recap unavailable' } }
              : { json: state === 'empty' ? emptyRecap : readyRecap })
          })
          try {
            await page.goto('/wrapped?period=month')
            const cover = page.locator(`main [data-state="${state}"]`)
            const back = page.getByRole('button', { name: messages.common.backToProfile, exact: true })
            await expect(cover).toBeVisible()
            await expectSafeTop(back)
            expect((await back.boundingBox())!.y).toBe(top + 4)
            await page.getByRole('button', { name: messages.wrapped.periods.week, exact: true }).click()
            await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
            expect((await page.getByTestId('wrapped-header').boundingBox())!.y).toBe(top)
            await page.getByRole('button', { name: messages.wrapped.close, exact: true }).click()
            await page.evaluate(() => window.scrollTo(0, 0))
            await expectSafeTop(back)
            expect((await back.boundingBox())!.y).toBe(top + 4)
            await page.getByRole('button', { name: messages.wrapped.periods.month, exact: true }).click()
            await expect(cover).toBeVisible()
            await expectSafeTop(back)
            expect((await back.boundingBox())!.y).toBe(top + 4)
          } finally {
            releaseLoading()
          }
        })
      }

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
        const baseOffset = width >= 640 ? 96 : 16
        expect(box!.y).toBe(Math.max(baseOffset, top))
        expect(box!.y + box!.height).toBeLessThanOrEqual(height - bottom)
        const maximum = await palette.evaluate((element) => Number.parseFloat(getComputedStyle(element).maxHeight))
        expect(maximum).toBe(height - Math.max(baseOffset, top) - Math.max(16, bottom))
      })
    })
  }
}

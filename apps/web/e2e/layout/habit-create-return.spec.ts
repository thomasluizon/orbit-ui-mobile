import { expect, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession } from './profile-session'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

async function traceHistory(page: Page) {
  await page.addInitScript(() => {
    const snapshots: { step: string; href: string; state: unknown }[] = []
    function record(step: string) {
      snapshots.push({ step, href: location.href, state: structuredClone(history.state) as unknown })
    }
    Object.assign(window, { habitCreateHistory: snapshots })
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history)
      history[method] = (...args: Parameters<History[typeof method]>) => {
        original(args[0], args[1], args[2])
        record(method)
      }
    }
    window.addEventListener('popstate', () => record('popstate'), true)
    record('initial')
  })
}

for (const locale of ['pt-BR', 'en'] as const) {
  const messages = locale === 'en' ? en : ptBr
  for (const width of [412, 600]) {
    test.describe(`habit create return in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test.beforeEach(async ({ context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      })

      for (const entry of ['direct', 'from Today'] as const) {
        test(`returns to Today after creating from ${entry}`, async ({ page, context }, testInfo) => {
          const title = `Walk ${locale} ${width}`
          const habit = makeHabitScheduleItem({ title, children: [], hasSubHabits: false, tags: [], scheduledDates: ['2026-09-04'] })
          let created = false
          const submissions: string[] = []
          page.on('response', (response) => {
            if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/habits/new') return
            submissions.push(response.url())
            created = response.ok()
          })
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
            (route) => route.fulfill({ json: { ...emptyHabitsPageFixture, items: created ? [habit] : [], totalCount: created ? 1 : 0 } }))
          await traceHistory(page)
          try {
            if (entry === 'direct') {
              await page.goto('/habits/new?from=%2F')
            } else {
              await page.goto('/')
              await page.getByRole('button', { name: messages.habits.createManually, exact: true }).click()
              await expect(page).toHaveURL(/\/habits\/new\?/)
            }
            const field = page.getByRole('textbox', { name: messages.habits.form.describe, exact: true })
            await field.fill(title)
            await page.getByRole('button', { name: messages.habits.createHabit, exact: true }).click()
            await expect.poll(() => submissions.length).toBe(1)
            expect(created).toBe(true)
            await expect(page).toHaveURL(`${LAYOUT_ORIGIN}/`)
            await expect(page.locator('[data-habit-create-screen]')).toHaveCount(0)
            await expect(page.getByTestId('habit-row').filter({ hasText: title })).toBeVisible()
            expect(submissions).toHaveLength(1)
          } finally {
            const snapshots = await page.evaluate(() => Reflect.get(window, 'habitCreateHistory') as unknown)
            await testInfo.attach('habit-create-history', { body: JSON.stringify(snapshots, null, 2), contentType: 'application/json' })
          }
        })
      }

      test('preserves a dirty draft on browser Back until discard is confirmed', async ({ page }) => {
        await page.goto('/')
        await page.getByRole('button', { name: messages.habits.createManually, exact: true }).click()
        const field = page.getByRole('textbox', { name: messages.habits.form.describe, exact: true })
        await field.fill('Keep this draft')
        await page.evaluate(() => history.back())
        const discard = page.getByRole('button', { name: messages.common.discardChangesAction, exact: true })
        await expect(discard).toBeVisible()
        await page.getByRole('button', { name: messages.common.keepEditing, exact: true }).click()
        await expect(field).toHaveValue('Keep this draft')
        await expect(page).toHaveURL(/\/habits\/new\?/)
        await page.evaluate(() => history.back())
        await discard.click()
        await expect(page).toHaveURL(`${LAYOUT_ORIGIN}/`)
        await expect(page.locator('[data-habit-create-screen]')).toHaveCount(0)
      })

      test('returns a clean direct-open form on browser Back without confirmation', async ({ page }) => {
        await page.goto('/habits/new?from=%2F')
        await expect(page.getByRole('textbox', { name: messages.habits.form.describe, exact: true })).toHaveValue('')
        await page.evaluate(() => history.back())
        await expect(page).toHaveURL(`${LAYOUT_ORIGIN}/`)
        await expect(page.getByRole('button', { name: messages.common.discardChangesAction, exact: true })).toHaveCount(0)
      })
    })
  }
}

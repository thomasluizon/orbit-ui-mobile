import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test as subscriptionTest } from './upgrade-fixtures'

const habitId = 'habit-1'
const habit = habitDetailSchema.parse(makeHabitDetail())
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

const destinations = [
  ['Hoje', '/'],
  ['Calendário', '/calendar'],
  ['Progresso', '/progress'],
  ['Perfil', '/profile'],
  ['Habit detail', `/habits/${habitId}`],
  ['Sobre', '/about'],
  ['Avisos', '/notifications'],
  ['Busca', '/search'],
  ['Support', '/support'],
  ['Onboarding', '/onboarding'],
  ['Not found', '/layout-missing'],
] as const

for (const width of [412, 1280] as const) {
  test.describe(`shell scroller at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const [name, path] of destinations) {
      test(`${name} clears the pinned chrome`, async ({ page, context }) => {
        if (name === 'Habit detail') {
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))
        }
        await page.goto(path)
        if (name === 'Onboarding') await expect(page.getByRole('dialog')).toBeVisible()
        if (name === 'Habit detail') await expect(page.getByRole('heading', { name: habit.title })).toBeVisible()
        const hasComposer = ['Hoje', 'Habit detail'].includes(name)
        const hasPinnedSlot = hasComposer || name === 'Onboarding'
        const clearance = width < 1024 && hasPinnedSlot ? 96 : 32
        await expect(page.locator('[data-composer-root]')).toHaveCount(hasComposer ? 1 : 0)
        await expect(page.locator('[data-shell-pinned-slot]')).toHaveCount(hasPinnedSlot ? 1 : 0)
        await expect(page.locator('[data-flow-action]')).toHaveCount(name === 'Onboarding' ? 1 : 0)
        const scroller = page.locator('[data-shell-scroller]').last()
        const chrome = page.locator('[data-shell-bottom]').last()
        await expect(scroller).toBeVisible()
        await expect(chrome).toBeAttached()
        await page.evaluate(() => document.fonts.ready)

        const geometry = await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight
          const lastContent = Array.from(element.children)
            .filter((child) => !child.hasAttribute('data-shell-scroll-origin') && child.getBoundingClientRect().height > 0)
            .at(-1)
          const bottom = Array.from(document.querySelectorAll('[data-shell-bottom]')).at(-1)
          if (!lastContent || !bottom) return null
          return {
            clearance: bottom.getBoundingClientRect().top - lastContent.getBoundingClientRect().bottom,
            padding: Number.parseFloat(getComputedStyle(element).paddingBottom),
          }
        })

        expect(geometry, `${name} has measurable shell content`).not.toBeNull()
        expect(geometry!.padding, `${name} shell owns the clearance`).toBe(clearance)
        expect(geometry!.clearance, `${name} last content clears pinned chrome`).toBeGreaterThanOrEqual(clearance - 1)
      })
    }

    test('Perfil ending card clears navigation without composer space', async ({ page }) => {
      const clearance = 32
      await page.goto('/profile')
      const ending = page.getByTestId('profile-settings-group-ending')
      await expect(ending).toBeVisible()
      const scroller = page.locator('[data-shell-scroller]')
      const distance = await ending.evaluate((element) => {
        const shellScroller = element.closest('[data-shell-scroller]')
        if (!shellScroller) return null
        shellScroller.scrollTop = shellScroller.scrollHeight
        const card = element.lastElementChild
        const chrome = document.querySelector('[data-shell-bottom]')
        if (!card || !chrome) return null
        return chrome.getBoundingClientRect().top - card.getBoundingClientRect().bottom
      })
      await expect(scroller).toBeVisible()
      expect(distance).not.toBeNull()
      expect(distance!).toBeGreaterThanOrEqual(clearance - 1)
    })

    for (const path of ['/privacy', '/terms'] as const) {
      test(`${path} has no unused pinned-chrome clearance`, async ({ page }) => {
        await page.goto(path)
        const scroller = page.locator('[data-shell-scroller]')
        await expect(scroller).toBeVisible()
        await expect(page.locator('[data-shell-bottom]')).toHaveCount(0)
        expect(await scroller.evaluate((element) => getComputedStyle(element).paddingBottom)).toBe('0px')
      })
    }
  })
}

for (const width of [412, 1280] as const) {
  const clearance = 32
  for (const subscriptionState of ['free', 'stripe'] as const) {
    subscriptionTest.describe(`${subscriptionState === 'free' ? 'Pro' : 'Assinatura'} shell scroller at ${width}px`, () => {
      subscriptionTest.use({ appLocale: 'en', subscriptionState, viewport: { width, height: 915 } })

      subscriptionTest('clears the pinned chrome after content loads', async ({ page }) => {
        await page.goto('/upgrade')
        const screen = page.locator('[data-upgrade-screen]')
        await expect(screen.getByText(subscriptionState === 'free'
          ? en.upgrade.convert.freeEyebrow
          : en.upgrade.billing.usage.title, { exact: true })).toBeVisible()
        const clearanceAtEnd = await page.locator('[data-shell-scroller]').evaluate((element) => {
          element.scrollTop = element.scrollHeight
          const lastContent = element.lastElementChild
          const chrome = document.querySelector('[data-shell-bottom]')
          if (!lastContent || !chrome) return null
          return chrome.getBoundingClientRect().top - lastContent.getBoundingClientRect().bottom
        })
        expect(clearanceAtEnd).not.toBeNull()
        expect(clearanceAtEnd!).toBeGreaterThanOrEqual(clearance - 1)
      })
    })
  }
}

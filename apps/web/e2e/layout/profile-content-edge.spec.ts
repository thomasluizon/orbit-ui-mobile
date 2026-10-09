import { expect, type Locator } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { completeInstallOnboarding } from './install-onboarding'

const selectedDate = '2026-09-04'
const habits = [0, 1, 2].map((position) => makeHabitScheduleItem({
  id: `profile-edge-habit-${position}`, title: `Habit ${position}`, position,
  children: [], hasSubHabits: false, scheduledDates: [selectedDate], dueDate: selectedDate,
}))

async function assertRowEdge(row: Locator, expectedLeft: number) {
  await expect(row).toBeVisible()
  const bounds = await row.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, width: rect.width }
  })
  expect(Math.abs(bounds.left - expectedLeft)).toBeLessThanOrEqual(0.5)
  expect(bounds.width).toBeLessThanOrEqual(560)
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [412, 600, 840, 1280]) {
    test(`Perfil and every sub-screen share Hoje's content edge at ${width}px in ${locale}`, async ({ page, context }) => {
      const words = locale === 'en' ? en : ptBr
      await page.setViewportSize({ width, height: 915 })
      await completeInstallOnboarding(page)
      await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
      const profile = profileSchema.parse({ ...profileFixture, language: locale, marketingEmailConsent: true })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
      await setLayoutFixtureSession(context, [{ path: API.habits.list, body: { ...emptyHabitsPageFixture, items: habits, totalCount: habits.length } }])
      await page.goto(`/?date=${selectedDate}`)
      await page.getByRole('button', { name: words.habits.listOptions }).click()
      await page.getByRole('menu', { name: words.habits.listOptions })
        .getByRole('menuitem', { name: words.habits.refresh }).click()
      await expect(page.getByTestId('habit-row')).toHaveCount(habits.length)
      await expect(page.getByTestId('habit-row').first()).toHaveAttribute('data-habit-title', habits[0]!.title)
      await page.evaluate(() => document.fonts.ready)
      const todayLeft = await page.getByTestId('habit-row').first().evaluate((element) => element.getBoundingClientRect().left)

      await page.goto('/profile')
      const groups = page.getByTestId('profile-settings-groups')
      const accountRow = page.getByTestId('profile-settings-group-you').locator('.orbit-row-list > div').first()
      await expect(accountRow).toContainText(profile.name)
      await page.evaluate(() => document.fonts.ready)
      await assertRowEdge(accountRow, todayLeft)
      expect(await groups.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(560)
      for (const panel of await groups.locator('.orbit-row-list').all()) await assertRowEdge(panel, todayLeft)
      if (width === 600 || width === 840) {
        const bellInset = await page.locator('[data-root-notification-header]').evaluate((element) =>
          element.getBoundingClientRect().left + 16)
        expect(Math.abs(bellInset - todayLeft)).toBeLessThanOrEqual(0.5)
        await assertRowEdge(accountRow, bellInset)
      }

      for (const screen of ['account', 'preferences', 'astra', 'notifications']) {
        await page.goto(`/profile/${screen}`)
        const group = page.getByTestId(`profile-settings-group-${screen}`)
        const firstRow = group.locator('.orbit-row-list > div').first()
        await expect(firstRow).toBeVisible()
        await expect(group.locator('[aria-busy="true"]')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await assertRowEdge(firstRow, todayLeft)
        expect(await group.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(560)
        if (screen === 'astra') await assertRowEdge(group.getByTestId('astra-allowance-panel'), todayLeft)
        const back = page.getByRole('button', { name: words.common.backToProfile })
        await expect(back).toBeVisible()
        const backLeft = await back.evaluate((element) => element.getBoundingClientRect().left)
        expect(Math.abs(backLeft + 8 - todayLeft)).toBeLessThanOrEqual(0.5)
      }
    })
  }
}

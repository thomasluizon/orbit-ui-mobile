import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { notificationsFixture } from '../../test-support/hermetic/mock-api/fixtures/secondary'
import { LAYOUT_ORIGIN } from '../support/env'
import { agendaCalendarMonth } from './calendar-agenda-fixtures'
import { completeInstallOnboarding } from './install-onboarding'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({
  ...agendaCalendarMonth,
  habits: agendaCalendarMonth.habits.map((habit) => ({ ...habit, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] })),
  logs: {},
})

async function edges(element: Locator) {
  await expect(element).toBeVisible()
  return element.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right }
  })
}

async function expectContentEdges(elements: Locator, reference: { left: number; right: number }, width: number, cap = 560) {
  const expectedRight = width < 1024 ? reference.right : Math.min(reference.right, reference.left + cap)
  await expect(elements.first()).toBeVisible()
  expect(await elements.count()).toBeGreaterThan(0)
  for (const element of [elements.first(), elements.last()]) {
    const bounds = await edges(element)
    expect(bounds.left).toBeCloseTo(reference.left, 0)
    expect(bounds.right).toBeCloseTo(expectedRight, 0)
  }
}

for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
  for (const width of [600, 840, 1352]) {
    for (const subscriptionState of ['stripe', 'free'] as const) {
      test.describe(`${locale} content caps at ${width}px with ${subscriptionState}`, () => {
        test.use({ appLocale: locale, subscriptionState, viewport: { width, height: 1400 }, layoutProfile: { weekStartDay: 1 } })

        test('matches the calendar switch edges across every capped surface', async ({ page, context }) => {
          await completeInstallOnboarding(page)
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
            (route) => route.fulfill({ json: calendarMonth }))
          const items = [0, 1, 2].map((index) => createMockNotification({ id: `content-edge-${index}`, title: `Message ${index}` }))
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.notifications.list,
            (route) => route.fulfill({ json: notificationsResponseSchema.parse({ ...notificationsFixture, items, unreadCount: items.length }) }))

          await page.goto('/calendar')
          const selector = page.getByTestId('calendar-header-group').getByRole('radiogroup')
          const reference = await edges(selector)
          await selector.getByRole('radio', { name: words.calendar.view.agenda, exact: true }).click()
          const agenda = page.getByTestId('calendar-agenda-view')
          await expect(agenda).toHaveAttribute('aria-busy', 'false')
          await expect(agenda.locator('.orbit-list-row-body')).toHaveCount(calendarMonth.habits.length)
          await expectContentEdges(agenda.getByTestId('calendar-agenda-day'), reference, width)

          await page.goto('/profile')
          const profile = page.getByTestId('profile-settings-groups')
          await expectContentEdges(profile.locator('.orbit-row-list > *'), reference, width)
          for (const screen of ['account', 'preferences', 'astra', 'notifications']) {
            await page.goto(`/profile/${screen}`)
            const group = page.getByTestId(`profile-settings-group-${screen}`)
            await expect(group.locator('[aria-busy="true"]')).toHaveCount(0)
            await expectContentEdges(group.locator('.orbit-row-list > *'), reference, width)
            if (screen === 'astra') await expectContentEdges(group.getByTestId('astra-allowance-panel'), reference, width)
          }

          await page.goto('/notifications')
          const notifications = page.getByRole('list', { name: words.notifications.title, exact: true }).locator(':scope > li')
          await expect(notifications).toHaveCount(items.length)
          await expectContentEdges(notifications, reference, width)

          await page.goto('/upgrade')
          const upgrade = page.locator('[data-upgrade-screen]')
          await expect(upgrade).toHaveAttribute('aria-busy', 'false')
          await expect(upgrade.getByRole('heading', { level: 2 }).first()).toBeVisible()
          await expectContentEdges(upgrade.locator(':scope > div > div > *'), reference, width, subscriptionState === 'free' ? 652 : 560)

          await page.goto('/about')
          const about = page.getByTestId('about-content')
          await expectContentEdges(about.locator(':scope > *'), reference, width, 620)
          await expect(page.getByTestId('about-fact-account-label')).toBeVisible()
          for (const label of await about.getByTestId('about-facts').locator('[data-testid$="-label"]').all()) {
            expect((await edges(label)).left).toBeCloseTo(reference.left, 0)
          }
        })
      })
    }
  }
}

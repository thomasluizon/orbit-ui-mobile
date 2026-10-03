import { expect, type BrowserContext, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent, createMockGoal, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { retrospectiveResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { calendarMonthResponseSchema, createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'
import { expectLabelsFit, expectLegendFits, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

const reviewDay = '2026-09-04'
const userFields = {
  habitTitle: 'Caminhar pelo bairro depois do trabalho e conversar com os amigos',
  goalTitle: 'Ler os livros que escolhi para aprender uma nova habilidade',
  eventTitle: 'Reunião de planejamento com todas as pessoas da minha equipe',
  calendarName: 'Meu calendário pessoal de compromissos e encontros',
  name: 'Pessoa com um nome completo escrito no próprio perfil',
  email: 'pessoa.com.um.endereco.longo@exemplo.org',
} as const

const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: userFields.habitTitle, children: [], hasSubHabits: false,
  dueDate: reviewDay, scheduledDates: [reviewDay],
}))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture, items: [habit], totalCount: 1,
})
const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal({ title: userFields.goalTitle })],
  page: 1, pageSize: 100, totalPages: 1, totalCount: 1,
})
const events = calendarEventsResponseSchema.parse([createMockCalendarSyncEvent({
  title: userFields.eventTitle, calendarName: userFields.calendarName, startDate: reviewDay, startTime: '09:00',
})])
const retrospective = retrospectiveResponseSchema.parse({
  period: 'month', metrics: createMockRetrospectiveMetrics({
    topHabits: [{ ...createMockRetrospectiveMetrics().topHabits[0]!, name: userFields.habitTitle }],
    weeklyConsistency: [0, 0, 100, 0, 0, 0, 0],
  }),
  narrative: { highlights: '', missed: '', trends: '', suggestion: '' }, fromCache: false,
})
const streak = streakInfoSchema.parse({
  currentStreak: 7, longestStreak: 14, lastActiveDate: reviewDay,
  freezesUsedThisMonth: 1, freezesAvailable: 1, maxFreezesPerMonth: 3,
  isFrozenToday: false, recentFreezeDates: [], streakFreezesAccumulated: 1,
})

async function installLabelFixtures(context: BrowserContext, locale: 'en' | 'pt-BR') {
  const profile = profileSchema.parse({
    ...profileFixture, name: userFields.name, email: userFields.email,
    language: locale, hasProAccess: true, canViewGamification: true,
  })
  await setLayoutProfileSession(context, profile)
  const responses: ReadonlyArray<readonly [string, unknown]> = [
    [API.profile.get, profile], [API.habits.list, habits], [API.goals.list, goals],
    [API.habits.retrospective, retrospective], [API.gamification.streak, streak],
    [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: [habit], logs: {} })],
    [API.calendar.events, events],
  ]
  for (const [path, response] of responses) {
    await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path,
      (route) => route.fulfill({ json: response }))
  }
}

async function checkSurfaceLabels(page: Page) {
  await markUserText(page, Object.values(userFields))
  await expectLabelsFit(page)
}

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} label contract at ${width}px`, () => {
      test.use({ appLocale: locale, subscriptionState: 'trial', viewport: { width, height: 915 } })
      test.beforeEach(async ({ context }) => installLabelFixtures(context, locale))

      test('Progress captions and selector remain whole', async ({ page }) => {
        await page.goto('/progress')
        await expect(page.getByText(userFields.goalTitle, { exact: true })).toBeVisible()
        for (const caption of [
          words.progressScreen.window.completionRate, words.progressScreen.window.activeDays,
          words.progressScreen.window.bestWeekday, words.progressScreen.window.topHabit,
          words.progressScreen.streak.longest, words.streakDisplay.detail.tierTileLabel,
          words.progressScreen.streak.banked, words.progressScreen.streak.used, words.progressScreen.streak.next,
        ]) await markRequiredLabels(page.getByText(caption, { exact: true }))
        const selector = page.getByRole('radiogroup', { name: words.progressScreen.goals.views })
        await expect(selector.getByRole('radio')).toHaveCount(4)
        await checkSurfaceLabels(page)
      })

      test('Progress legend remains whole', async ({ page }) => {
        await page.goto('/progress')
        await expectLegendFits(page.getByRole('group', { name: words.progressScreen.streak.legend }))
        await checkSurfaceLabels(page)
      })

      test('Today tabs, buttons and menu titles remain whole', async ({ page }) => {
        await page.goto(`/?date=${reviewDay}`)
        await expect(page.locator('[data-habit-row-body]')).toBeVisible()
        await checkSurfaceLabels(page)
        await page.getByRole('button', { name: words.habits.listOptions, exact: true }).click()
        await expect(page.getByRole('menu', { name: words.habits.listOptions })).toBeVisible()
        await checkSurfaceLabels(page)
      })

      test('Calendar selector and legend remain whole', async ({ page }) => {
        await page.goto('/calendar')
        await expect(page.getByRole('radio', { name: words.calendar.view.month, exact: true })).toBeVisible()
        for (const caption of Object.values(words.calendar.legend)) {
          await markRequiredLabels(page.getByText(caption, { exact: true }))
        }
        const legend = page.locator('[data-legend-outcome="full"]').locator('..').locator('..')
        await expect(legend.locator(':scope > span')).toHaveCount(4)
        const rows = await legend.locator(':scope > span').evaluateAll((elements) =>
          elements.map((element) => Math.round(element.getBoundingClientRect().top)))
        expect.soft(new Set(rows).size, 'Calendar legend stays in one row or moves behind disclosure').toBe(1)
        await checkSurfaceLabels(page)
      })

      test('Profile row titles remain whole with long personal text', async ({ page }) => {
        await page.goto('/profile')
        await expect(page.locator('[data-slot="list-row-title"]').first()).toBeVisible()
        await checkSurfaceLabels(page)
        await expect(page.locator('[data-layout-text-origin="user"]')).not.toHaveCount(0)
      })

      test('hover and press fills follow Principle 3', async ({ page }) => {
        await page.goto(`/?date=${reviewDay}`)
        const listOptions = page.getByRole('button', { name: words.habits.listOptions, exact: true })
        await listOptions.click()
        await expect(page.getByRole('menu', { name: words.habits.listOptions })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menu')).toHaveCount(0)
        const tabBar = page.locator('[data-shell="wide"] [data-shell-tab-bar]')
        await expect(tabBar).toHaveCount(1)
        await expect(tabBar).toBeVisible()
        await expect(page.locator('[data-shell-sidebar]')).toBeHidden()
        for (const label of [words.dates.previousDay, words.dates.nextDay, words.habits.listOptions]) {
          await expectInteractionFill(page.getByRole('button', { name: label, exact: true }))
        }
        await expectInteractionFill(tabBar.locator('nav > button').last())
        await page.getByRole('button', { name: words.habits.listOptions, exact: true }).click()
        await expectInteractionFill(page.getByRole('menu', { name: words.habits.listOptions })
          .getByRole('menuitem', { name: words.habits.refresh, exact: true }))
        await page.goto('/calendar')
        await expectInteractionFill(page.getByRole('radiogroup').getByRole('radio', { checked: false }).first())
        await page.goto('/profile')
        await expectInteractionFill(page.locator('.orbit-list-row-body').last())
      })
    })
  }
}

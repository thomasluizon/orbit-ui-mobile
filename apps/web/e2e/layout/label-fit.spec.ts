import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent, createMockGoal, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { retrospectiveResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { calendarMonthResponseSchema, createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema, type Profile } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, expectLegendFits, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

const reviewDay = '2026-09-04'
const userFields = {
  habitTitle: 'Caminhar pelo bairro depois do trabalho e conversar com os amigos',
  timedHabitTitle: 'Ler o livro que escolhi antes de começar o trabalho',
  parentHabitTitle: 'Preparar tudo para os compromissos da próxima semana',
  childHabitTitle: 'Organizar os materiais que vou levar para os encontros',
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
  ...emptyHabitsPageFixture,
  items: [
    { ...habit, dueDate: '2026-09-03', isOverdue: true },
    makeHabitScheduleItem({
      id: 'timed-habit', title: userFields.timedHabitTitle, children: [], hasSubHabits: false,
      dueDate: reviewDay, dueTime: '08:00:00', scheduledDates: [reviewDay],
    }),
    makeHabitScheduleItem({
      id: 'parent-habit', title: userFields.parentHabitTitle, dueDate: reviewDay, scheduledDates: [reviewDay],
      children: [makeHabitScheduleItem({
        id: 'child-habit', title: userFields.childHabitTitle, children: [], hasSubHabits: false,
        dueDate: reviewDay, scheduledDates: [reviewDay],
      })],
    }),
  ], totalCount: 3,
})
const goals = paginatedGoalResponseSchema.parse({
  items: [createMockGoal({ title: userFields.goalTitle })],
  page: 1, pageSize: 100, totalPages: 1, totalCount: 1,
})
const events = calendarEventsResponseSchema.parse([createMockCalendarSyncEvent({
  title: userFields.eventTitle, calendarName: userFields.calendarName, startDate: reviewDay, startTime: '09:00',
})])
const calendars = userCalendarsSchema.parse([
  { id: 'calendar-1', name: userFields.calendarName, accessRole: 'owner', primary: true, backgroundColor: null, isSynced: true },
  { id: 'calendar-2', name: 'Trabalho', accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true },
])
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

async function installLabelFixtures(context: BrowserContext, profile: Profile) {
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

async function checkSurfaceLabels(page: Page, surface: Page | Locator = page, requiredUserValues: readonly string[] = []) {
  await markUserText(page, Object.values(userFields))
  await expectLabelsFit(page, surface, requiredUserValues)
}

async function checkProgressLabels(page: Page, words: typeof en | typeof ptBR) {
  await expect(page.locator(`[data-goal-id="${goals.items[0]!.id}"]`).getByText(userFields.goalTitle, { exact: true })).toBeVisible()
  await expect(page.locator('[data-component="freeze-bank"]')).toBeVisible()
  await expect(page.getByTestId('progress-top-habit').getByText(userFields.habitTitle)).toBeVisible()
  for (const caption of [
    words.progressScreen.window.completionRate, words.progressScreen.window.activeDays,
    words.progressScreen.window.bestWeekday, words.progressScreen.window.topHabit,
    words.progressScreen.streak.longest, words.streakDisplay.detail.tierTileLabel,
    words.progressScreen.streak.banked, words.progressScreen.streak.used, words.progressScreen.streak.next,
  ]) await markRequiredLabels(page.getByText(caption, { exact: true }))
  await checkSurfaceLabels(page, page, [userFields.goalTitle, userFields.habitTitle])
}

async function checkCalendarLabels(page: Page, words: typeof en | typeof ptBR) {
  await expect(page.getByRole('radio', { name: words.calendar.view.month, exact: true })).toBeVisible()
  const dayCard = page.locator('section[data-field-surface="card"]').filter({ has: page.getByText(userFields.habitTitle, { exact: true }) })
  await expect(dayCard.getByRole('button', { name: userFields.habitTitle, exact: true })
    .getByText(userFields.habitTitle, { exact: true })).toBeVisible()
  const eventRow = dayCard.getByRole('button').filter({ has: page.getByText(userFields.eventTitle, { exact: true }) })
  await expect(eventRow.getByText(userFields.eventTitle, { exact: true })).toBeVisible()
  await expect(eventRow.getByText(userFields.calendarName)).toBeVisible()
  await markRequiredLabels(eventRow)
  await checkSurfaceLabels(page, page, [userFields.habitTitle, userFields.eventTitle, userFields.calendarName])
}

async function checkTodayLabels(page: Page, words: typeof en | typeof ptBR) {
  const rows = page.getByTestId('habit-row')
  for (const title of [userFields.habitTitle, userFields.timedHabitTitle, userFields.parentHabitTitle]) {
    await expect(rows.locator('[data-habit-row-body]').getByText(title, { exact: true })).toBeVisible()
  }
  await expect(rows.filter({ has: page.getByText(userFields.habitTitle, { exact: true }) })
    .locator('[data-habit-row-meta]').getByText(words.habits.overdue, { exact: true })).toBeVisible()
  await expect(rows.filter({ has: page.getByText(userFields.timedHabitTitle, { exact: true }) })
    .locator('[data-habit-row-meta]')).toHaveText('08:00')
  await expect(rows.filter({ has: page.getByText(userFields.parentHabitTitle, { exact: true }) })
    .locator('[data-habit-row-meta]')).toHaveText(words.habits.rowProgress.replace('{done}', '0').replace('{total}', '1'))
  await checkSurfaceLabels(page, page, [userFields.habitTitle, userFields.timedHabitTitle, userFields.parentHabitTitle])
}

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} label contract at ${width}px`, () => {
      const profile = profileSchema.parse({
        ...profileFixture, name: userFields.name, email: userFields.email,
        language: locale, hasProAccess: true, canViewGamification: true,
      })
      test.use({
        appLocale: locale, subscriptionState: 'trial', viewport: { width, height: 915 },
        layoutProfile: profile, layoutCalendars: [calendars, { scope: 'test' }],
      })
      test.beforeEach(async ({ context }) => installLabelFixtures(context, profile))

      test('Progress captions and selector remain whole', async ({ page }) => {
        await page.goto('/progress')
        await checkProgressLabels(page, words)
        await page.getByRole('button', {
          name: `${words.progressScreen.goals.filter}: ${words.progressScreen.goals.all}`, exact: true,
        }).click()
        const sheet = page.getByRole('dialog', { name: words.progressScreen.goals.views, exact: true })
        await expect(sheet).toBeVisible()
        await markRequiredLabels(sheet.getByRole('heading', { name: words.progressScreen.goals.views, exact: true }))
        const selector = sheet.getByRole('menu', { name: words.progressScreen.goals.views, exact: true })
        await expect(selector.getByRole('menuitemcheckbox')).toHaveCount(4)
        for (const label of [
          words.progressScreen.goals.all, words.progressScreen.goals.active,
          words.progressScreen.goals.completed, words.progressScreen.goals.abandoned,
        ]) await markRequiredLabels(selector.getByRole('menuitemcheckbox', { name: label, exact: true }))
        await checkSurfaceLabels(page, sheet)
      })

      test('Progress legend remains whole', async ({ page }) => {
        await page.goto('/progress')
        await checkProgressLabels(page, words)
        await page.getByRole('button', { name: words.progressScreen.streak.legend, exact: true }).click()
        const sheet = page.getByRole('dialog', { name: words.progressScreen.streak.legend, exact: true })
        await markRequiredLabels(sheet.getByRole('heading', { name: words.progressScreen.streak.legend, exact: true }))
        await expectLegendFits(sheet, [
          words.progressScreen.streak.active, words.progressScreen.streak.frozen, words.progressScreen.streak.missed,
        ])
        await checkSurfaceLabels(page, sheet)
      })

      test('Today tabs, buttons and menu titles remain whole', async ({ page }) => {
        await page.goto(`/?date=${reviewDay}`)
        await checkTodayLabels(page, words)
        await page.getByRole('button', { name: words.habits.listOptions, exact: true }).click()
        const sheet = page.getByRole('dialog', { name: words.habits.listOptions, exact: true })
        await expect(sheet.getByRole('menu', { name: words.habits.listOptions, exact: true })).toBeVisible()
        await checkSurfaceLabels(page, sheet)
        await sheet.getByRole('button', { name: words.common.close, exact: true }).click()
        await expect(sheet).toHaveCount(0)
        await checkTodayLabels(page, words)
      })

      test('Calendar selector and legend remain whole', async ({ page }) => {
        await page.goto('/calendar')
        await checkCalendarLabels(page, words)
        await page.getByRole('button', { name: words.calendar.options, exact: true }).click()
        await page.getByRole('menu', { name: words.calendar.options, exact: true })
          .getByRole('menuitem', { name: words.calendar.legendTitle, exact: true }).click()
        const sheet = page.getByRole('dialog', { name: words.calendar.legendTitle, exact: true })
        await markRequiredLabels(sheet.getByRole('heading', { name: words.calendar.legendTitle, exact: true }))
        await expect(sheet.locator('[data-legend-outcome]')).toHaveCount(4)
        await expectLegendFits(sheet, [
          words.calendar.legend.full, words.calendar.legend.partial, words.calendar.legend.none, words.calendar.legend.loggable,
        ])
        await checkSurfaceLabels(page, sheet)
      })

      test('Profile row titles remain whole with long personal text', async ({ page }) => {
        await page.goto('/profile')
        const profile = page.getByRole('main')
        const accountRow = profile.locator('a[href="/profile/account"]')
        await expect(accountRow.getByText(userFields.name, { exact: true })).toBeVisible()
        await expect(accountRow.getByText(userFields.email, { exact: true })).toBeVisible()
        await checkSurfaceLabels(page, page, [userFields.name, userFields.email])
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

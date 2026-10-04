import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { gamificationProfileSchema, retrospectiveResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { profileSchema } from '@orbit/shared/types/profile'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { emptyGoalsPageFixture, emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { gamificationProfileFixture } from '../../test-support/hermetic/mock-api/fixtures/gamification'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

async function expectEmptyTitle(page: Page, surface: Page | Locator, title: string) {
  const label = surface.locator('[data-mark] > p').filter({ hasText: title })
  await expect(label).toHaveCount(1)
  await expect(label).toHaveText(title)
  await markRequiredLabels(label)
  const invitation = label.locator('..')
  await expectLabelsFit(page, invitation)
  const actionsWithoutPillHitExtension = invitation.locator('button:not(.orbit-pill-action), a:not(.orbit-pill-action)')
  for (const action of await actionsWithoutPillHitExtension.all()) await expectInteractionFill(action)
}

for (const width of [320, 360, 384, 412]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    test.describe(`EmptyState labels at ${width}px in ${locale}`, () => {
      const words = locale === 'pt-BR' ? ptBR : en
      const profile = profileSchema.parse({
        ...profileFixture, language: locale, plan: 'pro', hasProAccess: true,
        canViewGamification: true, hasGoogleConnection: true, totalXp: 1, currentStreak: 1, longestStreak: 1,
      })
      test.use({ viewport: { width, height: 915 }, appLocale: locale, subscriptionState: 'trial', layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        const responses: ReadonlyArray<readonly [string, unknown]> = [
          [API.profile.get, profile], [API.goals.list, emptyGoalsPageFixture], [API.habits.list, emptyHabitsPageFixture],
          [API.gamification.profile, gamificationProfileSchema.parse({
            ...gamificationProfileFixture, totalXp: 1, currentStreak: 1, longestStreak: 1, isPro: true, achievementsLocked: false,
          })],
          [API.gamification.streak, streakInfoSchema.parse({
            currentStreak: 1, longestStreak: 1, lastActiveDate: '2026-09-04',
            freezesUsedThisMonth: 0, freezesAvailable: 0, maxFreezesPerMonth: 3,
            isFrozenToday: false, recentFreezeDates: [],
          })],
          [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: [], logs: {} })],
          [API.habits.retrospective, retrospectiveResponseSchema.parse({
            period: 'month', metrics: createMockRetrospectiveMetrics({ topHabits: [] }),
            narrative: { highlights: '', missed: '', trends: '', suggestion: '' }, fromCache: false,
          })],
          [API.calendar.events, calendarEventsResponseSchema.parse([])],
          [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({
            enabled: true, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true,
          })],
          [API.calendar.autoSyncSuggestions, []],
        ]
        for (const [path, response] of responses) {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path,
            (route) => route.fulfill({ json: response }))
        }
      })

      test('Progress names empty goals and achievements on one line', async ({ page }) => {
        await page.goto('/progress')
        for (const title of [words.progressScreen.goals.empty, words.progressScreen.achievements.empty]) {
          await expectEmptyTitle(page, page, title)
        }
      })

      test('the empty Astra conversation keeps its invitation whole', async ({ page }) => {
        await page.goto('/')
        await page.locator('[data-open-conversation]').click()
        await expectEmptyTitle(page, page, words.chat.empty.title)
      })

      for (const review of [false, true]) {
        test(`calendar ${review ? 'review' : 'import'} keeps its empty title whole`, async ({ page }) => {
          await page.goto(review ? '/calendar?mode=review' : '/calendar?import=1')
          const sheet = page.getByRole('dialog', { name: review ? words.calendar.autoSync.reviewModeTitle : words.calendar.calendars.title, exact: true })
          await expect(sheet).toBeVisible()
          await expectEmptyTitle(page, sheet, review ? words.calendar.autoSync.reviewModeEmpty : words.calendar.noEvents)
        })
      }
    })
  }
}

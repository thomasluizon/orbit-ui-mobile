import { createTranslator } from 'next-intl'
import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import {
  matchesProgressGoalsRequest, progressGoalsEmptyGamification, progressGoalsEmptyPage,
  progressGoalsEmptyProfile, progressGoalsEmptyStreak,
} from './progress-goals-empty-fixtures'

async function expectGoalsWell(well: Locator) {
  await expect(well).toBeVisible()
  expect(await well.evaluate((element) => {
    const style = getComputedStyle(element)
    const token = document.createElement('div')
    token.style.backgroundColor = 'var(--bg-well)'
    element.append(token)
    const expectedFill = getComputedStyle(token).backgroundColor
    token.remove()
    return { matchesFill: style.backgroundColor === expectedFill, radius: style.borderRadius,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      gap: style.gap, alignment: style.alignItems }
  })).toMatchObject({ matchesFill: true, radius: '12px', padding: ['16px', '16px', '16px', '16px'], gap: '8px', alignment: 'flex-start' })
  expect(await well.locator('p').evaluate((line) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--fg-2)'
    line.append(probe)
    const style = getComputedStyle(line)
    const matches = style.color === getComputedStyle(probe).color
    probe.remove()
    return { fontSize: style.fontSize, matches }
  })).toEqual({ fontSize: '14px', matches: true })
  await expect(well.locator('[data-empty-state-mark]')).toHaveCount(0)
}

for (const locale of ['pt-BR', 'en'] as const) {
  const words = locale === 'pt-BR' ? ptBR : en
  const t = createTranslator({ locale, messages: words })
  for (const mode of ['dark', 'light'] as const) {
    for (const viewport of [{ width: 1352, height: 706 }, { width: 1100, height: 706 }, { width: 412, height: 915 }]) {
      test.describe(`Progress goals in ${locale} ${mode} at ${viewport.width}`, () => {
        test.use({ appLocale: locale, subscriptionState: 'trial', layoutProfile: { ...progressGoalsEmptyProfile, language: locale, themePreference: mode }, viewport, colorScheme: mode })
        test('keeps the section empty state compact, figures shared and legend in freeze details', async ({ page, context }) => {
          await context.route(`${LAYOUT_ORIGIN}${API.gamification.profile}`, (route) => route.fulfill({ json: progressGoalsEmptyGamification }))
          await context.route(`${LAYOUT_ORIGIN}${API.gamification.streak}`, (route) => route.fulfill({ json: progressGoalsEmptyStreak }))
          let goalPage = progressGoalsEmptyPage
          await context.route(matchesProgressGoalsRequest, (route) => route.fulfill({ json: goalPage }))
          await page.goto('/progress/goals')
          await expect(page.locator('html')).toHaveClass(new RegExp(mode))
          const section = page.locator('[data-progress-screen="goals"]')
          const well = section.locator('[data-goals-empty]')
          const empty = section.locator('[data-mark="orbit"]')
          await expect(empty).toBeVisible()
          await expect(empty.getByRole('button', { name: words.progressScreen.goals.createAction })).toHaveAttribute('data-variant', viewport.width >= 768 ? 'secondary' : 'primary')
          await expect(empty.locator('p')).toHaveText(words.progressScreen.goals.empty)
          await page.goto('/progress/streak')
          await page.getByRole('button', { name: t('progressScreen.streak.freezesCount', { banked: progressGoalsEmptyStreak.streakFreezesAccumulated, ceiling: progressGoalsEmptyStreak.maxStreakFreezesAccumulated }), exact: true }).click()
          const bank = page.locator('[data-component="freeze-bank"]')
          await expect(bank).toHaveAttribute('data-protected-state', 'empty')
          const figures = await bank.evaluate((element) => {
            const row = element.children[2]!.children[0]!
            const content = row.getBoundingClientRect()
            const first = row.children[0]!.getBoundingClientRect()
            const second = row.children[1]!.getBoundingClientRect()
            return { widths: [first.width, second.width], gap: second.left - first.right,
              secondStart: second.left, expectedStart: content.left + (content.width + 12) / 2 }
          })
          expect(Math.abs(figures.widths[0]! - figures.widths[1]!)).toBeLessThanOrEqual(1)
          expect(figures.gap).toBeCloseTo(12, 0)
          expect(Math.abs(figures.secondStart - figures.expectedStart)).toBeLessThanOrEqual(1)
          const details = page.getByRole('dialog', { name: words.progressScreen.streak.freezes, exact: true })
          const legend = bank.getByRole('group', { name: words.progressScreen.streak.legend, exact: true })
          await expect(legend).toBeVisible()
          await expect(legend.getByText(words.progressScreen.streak.active, { exact: true })).toBeVisible()
          await expect(legend.getByText(words.progressScreen.streak.frozen, { exact: true })).toBeVisible()
          await expect(legend.getByText(words.progressScreen.streak.missed, { exact: true })).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(details).toHaveCount(0)
          await expect(page.getByRole('button', { name: t('progressScreen.streak.freezesCount', { banked: progressGoalsEmptyStreak.streakFreezesAccumulated, ceiling: progressGoalsEmptyStreak.maxStreakFreezesAccumulated }), exact: true })).toBeFocused()
          goalPage = paginatedGoalResponseSchema.parse({ ...progressGoalsEmptyPage, items: [createMockGoal()], totalCount: 1, totalPages: 1 })
          await page.goto('/progress/goals')
          await section.getByRole('button', { name: `${words.progressScreen.goals.filter}: ${words.progressScreen.goals.all}`, exact: true }).click()
          await page.getByRole('menuitemcheckbox', { name: words.progressScreen.goals.completed, exact: true }).click()
          await expectGoalsWell(well)
          await expect(well.locator('p')).toHaveText(words.progressScreen.goals.filterEmpty)
          await well.getByRole('button', { name: words.progressScreen.goals.clearFilter }).click()
          await expect(well).toHaveCount(0)
          await expect(section).toContainText(goalPage.items[0]!.title)
        })
      })
    }
  }
}

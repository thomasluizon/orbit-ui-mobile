import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

const emptyGoals = paginatedGoalResponseSchema.parse({ items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 0 })
const streak = streakInfoSchema.parse({
  currentStreak: 4, longestStreak: 21, lastActiveDate: '2026-09-04',
  freezesUsedThisMonth: 0, freezesAvailable: 0, maxFreezesPerMonth: 3,
  isFrozenToday: false, recentFreezeDates: [],
  streakFreezesAccumulated: 0, maxStreakFreezesAccumulated: 3,
  daysUntilNextFreeze: 3, freezesAvailableToUse: 0, canEarnMore: true,
  isRepairAvailable: false, repairableGapDates: [],
})

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
  for (const mode of ['dark', 'light'] as const) {
    for (const viewport of [{ width: 1352, height: 706 }, { width: 1100, height: 706 }, { width: 412, height: 915 }]) {
      test.describe(`Progress goals in ${locale} ${mode} at ${viewport.width}`, () => {
        test.use({ appLocale: locale, subscriptionState: 'trial', layoutProfile: { canViewGamification: true, themePreference: mode }, viewport, colorScheme: mode })
        test('keeps the section empty state compact, figures shared and legend a ghost pill', async ({ page, context }) => {
          await context.route(`${LAYOUT_ORIGIN}${API.gamification.streak}`, (route) => route.fulfill({ json: streak }))
          let goalPage = emptyGoals
          await context.route(`${LAYOUT_ORIGIN}${API.goals.list}?*`, (route) => route.fulfill({ json: goalPage }))
          await page.goto('/progress')
          await expect(page.locator('html')).toHaveClass(new RegExp(mode))
          const section = page.getByRole('region', { name: words.progressScreen.sections.goals })
          const well = section.locator('[data-goals-empty]')
          await expectGoalsWell(well)
          await expect(section.locator('[data-empty-state-mark]')).toHaveCount(0)
          const action = well.getByRole('button', { name: words.progressScreen.goals.createAction })
          await expect(action).toHaveAttribute('data-variant', viewport.width >= 768 ? 'secondary' : 'primary')
          await expect(well.locator('p')).toHaveText(words.progressScreen.goals.empty)
          await page.evaluate(() => document.fonts.ready)
          if (viewport.width === 1352) {
            expect(await page.locator('main').evaluate((element) => element.scrollTop)).toBe(0)
            for (const item of [well.locator('p'), action]) {
              const box = await item.boundingBox()
              expect(box).not.toBeNull()
              expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
            }
          }
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
          const legend = bank.getByRole('button', { name: words.progressScreen.streak.legend })
          await expect(legend).toHaveAttribute('data-variant', 'ghost')
          await expect(legend).toHaveAttribute('data-size', 'sm')
          expect(await legend.evaluate((element) => {
            const style = getComputedStyle(element)
            const box = element.getBoundingClientRect()
            return { radius: Number.parseFloat(style.borderRadius), width: box.width, height: box.height, ring: style.boxShadow }
          })).toMatchObject({ width: expect.any(Number), height: expect.any(Number), ring: expect.stringMatching(/0px 0px 0px 1\.5px/) })
          expect(await legend.evaluate((element) => getComputedStyle(element).boxShadow)).toContain('inset')
          const legendBox = await legend.boundingBox()
          expect(legendBox!.width).toBeGreaterThanOrEqual(48)
          expect(legendBox!.height).toBeGreaterThanOrEqual(48)
          expect(await legend.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderRadius))).toBeGreaterThanOrEqual(legendBox!.height / 2)
          await expectInteractionFill(legend)
          await legend.click()
          await expect(page.getByRole('dialog', { name: words.progressScreen.streak.legend })).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(legend).toBeFocused()
          goalPage = paginatedGoalResponseSchema.parse({ ...emptyGoals, items: [createMockGoal()], totalCount: 1, totalPages: 1 })
          await page.reload()
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

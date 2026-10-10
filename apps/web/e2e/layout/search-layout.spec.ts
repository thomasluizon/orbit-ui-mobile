import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  pageSize: 20,
  totalCount: 3,
  items: [
    makeHabitScheduleItem({ id: 'walk', title: 'Walk', children: [], hasSubHabits: false, searchMatches: [{ field: 'title', value: null }] }),
    makeHabitScheduleItem({ id: 'park', title: 'Walk through the park with a longer habit name', children: [], hasSubHabits: false, searchMatches: [{ field: 'description', value: null }] }),
    makeHabitScheduleItem({ id: 'stretch', title: 'Stretch', children: [], hasSubHabits: false, searchMatches: [{ field: 'tag', value: 'walking' }] }),
  ],
})

for (const width of [412, 840, 1440]) {
  for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`Habit search at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('keeps results on the page and the wide palette in an overlay', async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await page.goto('/search')
        const surface = page.locator('#orbit-main')
        const input = surface.getByRole('combobox', { name: messages.habits.search.title })
        await expect(input).toHaveAttribute('placeholder', messages.habits.search.title)
        await expect(surface.locator('[data-command-group]')).toHaveCount(0)
        await expect(surface.locator('kbd')).toHaveCount(0)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await input.fill('walk')
        await expect(surface.getByRole('option')).toHaveCount(3)
        await expect(surface.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
        await page.evaluate(() => document.fonts.ready)
        const geometry = await surface.evaluate((element) => {
          const field = element.querySelector('[cmdk-input]')!.getBoundingClientRect()
          return {
            field: { left: field.left, right: field.right, height: field.height },
            rows: [...element.querySelectorAll('[cmdk-item]')].map((row) => {
              const bounds = row.getBoundingClientRect()
              return { left: bounds.left, right: bounds.right, height: bounds.height }
            }),
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
          }
        })
        expect(geometry.documentWidth).toBe(geometry.viewportWidth)
        expect(geometry.field.left).toBeGreaterThanOrEqual(0)
        expect(geometry.field.right).toBeLessThanOrEqual(width)
        expect(geometry.field.height).toBeGreaterThanOrEqual(44)
        for (const row of geometry.rows) {
          expect(row.left).toBeCloseTo(geometry.field.left, 1)
          expect(row.right).toBeCloseTo(geometry.field.right, 1)
          expect(row.height).toBeGreaterThanOrEqual(44)
        }
        if (width >= 1024) {
          await page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.nav.search }).click()
          const palette = page.getByRole('dialog', { name: messages.command.title })
          await expect(palette).toBeVisible()
          await expect(palette.getByRole('combobox')).toHaveAttribute('placeholder', messages.command.placeholder)
          await expect(palette.locator('[data-command-group]')).toHaveCount(4)
          await expect(palette.locator('kbd')).toHaveCount(3)
          await palette.getByRole('combobox').press('Escape')
          await expect(palette).toHaveCount(0)
          await expect(input).toHaveValue('walk')
        }
        await surface.getByRole('option').first().click()
        await expect(page).toHaveURL(/\/habits\/walk$/)
      })
      for (const theme of ['light', 'dark'] as const) {
        test(`keeps pointer hover neutral and preserves keyboard selection in ${theme}`, async ({ page, context }) => {
          const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: theme })
          await setLayoutProfileSession(context, profile)
          await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
          await page.goto('/search')
          const surface = page.locator('#orbit-main')
          const input = surface.getByRole('combobox', { name: messages.habits.search.title })
          await input.fill('walk')
          const options = surface.getByRole('option')
          await expect(options).toHaveCount(3)
          await expect(surface.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
          await input.press('Home')
          await expect(options.first()).toHaveAttribute('aria-selected', 'true')
          await options.nth(1).hover()
          await expect(options.first()).toHaveAttribute('aria-selected', 'true')
          await expect(options.nth(1)).toHaveAttribute('aria-selected', 'false')
          const paint = await options.nth(1).evaluate(async (element) => {
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            await Promise.all(element.getAnimations().map((animation) => animation.finished))
            const probe = document.createElement('span')
            probe.style.backgroundColor = 'var(--bg-hover)'
            probe.style.boxShadow = 'inset 0 0 0 1px var(--hairline-ghost)'
            element.append(probe)
            const expected = getComputedStyle(probe)
            const actual = getComputedStyle(element)
            const measured = {
              background: actual.backgroundColor,
              shadow: actual.boxShadow.split(/, (?=rgba?\()/).filter((layer) => !layer.startsWith('rgba(0, 0, 0, 0) ')),
              hover: expected.backgroundColor,
              hairline: expected.boxShadow,
            }
            probe.remove()
            return measured
          })
          expect(paint.background).toBe(paint.hover)
          expect(paint.shadow).toEqual([paint.hairline])
          await input.press('Enter')
          await expect(page).toHaveURL(/\/habits\/walk$/)
        })
        for (const pointer of ['result 0', 'outside the list', 'the active result'] as const) {
          test(`keeps the keyboard indicator with pointer on ${pointer} in ${theme}`, async ({ page, context }) => {
            const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: theme })
            await setLayoutProfileSession(context, profile)
            await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
            await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
            await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
            await page.goto('/search')
            const surface = page.locator('#orbit-main')
            const input = surface.getByRole('combobox', { name: messages.habits.search.title })
            await input.fill('walk')
            const options = surface.getByRole('option')
            await expect(options).toHaveCount(3)
            await expect(surface.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
            await input.press('Home')
            if (pointer === 'result 0') await options.first().hover()
            if (pointer === 'outside the list') await input.hover()
            await input.press('ArrowDown')
            if (pointer === 'the active result') await options.nth(1).hover()
            await expect(input).toBeFocused()
            for (const index of [0, 1, 2]) {
              const selected = index === 1
              const hovered = index === 0 && pointer === 'result 0'
              await expect(options.nth(index)).toHaveAttribute('aria-selected', String(selected))
              const paint = await options.nth(index).evaluate(async (element, state) => {
                await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
                await Promise.all(element.getAnimations().map((animation) => animation.finished))
                const probe = document.createElement('span')
                probe.style.backgroundColor = state.selected ? 'var(--primary-dim)' : state.hovered ? 'var(--bg-hover)' : 'var(--bg-card)'
                probe.style.boxShadow = state.selected ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 1px var(--hairline-ghost)'
                element.append(probe)
                const expected = getComputedStyle(probe)
                const actual = getComputedStyle(element)
                const measured = {
                  background: actual.backgroundColor,
                  shadow: actual.boxShadow.split(/, (?=rgba?\()/).filter((layer) => !layer.startsWith('rgba(0, 0, 0, 0) ')),
                  expectedBackground: expected.backgroundColor,
                  expectedShadow: expected.boxShadow,
                }
                probe.remove()
                return measured
              }, { selected, hovered })
              expect(paint.background).toBe(paint.expectedBackground)
              expect(paint.shadow).toEqual([paint.expectedShadow])
            }
            await input.press('Enter')
            await expect(page).toHaveURL(/\/habits\/park$/)
          })
        }
      }
    })
  }
}

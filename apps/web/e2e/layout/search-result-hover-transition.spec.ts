import { expect, test, type Locator, type Page, type BrowserContext } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  totalCount: 2,
  items: [
    makeHabitScheduleItem({ id: 'walk', title: 'Walk', children: [], hasSubHabits: false, searchMatches: [{ field: 'title', value: null }] }),
    makeHabitScheduleItem({ id: 'park', title: 'Walk through the park', children: [], hasSubHabits: false, searchMatches: [{ field: 'title', value: null }] }),
  ],
})

async function setupSearch(page: Page, context: BrowserContext, locale: 'en' | 'pt-BR', messages: typeof en) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: 'dark' })
  await setLayoutProfileSession(context, profile)
  await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
  await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
  await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: habits }))
  await page.goto('/search')
  const surface = page.locator('#orbit-main')
  const input = surface.getByRole('combobox', { name: messages.habits.search.title })
  await input.fill('walk')
  const options = surface.getByRole('option')
  await expect(options).toHaveCount(2)
  await expect(surface.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
  await input.press('Home')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await page.mouse.move(0, 0)
  return { input, options }
}

async function expectHoverTransition(row: Locator) {
  const measured = await row.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const transitions = element.getAnimations().filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
    const measured = {
      property: getComputedStyle(element).transitionProperty,
      transitions: transitions.map((animation) => ({ property: animation.transitionProperty, duration: animation.effect!.getTiming().duration, easing: animation.effect!.getTiming().easing })),
    }
    await Promise.all(transitions.map((animation) => animation.finished))
    return measured
  })
  expect(measured.property).toBe('background-color')
  expect(measured.transitions).toEqual([{ property: 'background-color', duration: 380, easing: 'cubic-bezier(0.2, 0, 0, 1)' }])
}

for (const width of [412, 1280]) {
  for (const [locale, messages] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`Search result transitions at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('fades the unselected result on pointer entry and exit', async ({ page, context }) => {
        const { options } = await setupSearch(page, context, locale, messages)
        const row = options.nth(1)
        await expect(row).toHaveAttribute('aria-selected', 'false')
        await row.hover()
        await expectHoverTransition(row)
        await expect(options.first()).toHaveAttribute('aria-selected', 'true')
        await expect(row).toHaveAttribute('aria-selected', 'false')
        await page.mouse.move(0, 0)
        await expectHoverTransition(row)
      })

      test('paints both keyboard selection changes immediately', async ({ page, context }) => {
        const { input, options } = await setupSearch(page, context, locale, messages)
        await options.evaluateAll((elements) => {
          for (const element of elements) {
            element.setAttribute('data-transition-runs', '0')
            element.addEventListener('transitionrun', () => {
              element.setAttribute('data-transition-runs', String(Number(element.getAttribute('data-transition-runs')) + 1))
            })
          }
        })
        await input.press('ArrowDown')
        await expect(options.first()).toHaveAttribute('aria-selected', 'false')
        await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
        for (const index of [0, 1]) {
          const measured = await options.nth(index).evaluate((element) => {
            const selected = element.getAttribute('aria-selected') === 'true'
            const probe = document.createElement('span')
            probe.style.backgroundColor = selected ? 'var(--primary-dim)' : 'var(--bg-card)'
            probe.style.boxShadow = selected ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 1px var(--hairline-ghost)'
            element.append(probe)
            const actual = getComputedStyle(element)
            const expected = getComputedStyle(probe)
            const measured = {
              runs: Number(element.getAttribute('data-transition-runs')),
              transitions: element.getAnimations().filter((animation) => animation instanceof CSSTransition).length,
              background: actual.backgroundColor,
              expectedBackground: expected.backgroundColor,
              shadow: actual.boxShadow.split(/, (?=rgba?\()/).filter((layer) => !layer.startsWith('rgba(0, 0, 0, 0) ')),
              expectedShadow: expected.boxShadow,
            }
            probe.remove()
            return measured
          })
          expect(measured.runs).toBe(0)
          expect(measured.transitions).toBe(0)
          expect(measured.background).toBe(measured.expectedBackground)
          expect(measured.shadow).toEqual([measured.expectedShadow])
        }
      })
    })
  }
}

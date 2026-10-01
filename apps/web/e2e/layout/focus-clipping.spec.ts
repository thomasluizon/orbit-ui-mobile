import { expect, test, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'
import { expectOneFieldIndicator, inspectFocusedRing, readOutlineVisibility } from './focus-indicators'

async function expectCompleteTabIndicator(page: Page, control: Locator, surface: string) {
  await control.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(control, surface).toBeFocused()
  const ring = await inspectFocusedRing(page)
  expect(ring?.focusVisible, surface).toBe(true)
  expect(ring?.indicators, surface).toHaveLength(1)
  expect(await readOutlineVisibility(control), surface).toMatchObject({ visible: true, clippedBy: [] })
}

async function refreshTodayHabits(page: Page) {
  const trigger = page.getByRole('button', { name: messages.habits.listOptions })
  const menu = page.getByRole('menu', { name: messages.habits.listOptions })
  await trigger.click()
  await menu.getByRole('menuitem', { name: messages.habits.refresh }).click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('main[data-shell-scroller] [data-habit-title]')).toHaveCount(14)
}

async function waitForSettledChips(chips: Locator) {
  let previousLabels: string[] = []
  let stableSamples = 0
  await expect.poll(async () => {
    const labels = await chips.allTextContents()
    const unchanged = labels.length === previousLabels.length
      && labels.every((label, index) => label === previousLabels[index])
    stableSamples = unchanged && labels.length >= 3 && labels.every((label) => label.trim())
      ? stableSamples + 1 : 0
    previousLabels = labels
    return stableSamples
  }, { message: 'suggestion count and labels settle before keyboard navigation', intervals: [100, 200, 400] }).toBeGreaterThanOrEqual(2)
  return previousLabels.length
}

for (const width of [412, 1352] as const) {
  for (const mode of ['dark', 'light'] as const) {
    test.describe(`complete focus at ${width}px in ${mode}`, () => {
      test.use({ viewport: { width, height: 915 } })

      test.beforeEach(async ({ context }) => {
        const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'en' })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        const items = Array.from({ length: 12 }, (_, index) => makeHabitScheduleItem({
          id: `focus-habit-${index}`, title: `Habit ${index}`, position: index, isGeneral: true,
          children: [], hasSubHabits: false,
        }))
        const parent = items[0]!
        const child = makeHabitScheduleItem().children[0]!
        parent.children = [0, 1].map((index) => ({ ...child, id: `focus-child-${index}`, title: `Child ${index}`, isGeneral: true, isCompleted: false, children: [] }))
        parent.hasSubHabits = true
        const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ ...emptyHabitsPageFixture, items, totalCount: items.length })
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: items.length } }))
      })

      test('Hoje exposes complete rings at every control including sortable wrappers', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('html')).toHaveClass(new RegExp(mode))
        await refreshTodayHabits(page)
        const main = page.locator('main[data-shell-scroller]')
        await expect(main.locator('[data-habit-title]')).toHaveCount(14)
        const handles = main.locator('[aria-roledescription="sortable"]')
        await expect(handles).toHaveCount(14)
        const controls = main.locator('button:visible:not(:disabled), a[href]:visible, [tabindex="0"]:visible')
        const count = await controls.count()
        expect(count).toBeGreaterThan(24)
        for (let index = 0; index < count; index += 1) {
          await expectCompleteTabIndicator(page, controls.nth(index), `Hoje control ${index}`)
        }
        await main.locator('[data-habit-row-control="menu"]').first().click()
        await page.getByRole('menuitem', { name: messages.common.select, exact: true }).click()
        await expect(main.locator('[data-habit-row-control="selection"]').first()).toBeVisible()
        const selectionControls = main.locator('button:visible:not(:disabled), [tabindex="0"]:visible')
        for (let index = 0; index < await selectionControls.count(); index += 1) {
          await expectCompleteTabIndicator(page, selectionControls.nth(index), `Hoje selection control ${index}`)
        }
      })

      test('pinned and conversation composers expose complete chip and control rings', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('html')).toHaveClass(new RegExp(mode))
        await refreshTodayHabits(page)
        const pinned = page.locator('[data-shell-pinned-slot] [data-composer-root]')
        await expect(pinned).toBeVisible()
        const chips = pinned.getByRole('group', { name: messages.shell.composer.suggestionsLabel }).getByRole('button')
        const chipCount = await waitForSettledChips(chips)
        for (let index = 0; index < chipCount; index += 1) {
          await expectCompleteTabIndicator(page, chips.nth(index), `pinned composer chip ${index}`)
        }
        await pinned.locator('[data-composer-input]').focus()
        const conversation = page.locator('[data-shell-conversation]')
        await expect(conversation).toBeVisible()
        const field = conversation.locator('[data-composer-input]')
        await expectOneFieldIndicator(page, field, '[data-composer-input-row]', 'conversation field')
        const final = chatStreamEventSchema.parse({ type: 'final', response: { aiMessage: 'Ready', actions: [] } })
        await page.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, (route) => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(final)}\n\n` }))
        await field.fill('Review my habits')
        await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
        const composer = conversation.locator('[data-composer-root]')
        await expect(composer).toHaveAttribute('data-state', 'idle')
        const conversationChips = composer.getByRole('group', { name: messages.shell.composer.suggestionsLabel }).getByRole('button')
        await expect(conversationChips.first()).toBeVisible()
        await waitForSettledChips(conversationChips)
        const controls = conversation.locator('[data-composer-root] button:visible:not(:disabled)')
        for (let index = 0; index < await controls.count(); index += 1) {
          await expectCompleteTabIndicator(page, controls.nth(index), `conversation composer control ${index}`)
        }
      })
    })
  }
}

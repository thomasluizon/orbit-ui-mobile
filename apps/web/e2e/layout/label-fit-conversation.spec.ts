import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

/** Surface inventory:
 * Web full-screen empty conversation; Android empty conversation.
 * Web and Android conversation composer strips.
 * Web and Android habit detail composer strips.
 */
const title = 'Caminhar pelo bairro e cuidar da rotina da casa com todos os detalhes '.repeat(3)
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title, children: [], checklistItems: [] })
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ id: habit.id, title, children: [], hasSubHabits: false,
    dueDate: '2026-09-04', scheduledDates: ['2026-09-04'], isOverdue: true }),
    makeHabitScheduleItem({ id: 'completed-habit', title: 'Rotina concluída', children: [],
      hasSubHabits: false, isCompleted: true, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] }),
    makeHabitScheduleItem({ id: 'parent-habit', title: 'Rotina com etapas',
      dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] }),
  ],
  totalCount: 3,
})

async function expectStripEdge(strip: Locator) {
  await expect.poll(async () => strip.evaluate(element => {
    element.scrollLeft = 0
    const viewport = element.getBoundingClientRect()
    const host = element.parentElement!.getBoundingClientRect()
    const chips = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect())
    const partial = chips.find(chip => chip.left < viewport.right && chip.right > viewport.right)
    return Math.abs(host.right - viewport.right) <= 1
      && Math.abs(host.left - viewport.left) <= 1
      && (element.scrollWidth <= element.clientWidth || (partial !== undefined && viewport.right - partial.left >= 16 && partial.right - viewport.right >= 16))
  })).toBe(true)
  for (const chip of await strip.getByRole('button').all()) {
    await chip.focus()
    await expect.poll(async () => chip.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const viewport = element.parentElement!.getBoundingClientRect()
      return bounds.left >= viewport.left - 1 && bounds.right <= viewport.right + 1
    })).toBe(true)
  }
}

for (const width of [320, 360, 384, 412, 1100, 1440]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`conversation labels in ${locale} at ${width}px`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale,
        lastCompletionDate: null, aiMessagesUsed: 0, currentStreak: 0 })
      test.use({ appLocale: locale, layoutProfile: profile, viewport: { width, height: 915 } })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, route => route.fulfill({ json: habit }))
      })

      test('keeps the empty heading and suggestions whole with a peek at the gutter', async ({ page }) => {
        await page.goto('/')
        await page.locator('[data-today-header-actions]').getByRole('button', { name: words.habits.listOptions, exact: true }).click()
        await page.getByRole('menu', { name: words.habits.listOptions, exact: true })
          .getByRole('menuitem', { name: words.habits.refresh, exact: true }).click()
        await expect(page.getByTestId('habit-row').getByText(title, { exact: true })).toBeVisible()
        await page.getByRole('button', { name: width >= 1024 ? words.chat.title : words.todayAstra.openConversation, exact: true }).click()
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        const empty = conversation.getByRole('feed')
        await markRequiredLabels(empty.getByText(words.chat.empty.title, { exact: true }))
        await expect(empty.getByRole('button')).toHaveCount(0)
        await expectLabelsFit(page, empty)
        const strip = conversation.getByRole('group', { name: words.shell.composer.suggestionsLabel, exact: true })
        await markRequiredLabels(strip.getByRole('button'))
        expect(await strip.getByRole('button').count()).toBeGreaterThanOrEqual(3)
        await expectLabelsFit(page, strip)
        await expectStripEdge(strip)
        await strip.getByRole('button').first().focus()
        await expectInteractionFill(strip.getByRole('button').first())
      })

      test('keeps habit detail suggestions whole through the trailing gutter', async ({ page }) => {
        await page.goto(`/habits/${habit.id}`)
        const heading = page.getByRole('heading', { name: title, exact: true })
        await expect(heading).toBeVisible()
        await markUserText(page, [title])
        const strip = page.locator('[data-shell-bottom]').getByRole('group', {
          name: words.shell.composer.suggestionsLabel, exact: true,
        })
        for (const label of Object.values(words.shell.composer.chips.habitDetail)) {
          await markRequiredLabels(strip.getByRole('button', { name: label, exact: true }))
        }
        await expectLabelsFit(page, strip)
        await expectStripEdge(strip)
        await strip.getByRole('button').first().focus()
        await expectInteractionFill(strip.getByRole('button').first())
      })
    })
  }
}

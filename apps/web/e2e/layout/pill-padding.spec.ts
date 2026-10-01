import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { chatResponseSchema, chatStreamEventSchema } from '@orbit/shared/types/chat'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

test.use({ viewport: { width: 1352, height: 915 } })

test('keeps both client-rendered delete actions padded on both sides', async ({ page, context }) => {
  const habit = makeHabitScheduleItem({
    title: 'Beber água',
    dueDate: '2026-09-04',
    scheduledDates: ['2026-09-04'],
    children: [],
    hasSubHabits: false,
  })
  const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
    items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
  })
  const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
  await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
  await setLayoutProfileSession(context, profile)
  await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
  await context.route(
    (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
    (route) => route.fulfill({ json: habitsPage }),
  )
  await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'))

  await page.goto('/')
  await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
  await page.getByRole('menuitem', { name: ptBr.habits.refresh }).click()

  const row = page.getByTestId('habit-row').filter({ has: page.getByText(habit.title, { exact: true }) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: ptBr.habits.actions.more }).click()
  await page.getByRole('menuitem', { name: ptBr.habits.actions.delete }).click()

  const dialog = page.getByRole('dialog', { name: ptBr.habits.deleteConfirmTitle })
  await expect(dialog).toBeVisible()
  for (const label of [ptBr.common.cancel, ptBr.habits.deleteHabit]) {
    const action = dialog.getByRole('button', { name: label, exact: true })
    await expect(action).toBeVisible()
    const padding = await action.evaluate((element) => {
      const style = getComputedStyle(element)
      return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) }
    })
    expect(padding.left, `${label} start padding`).toBeGreaterThan(0)
    expect(padding.left, `${label} has symmetric padding`).toBeCloseTo(padding.right, 1)
  }
})

test('keeps the leading-icon copy pill two pixels tighter at its start', async ({ page, context }) => {
  const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
  const response = chatResponseSchema.parse({ aiMessage: 'Um passo de cada vez.', actions: [] })
  const finalEvent = chatStreamEventSchema.parse({ type: 'final', response })
  await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
  await setLayoutProfileSession(context, profile)
  await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
  await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: `data: ${JSON.stringify(finalEvent)}\n\n`,
  }))

  await page.goto('/')
  await page.getByRole('button', { name: ptBr.todayAstra.openConversation }).click()
  const panel = page.locator('[data-shell-conversation="panel"]')
  await expect(panel).toBeVisible()
  await panel.locator('[data-composer-input]').fill('Como começo?')
  await panel.getByRole('button', { name: ptBr.shell.composer.send }).click()

  const copy = panel.getByRole('button', { name: ptBr.chat.copy, exact: true })
  await expect(copy).toBeVisible()
  const padding = await copy.evaluate((element) => {
    const style = getComputedStyle(element)
    return { start: Number.parseFloat(style.paddingInlineStart), end: Number.parseFloat(style.paddingInlineEnd) }
  })
  expect(padding.end).toBeGreaterThan(0)
  expect(padding.end - padding.start).toBeCloseTo(2, 1)
})

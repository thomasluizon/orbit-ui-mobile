import { test, expect, type APIRequestContext } from '@playwright/test'
import { z } from 'zod'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { reorderHabitsRequestSchema } from '@orbit/shared/types/habit'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const selectedDate = '2026-09-04'
const mutationJournalUrl = 'http://127.0.0.1:5099/_test/habit-mutations'
const mutationsSchema = z.array(z.object({ method: z.string(), path: z.string(), body: z.unknown() }))
const children = [0, 1].map((position) => makeHabitScheduleItem({
  id: `semantics-child-${position}`, title: `Child ${position}`, position,
  children: [], hasSubHabits: false, scheduledDates: [selectedDate],
}))
const items = [
  makeHabitScheduleItem({ id: 'semantics-first', title: 'Ler', position: 0,
    children: [], hasSubHabits: false, scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'semantics-second', title: 'Caminhar', position: 1,
    children: [], hasSubHabits: false, scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'semantics-parent', title: 'Rotina', position: 2,
    children, scheduledDates: [selectedDate] }),
]

async function readMutations(request: APIRequestContext) {
  const response = await request.get(mutationJournalUrl)
  expect(response.ok()).toBe(true)
  return mutationsSchema.parse(await response.json())
}

for (const width of [412, 1280]) {
  test(`Hoje row controls activate independently and reorder siblings at ${width}px`, async ({ page, context, request }) => {
    await page.setViewportSize({ width, height: 915 })
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
    await setLayoutProfileSession(context, profile)
    await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
    await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
      (route) => route.fulfill({ json: { ...emptyHabitsPageFixture, items, totalCount: items.length } }))
    await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: 5 } }))
    const cleared = await request.delete(mutationJournalUrl)
    expect(cleared.ok()).toBe(true)
    await page.clock.setFixedTime(new Date(`${selectedDate}T12:00:00Z`))
    await page.goto('/')
    const list = page.locator('[data-habit-list]')
    const rows = list.getByTestId('habit-row')
    const parent = rows.filter({ hasText: 'Rotina' })
    const disclosure = parent.locator('[data-habit-row-control="disclosure"]')
    await expect(disclosure).toBeVisible()
    if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
    await expect(rows).toHaveCount(5)
    await expect(list.locator('button button, button [role="button"], [role="button"] button, [role="button"] [role="button"]')).toHaveCount(0)

    const first = rows.filter({ hasText: 'Ler' })
    const firstBody = first.locator('[data-habit-row-body]')
    const ring = first.getByRole('button', { name: `${ptBr.habits.statusDot.empty}, ${ptBr.habits.logHabit}: Ler` })
    const menu = first.getByRole('button', { name: ptBr.habits.actions.more })
    await firstBody.focus()
    await page.keyboard.press('Tab')
    await expect(ring).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(menu).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(rows.filter({ hasText: 'Caminhar' }).locator('[data-habit-row-body]')).toBeFocused()

    const child = rows.filter({ hasText: 'Child 0' })
    await child.locator('[data-habit-row-body]').focus()
    await page.keyboard.press('Tab')
    await expect(child.getByRole('button', { name: /Registrar hábito:/ })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(child.getByRole('button', { name: ptBr.habits.actions.more })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(rows.filter({ hasText: 'Child 1' }).locator('[data-habit-row-body]')).toBeFocused()

    await firstBody.focus()
    await expect(firstBody).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
    await expect(firstBody).toHaveAttribute('aria-roledescription', ptBr.dragAndDrop.roleDescription)
    await page.keyboard.press('Alt+ArrowDown')
    await expect.poll(async () => (await readMutations(request)).filter((mutation) => mutation.path === API.habits.reorder).length).toBe(1)
    const reorder = (await readMutations(request)).find((mutation) => mutation.path === API.habits.reorder)!
    expect(reorder.method).toBe('PUT')
    expect(reorderHabitsRequestSchema.parse(reorder.body)).toEqual({ positions: [
      { habitId: 'semantics-second', position: 0 },
      { habitId: 'semantics-first', position: 1 },
      { habitId: 'semantics-parent', position: 2 },
    ] })
    await expect(list.getByRole('status').filter({ hasText: 'Ler foi movido para a posição 2 de 3' })).toHaveAttribute('aria-live', 'polite')
    await expect(firstBody).toBeFocused()
    await ring.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await readMutations(request)).filter((mutation) => mutation.path === API.habits.log('semantics-first')).length).toBe(1)
    const log = (await readMutations(request)).find((mutation) => mutation.path === API.habits.log('semantics-first'))!
    expect(log.method).toBe('POST')
    expect((await readMutations(request)).filter((mutation) => mutation.path === API.habits.reorder)).toHaveLength(1)
  })
}

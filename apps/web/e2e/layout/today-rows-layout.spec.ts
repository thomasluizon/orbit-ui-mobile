import { test, expect, type Page } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const selectedDate = '2026-09-04'
const children = [0, 1].map((position) => makeHabitScheduleItem({
  id: `child-${position}`, title: `Child ${position}`, position,
  children: [], hasSubHabits: false, scheduledDates: [selectedDate],
}))
const items = [
  makeHabitScheduleItem({ id: 'parent', title: 'Parent', children, scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'timed', title: 'Timed', children: [], hasSubHabits: false,
    position: 1, dueTime: '21:00', scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'untimed', title: 'Untimed', children: [], hasSubHabits: false,
    position: 2, scheduledDates: [selectedDate] }),
]

for (const mode of ['dark', 'light'] as const) {
  for (const width of [412, 1280]) {
    test(`Hoje rows keep drawn geometry and parent contrast at ${width}px in ${mode}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 915 })
      const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'pt-BR' })
      await setLayoutProfileSession(context, profile)
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
        (route) => route.fulfill({ json: { ...emptyHabitsPageFixture, items, totalCount: items.length } }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: 5 } }))
      await page.clock.setFixedTime(new Date(`${selectedDate}T12:00:00Z`))
      await page.goto('/')
      const parent = page.getByTestId('habit-row').filter({ hasText: 'Parent' })
      const disclosure = parent.locator('[data-habit-row-control="disclosure"]')
      await expect(disclosure).toBeVisible()
      if (await disclosure.getAttribute('aria-expanded') === 'true') await disclosure.click()
      await expect(parent).toContainText('0 de 2')
      const panels = page.locator('.habit-panel')
      await expect(panels).toHaveCount(3)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await panels.evaluateAll((elements) => elements.map((panel) => {
        const row = panel.querySelector('[data-testid="habit-row"]')!
        const well = row.querySelector('[data-habit-row-body] > span')!
        const bounds = panel.getBoundingClientRect()
        const wellBounds = well.getBoundingClientRect()
        const track = row.querySelector('circle')
        return {
          height: bounds.height, above: wellBounds.top - bounds.top, below: bounds.bottom - wellBounds.bottom,
          track: track ? getComputedStyle(track).stroke : null,
          card: getComputedStyle(panel).backgroundColor,
          canvas: getComputedStyle(document.body).backgroundColor,
        }
      }))
      for (const panel of geometry) {
        expect(panel.height).toBe(68)
        expect(panel.above).toBeCloseTo(panel.below, 1)
      }
      const parentTrack = geometry.find((panel) => panel.track !== null)!
      expect(parentTrack.track).toBe(mode === 'dark' ? 'rgb(122, 122, 125)' : 'rgb(127, 127, 131)')
      expect(contrastOnSurface(parentTrack.track!, [parentTrack.canvas, parentTrack.card])).toBeGreaterThanOrEqual(3)
    })
  }
}

async function assertTodayTextEdges(page: Page, sentenceVisible: boolean, width: number) {
  const geometry = await page.evaluate((includeSentence) => {
    const rows = Array.from(document.querySelectorAll('[data-testid="habit-row"]'))
    const dates = Array.from(document.querySelectorAll('[data-today-date-row] [title] p'))
    const sentence = document.querySelector('.today-astra-sentence')
    const titles = rows.map((row) => (row.querySelector('[data-habit-row-heading] > div') ?? row.querySelector('[data-habit-row-body] > div'))!)
    return {
      edges: [...dates, ...titles, ...(includeSentence && sentence ? [sentence] : [])].map((element) => element.getBoundingClientRect().left),
      insets: rows.map((row) => {
        const body = row.querySelector('[data-habit-row-body]')!
        const well = body.querySelector('[data-habit-row-heading] > span > span, :scope > span > span')!
        return well.getBoundingClientRect().left - body.getBoundingClientRect().left
      }),
      targets: rows.flatMap((row) => Array.from(row.querySelectorAll('button')).map((button) => {
        const bounds = button.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }
      })),
      overflow: document.documentElement.scrollWidth,
    }
  }, sentenceVisible)
  expect(geometry.edges).toHaveLength(sentenceVisible ? 6 : 5)
  for (const edge of geometry.edges) expect(Math.abs(edge - 84)).toBeLessThanOrEqual(1)
  expect(geometry.insets).toHaveLength(3)
  for (const inset of geometry.insets) expect(inset).toBeGreaterThanOrEqual(8)
  expect(geometry.overflow).toBeLessThanOrEqual(width)
  for (const target of geometry.targets) {
    expect(target.left).toBeGreaterThanOrEqual(16)
    expect(target.right).toBeLessThanOrEqual(width - 16)
    expect(target.width).toBeGreaterThanOrEqual(48)
    expect(target.height).toBeGreaterThanOrEqual(48)
  }
}

for (const width of [320, 600]) {
  for (const textScale of [1, 2]) {
    for (const mode of ['dark', 'light'] as const) {
      test(`Hoje body fills keep a padded shared edge at ${width}px and ${textScale} text scale in ${mode}`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'pt-BR' })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        const child = makeHabitScheduleItem({ id: 'padded-child', title: 'Caminhar pela praça depois do almoço', children: [], hasSubHabits: false, scheduledDates: [selectedDate] })
        const habits = [
          makeHabitScheduleItem({ id: 'padded-parent', title: 'Cuidar da rotina da casa todos os dias', children: [child], scheduledDates: [selectedDate] }),
          makeHabitScheduleItem({ id: 'padded-leaf', title: 'Ler um capítulo do livro antes de dormir', children: [], hasSubHabits: false, position: 1, scheduledDates: [selectedDate] }),
        ]
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
          (route) => route.fulfill({ json: { ...emptyHabitsPageFixture, items: habits, totalCount: habits.length } }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: 3 } }))
        const proactive = createMockNotification({ url: '/chat', body: 'Sua rotina mudou. Vamos conversar?', createdAtUtc: `${selectedDate}T12:00:00Z` })
        await context.route(`${LAYOUT_ORIGIN}${API.notifications.list}`, (route) => route.fulfill({
          json: notificationsResponseSchema.parse({ items: [proactive], unreadCount: 1 }),
        }))
        await page.clock.setFixedTime(new Date(`${selectedDate}T12:00:00Z`))
        await page.goto('/')
        const disclosure = page.locator('[data-habit-row-control="disclosure"]')
        await expect(disclosure).toBeVisible()
        if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
        await expect(page.getByTestId('habit-row')).toHaveCount(3)
        await expect(page.locator('.today-astra-sentence')).toHaveText(proactive.body)
        await page.evaluate(async (scale) => {
          document.documentElement.style.fontSize = `${16 * scale}px`
          for (const label of document.querySelectorAll<HTMLElement>('.today-astra-sentence')) {
            label.style.fontSize = `${Number.parseFloat(getComputedStyle(label).fontSize) * scale}px`
          }
          await document.fonts.ready
        }, textScale)
        for (const selecting of [false, true]) {
          if (selecting) {
            await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
            await page.getByRole('menuitem', { name: ptBr.common.select, exact: true }).click()
            await expect(page.locator('[data-habit-row-control="selection"]')).toHaveCount(3)
            await expect(page.locator('.today-astra-sentence')).toHaveCount(0)
          }
          await assertTodayTextEdges(page, !selecting, width)
          for (const body of await page.locator('[data-habit-row-body]').all()) {
            await body.hover()
            await expect(body).toHaveCSS('border-radius', '20px')
            await expect(body).toHaveCSS('padding-inline-start', '8px')
            await page.mouse.down()
            const pressedInset = await body.evaluate((element) => {
              const well = element.querySelector('[data-habit-row-heading] > span > span, :scope > span > span')!
              const bounds = element.getBoundingClientRect()
              const scale = Number.parseFloat(getComputedStyle(element).scale) || 1
              return (well.getBoundingClientRect().left - bounds.left) / scale
            })
            expect(pressedInset).toBeCloseTo(8, 2)
            await page.mouse.move(width - 1, 914)
            await page.mouse.up()
            await body.evaluate((element) => { element.parentElement!.tabIndex = 0; (element.parentElement as HTMLElement).focus() })
            await page.keyboard.press('Tab')
            await expect(body).toBeFocused()
            expect(await body.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2)
            await assertTodayTextEdges(page, !selecting, width)
            await body.evaluate((element) => { element.parentElement!.tabIndex = -1; (element as HTMLElement).blur() })
          }
        }
      })
    }
  }
}

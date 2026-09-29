import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'

const today = '2026-09-04'
const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Beber água',
  dueDate: today,
  scheduledDates: [today],
  children: [],
  hasSubHabits: false,
}))
const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})

for (const width of [412, 600] as const) {
  test.describe(`compact FAB and notice at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('keeps the FAB above the notice control and the composer', async ({ page, context }) => {
      await context.route(
        (url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
        (route) => route.fulfill({ json: habitsPage }),
      )
      await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'))
      await page.goto('/')
      const fab = page.locator('[data-shell-fab]')
      const notice = page.locator('[data-shell-notice]')
      const composer = page.locator('[data-shell-pinned-slot]')
      await expect(fab).toBeVisible()
      await expect(composer).toBeVisible()

      const gapWithoutNotice = await page.evaluate(() => {
        const fab = document.querySelector('[data-shell-fab]')
        const composer = document.querySelector('[data-shell-pinned-slot]')
        if (!fab || !composer) throw new Error('Compact shell controls missing')
        return composer.getBoundingClientRect().top - fab.getBoundingClientRect().bottom
      })
      expect(gapWithoutNotice).toBeGreaterThanOrEqual(15.5)

      await notice.evaluate((slot, closeLabel) => {
        const panel = document.createElement('section')
        panel.setAttribute('data-celebration-panel', '')
        panel.style.cssText = 'height:92px;margin:0 16px;display:flex;align-items:center;justify-content:flex-end'
        const close = document.createElement('button')
        close.type = 'button'
        close.setAttribute('aria-label', closeLabel)
        close.style.cssText = 'width:44px;height:44px'
        close.addEventListener('click', () => { close.dataset.clicked = 'true' })
        panel.append(close)
        slot.append(panel)
      }, ptBr.celebration.close)

      const close = notice.getByRole('button', { name: ptBr.celebration.close })
      const geometry = await page.evaluate(() => {
        const fab = document.querySelector('[data-shell-fab]')?.getBoundingClientRect()
        const panel = document.querySelector('[data-celebration-panel]')?.getBoundingClientRect()
        const close = document.querySelector('[data-celebration-panel] button')?.getBoundingClientRect()
        if (!fab || !panel || !close) throw new Error('Notice controls missing')
        return {
          gap: panel.top - fab.bottom,
          intersectsClose: fab.left < close.right && close.left < fab.right
            && fab.top < close.bottom && close.top < fab.bottom,
        }
      })
      expect(geometry.gap).toBeGreaterThanOrEqual(15.5)
      expect(geometry.intersectsClose).toBe(false)
      await close.click()
      await expect(close).toHaveAttribute('data-clicked', 'true')
    })
  })
}

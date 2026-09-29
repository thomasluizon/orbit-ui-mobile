import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { test } from './upgrade-fixtures'

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
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('keeps the FAB above the notice control and the composer', async ({ page, context }) => {
      await context.route(
        new RegExp(`${API.habits.list}[?]`),
        (route) => route.fulfill({ json: habitsPage }),
      )
      await page.goto(`/?date=${today}`)
      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      await page.getByRole('menuitem', { name: ptBr.habits.refresh }).click()
      await expect(page.locator('[data-habit-title="Beber água"]')).toBeVisible()
      await expect(page.getByRole('menu', { name: ptBr.habits.listOptions })).toHaveCount(0)
      await expect(page.locator('.orbit-sheet-backdrop')).toHaveCount(0)
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

      const geometry = await notice.evaluate((slot, closeLabel) => {
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
        const fab = document.querySelector('[data-shell-fab]')?.getBoundingClientRect()
        if (!fab) throw new Error('Compact FAB missing')
        const panelBox = panel.getBoundingClientRect()
        const closeBox = close.getBoundingClientRect()
        const hit = document.elementFromPoint(
          closeBox.left + closeBox.width / 2,
          closeBox.top + closeBox.height / 2,
        )
        const hitsClose = hit === close || close.contains(hit)
        if (hitsClose) close.click()
        return {
          gap: panelBox.top - fab.bottom,
          intersectsClose: fab.left < closeBox.right && closeBox.left < fab.right
            && fab.top < closeBox.bottom && closeBox.top < fab.bottom,
          hitsClose,
          clicked: close.dataset.clicked === 'true',
        }
      }, ptBr.celebration.close)
      expect(geometry.gap).toBeGreaterThanOrEqual(15.5)
      expect(geometry.intersectsClose).toBe(false)
      expect(geometry.hitsClose).toBe(true)
      expect(geometry.clicked).toBe(true)
    })
  })
}

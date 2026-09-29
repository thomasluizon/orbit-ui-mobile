import { expect } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

test.use({ appLocale: 'pt-BR', viewport: { width: 400, height: 915 } })

for (const width of [412, 1024, 1280]) {
  test(`shows search in the correct Hoje shell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 })
    await page.goto('/')

    const dateRowSearch = page.locator(`button[aria-label="${ptBr.habits.search.title}"]`)
    const sidebarSearch = page.locator('[data-shell-sidebar]').getByRole('button', {
      name: ptBr.command.title,
      exact: true,
    })
    await expect(dateRowSearch).toHaveCount(1)
    if (width >= 1024) {
      await expect(dateRowSearch).toBeHidden()
      await expect(sidebarSearch).toBeVisible()
    } else {
      await expect(dateRowSearch).toBeVisible()
    }
  })
}

test('keeps an off-today date and every action legible at 400px with enlarged text', async ({ page }) => {
  await page.goto('/?date=2026-09-01')
  const previous = page.getByRole('button', { name: ptBr.dates.previousDay })
  const next = page.getByRole('button', { name: ptBr.dates.nextDay })
  const jump = page.getByRole('button', { name: ptBr.dates.goToToday })
  const list = page.getByRole('button', { name: ptBr.habits.listOptions })
  const search = page.getByRole('button', { name: ptBr.habits.search.title })
  const date = page.locator('[title^="Terça-feira,"]')
  await expect(jump).toBeVisible()
  await expect(date).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  for (const textScale of [1, 2]) {
    await date.evaluate((element, scale) => {
      const [day, numeric] = element.querySelectorAll('p')
      if (!day || !numeric) throw new Error('Date labels missing')
      day.style.fontSize = `${22 * scale}px`
      numeric.style.fontSize = `${12 * scale}px`
    }, textScale)
    await jump.evaluate((element, scale) => {
      const label = element.querySelector('span')
      if (!label) throw new Error('Today label missing')
      label.style.fontSize = `${14 * scale}px`
    }, textScale)
    const geometry = await page.evaluate(() => {
      const dateBlock = document.querySelector('[title^="Terça-feira,"]')
      if (!dateBlock) throw new Error('Date block missing')
      const day = dateBlock.querySelector('p')
      if (!day) throw new Error('Day label missing')
      const row = dateBlock.parentElement
      if (!row) throw new Error('Date row missing')
      const dayText = document.createRange()
      dayText.selectNodeContents(day)
      const dateBounds = dateBlock.getBoundingClientRect()
      const rowBounds = row.getBoundingClientRect()
      return {
        dayLines: dayText.getClientRects().length,
        dateLeft: dateBounds.left,
        dateRight: dateBounds.right,
        documentWidth: document.documentElement.scrollWidth,
        rowLeft: rowBounds.left,
        rowRight: rowBounds.right,
      }
    })
    expect(geometry.dayLines, `day label stays on one line at ${textScale * 100}% text`).toBe(1)
    expect(geometry.dateLeft).toBeGreaterThanOrEqual(-0.5)
    expect(geometry.dateRight).toBeLessThanOrEqual(400.5)
    expect(geometry.documentWidth, `document fits at ${textScale * 100}% text`).toBeLessThanOrEqual(400)
    for (const control of [previous, next, jump, list, search]) {
      const bounds = await control.boundingBox()
      expect(bounds, `control remains visible at ${textScale * 100}% text`).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(Math.max(0, geometry.rowLeft) - 0.5)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(Math.min(400, geometry.rowRight) + 0.5)
      expect(bounds!.height).toBeGreaterThanOrEqual(40)
      await expect(control).toHaveClass(/touch-target/)
    }
  }
})

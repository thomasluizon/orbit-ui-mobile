import { expect } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { openTodayListOptions } from './hydration-guard'

test.use({ appLocale: 'pt-BR', viewport: { width: 400, height: 915 } })

for (const width of [412, 1024, 1280]) {
  test(`shows Hoje header search and both search controls on wide web at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 })
    await page.goto('/')

    const dateRowSearch = page.locator(`button[aria-label="${ptBr.habits.search.title}"]`)
    const sidebarSearch = page.locator('[data-shell-sidebar]').getByRole('button', {
      name: ptBr.nav.search,
    })
    await expect(dateRowSearch).toHaveCount(1)
    await expect(dateRowSearch).toBeVisible()
    if (width >= 1024) {
      await expect(sidebarSearch).toBeVisible()
      const searchLabel = sidebarSearch.locator('span').first()
      await expect(searchLabel).toHaveText(ptBr.nav.search)
      expect(await searchLabel.evaluate((label) => label.scrollWidth <= label.clientWidth)).toBe(true)
    }
  })
}

for (const width of [320, 412]) {
  for (const selectedDate of [null, '2026-09-30']) {
    test(`centres the Hoje date between column-edge controls at ${width}px, date=${selectedDate ?? 'today'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 })
      await page.goto(selectedDate ? `/?date=${selectedDate}` : '/')
      const row = page.locator('[data-today-date-row]')
      await expect(row).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const geometry = await row.evaluate((element) => {
        const [previous, next] = element.querySelectorAll('button:not([title])')
        const date = element.querySelector('[title]')
        if (!previous || !next || !date) throw new Error('Date pager missing')
        const rowBounds = element.getBoundingClientRect()
        const padding = getComputedStyle(element)
        const dateBounds = date.getBoundingClientRect()
        const measure = (control: Element) => {
          const bounds = control.getBoundingClientRect()
          return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }
        }
        return {
          columnLeft: rowBounds.left + Number.parseFloat(padding.paddingLeft),
          columnRight: rowBounds.right - Number.parseFloat(padding.paddingRight),
          dateCenter: (dateBounds.left + dateBounds.right) / 2,
          previous: measure(previous), next: measure(next),
          labels: Array.from(date.querySelectorAll('p')).map((label) => {
            const range = document.createRange()
            range.selectNodeContents(label)
            const fragments = Array.from(range.getClientRects()).filter((bounds) => bounds.width > 0)
            return { lines: new Set(fragments.map((bounds) => bounds.top)).size,
              left: range.getBoundingClientRect().left, right: range.getBoundingClientRect().right }
          }),
        }
      })
      expect(Math.abs(geometry.previous.left - geometry.columnLeft)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.next.right - geometry.columnRight)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.dateCenter - (geometry.columnLeft + geometry.columnRight) / 2)).toBeLessThanOrEqual(1)
      for (const control of [geometry.previous, geometry.next]) {
        expect(control.width).toBe(48)
        expect(control.height).toBeGreaterThanOrEqual(48)
      }
      expect(geometry.labels).toHaveLength(2)
      for (const label of geometry.labels) {
        expect(label.lines).toBe(1)
        expect(label.left).toBeGreaterThanOrEqual(geometry.previous.right + 12 - 1)
        expect(label.right).toBeLessThanOrEqual(geometry.next.left - 12 + 1)
        expect(Math.abs((label.left + label.right) / 2 - geometry.dateCenter)).toBeLessThanOrEqual(1)
      }
    })
  }
}

test('keeps an off-today date and every action legible at 400px with enlarged text', async ({ page }) => {
  await page.goto('/?date=2026-09-01')
  const previous = page.getByRole('button', { name: ptBr.dates.previousDay })
  const next = page.getByRole('button', { name: ptBr.dates.nextDay })
  const jump = page.getByRole('button', { name: new RegExp(ptBr.dates.goToToday) })
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
      expect(bounds!.height).toBeGreaterThanOrEqual(48)
      await expect(control).toHaveClass(/touch-target/)
    }
  }
})

for (const input of ['click', 'Enter', 'Space'] as const) {
  test(`returns to today through the centred date with ${input}`, async ({ page }) => {
    await page.goto('/?date=2026-09-01')
    await openTodayListOptions(page, ptBr.habits.listOptions)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const row = page.locator('[data-today-date-row]')
    const label = row.getByRole('button', { name: new RegExp(ptBr.dates.goToToday) })
    await expect(page.locator('[data-today-header-actions]').getByRole('button', {
      name: new RegExp(ptBr.dates.goToToday),
    })).toHaveCount(0)
    const bounds = await label.boundingBox()
    expect(bounds!.width).toBeGreaterThanOrEqual(48)
    expect(bounds!.height).toBeGreaterThanOrEqual(48)
    if (input === 'click') await label.click()
    else { await label.focus(); await label.press(input) }
    await expect(page).toHaveURL(/\/$/)
    const today = row.getByRole('button', { name: new RegExp(`^${ptBr.dates.today},`) })
    await expect(today).toHaveAttribute('aria-disabled', 'true')
    await today.click({ force: true })
    await expect(page).toHaveURL(/\/$/)
  })
}

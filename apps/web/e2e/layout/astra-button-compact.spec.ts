import { expect, type Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import { test } from './layout-test'

const conversation = '[data-shell-conversation="overlay"]'

async function openHoje(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-today-header-actions]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function waitForPlacement(page: Page) {
  await page.waitForFunction(() => document.querySelector('[data-astra-button-position]')?.getAttribute('style')?.includes('translate'))
}

async function dragButton(page: Page, x: number, y: number) {
  const box = (await page.locator('[data-astra-button]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

for (const width of [1280, 1352]) {
  test.describe(`wide Hoje Astra entry at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('renders no floating button and opens Astra from the sidebar row', async ({ page }) => {
      await openHoje(page)
      await expect(page.locator('[data-astra-button]')).toHaveCount(0)
      await page.locator('[data-shell-sidebar]').getByRole('button', { name: en.nav.astra, exact: true }).click()
      await expect(page.locator(conversation)).toBeVisible()
    })
  })
}

for (const width of [412, 840]) {
  test.describe(`compact Hoje Astra button at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('drags over the header, stops above the tab bar and opens only on a tap', async ({ page }) => {
      await openHoje(page)
      const button = page.getByRole('button', { name: en.shell.astraButton.open, exact: true })
      await expect(button).toBeVisible()
      await waitForPlacement(page)

      await dragButton(page, 0, 0)
      const top = (await button.boundingBox())!
      const list = (await page.locator('[data-shell-scroller]').boundingBox())!
      expect(top.y).toBeLessThan(list.y)
      expect(top.x).toBe(16)
      await expect(page.locator(conversation)).toHaveCount(0)

      await dragButton(page, 0, 915)
      const bottom = (await button.boundingBox())!
      const tabs = (await page.locator('[data-shell-tab-bar]').boundingBox())!
      expect(tabs.y - (bottom.y + bottom.height)).toBeGreaterThanOrEqual(16)
      await expect(page.locator(conversation)).toHaveCount(0)

      await button.click()
      await expect(page.locator(conversation)).toBeVisible()
    })

    test('floats without the canvas occlusion ring', async ({ page }) => {
      await openHoje(page)
      const button = page.locator('[data-astra-button]')
      await expect(button).toBeVisible()
      const paint = await button.evaluate(element => {
        const probe = document.createElement('i')
        probe.style.color = 'var(--bg)'
        document.body.append(probe)
        const canvas = getComputedStyle(probe).color
        probe.remove()
        return { shadow: getComputedStyle(element).boxShadow, canvas }
      })
      expect(paint.shadow).not.toMatch(/0px 0px 0px 6px/)
      expect(paint.shadow).not.toContain(paint.canvas)
    })
  })
}

import { expect, type Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import { ASTRA_BUTTON_GAP } from '@orbit/shared/utils'
import { test } from './layout-test'

const conversation = '[data-shell-conversation="overlay"]'

async function openHoje(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-today-header-actions]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

function measureStack() {
  const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
  const button = rect('[data-astra-button]')
  const create = rect('[data-shell-fab] button')
  return { top: button.top, bottom: button.bottom, left: button.left, width: button.width, createTop: create.top, createLeft: create.left,
    createWidth: create.width, tabsTop: rect('[data-shell-tab-bar]').top }
}

for (const width of [1280, 1352]) {
  test.describe(`wide Hoje Astra entry at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('renders no Astra button and opens Astra from the sidebar row', async ({ page }) => {
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

    test('sits directly above the create button, stays put through a drag and opens on a tap', async ({ page }) => {
      await openHoje(page)
      const button = page.getByRole('button', { name: en.shell.astraButton.open, exact: true })
      await expect(button).toBeVisible()
      await expect(page.locator('[data-shell-fab] button')).toBeVisible()
      const stack = await page.evaluate(measureStack)
      expect(stack.createTop - stack.bottom).toBe(ASTRA_BUTTON_GAP)
      expect(stack.left + stack.width / 2).toBe(stack.createLeft + stack.createWidth / 2)
      expect(stack.bottom).toBeLessThan(stack.tabsTop)

      await page.mouse.move(stack.left + 30, stack.top + 30)
      await page.mouse.down()
      await page.mouse.move(0, 0, { steps: 10 })
      await page.mouse.up()
      expect(await page.evaluate(measureStack)).toEqual(stack)
      await expect(page.locator(conversation)).toHaveCount(0)

      await button.click()
      await expect(page.locator(conversation)).toBeVisible()
    })

    test('draws no canvas occlusion ring', async ({ page }) => {
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

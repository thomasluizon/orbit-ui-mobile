import { expect } from '@playwright/test'
import { test } from './layout-test'

test.describe('Hoje shell before hydration', () => {
  test.use({ javaScriptEnabled: false })

  for (const [width, shell] of [[1352, 'wide'], [412, 'compact']] as const) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })

      test(`shows the ${shell} navigation on the first paint`, async ({ page }) => {
        await page.goto('/')

        const sidebar = page.locator('[data-shell-sidebar]')
        const tabBar = page.locator('[data-shell-tab-bar]')
        const orbitButton = page.locator('[data-orbit-button]')
        if (shell === 'wide') {
          await expect(sidebar).toBeVisible()
          await expect(tabBar).toBeHidden()
          await expect(orbitButton).toBeHidden()
          await expect(sidebar.locator('[data-shell-orbit-row]')).toBeVisible()
        } else {
          await expect(sidebar).toBeHidden()
          await expect(tabBar).toBeVisible()
          await expect(orbitButton).toBeVisible()
          const [button, tabs] = await Promise.all([orbitButton.boundingBox(), tabBar.boundingBox()])
          expect(button!.y + button!.height + 16).toBeLessThanOrEqual(tabs!.y)
        }
        await expect(page.locator('[data-shell-pinned-slot]')).toHaveCount(0)
      })
    })
  }
})

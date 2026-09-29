import { expect, test } from '@playwright/test'

const destinations = [
  ['Hoje', '/'],
  ['Calendário', '/calendar'],
  ['Progresso', '/progress'],
  ['Perfil', '/profile'],
  ['Habit detail', '/habits/layout-habit'],
  ['Sobre', '/about'],
  ['Avisos', '/notifications'],
  ['Busca', '/search'],
  ['Pro and Assinatura', '/upgrade'],
  ['Calendar sync', '/calendar-sync'],
  ['Support', '/support'],
  ['Onboarding', '/onboarding'],
  ['Not found', '/layout-missing'],
] as const

for (const [width, clearance] of [[412, 96], [1280, 32]] as const) {
  test.describe(`shell scroller at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const [name, path] of destinations) {
      test(`${name} clears the pinned chrome`, async ({ page }) => {
        await page.goto(path)
        const scroller = page.locator('[data-shell-scroller]')
        const chrome = page.locator('[data-shell-bottom]')
        await expect(scroller).toBeVisible()
        await expect(chrome).toBeVisible()
        await page.evaluate(() => document.fonts.ready)

        const geometry = await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight
          const lastContent = Array.from(element.children)
            .filter((child) => !child.hasAttribute('data-shell-scroll-origin') && child.getBoundingClientRect().height > 0)
            .at(-1)
          const bottom = document.querySelector('[data-shell-bottom]')
          if (!lastContent || !bottom) return null
          return {
            clearance: bottom.getBoundingClientRect().top - lastContent.getBoundingClientRect().bottom,
            padding: Number.parseFloat(getComputedStyle(element).paddingBottom),
          }
        })

        expect(geometry, `${name} has measurable shell content`).not.toBeNull()
        expect(geometry!.padding, `${name} shell owns the clearance`).toBe(clearance)
        expect(geometry!.clearance, `${name} last content clears pinned chrome`).toBeGreaterThanOrEqual(clearance - 1)
      })
    }

    test('Perfil ending card clears the composer', async ({ page }) => {
      await page.goto('/profile')
      const ending = page.getByTestId('profile-settings-group-ending')
      await expect(ending).toBeVisible()
      const scroller = page.locator('[data-shell-scroller]')
      const distance = await ending.evaluate((element) => {
        const shellScroller = element.closest('[data-shell-scroller]')
        if (!shellScroller) return null
        shellScroller.scrollTop = shellScroller.scrollHeight
        const card = element.lastElementChild
        const chrome = document.querySelector('[data-shell-bottom]')
        if (!card || !chrome) return null
        return chrome.getBoundingClientRect().top - card.getBoundingClientRect().bottom
      })
      await expect(scroller).toBeVisible()
      expect(distance).not.toBeNull()
      expect(distance!).toBeGreaterThanOrEqual(clearance - 1)
    })
  })
}

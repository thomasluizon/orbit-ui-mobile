import { expect, type Locator } from '@playwright/test'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

async function measureTab(tab: Locator) {
  return tab.evaluate((button) => {
    const indicator = button.querySelector('[data-tab-indicator]')!
    const icon = indicator.querySelector('svg')!
    const label = button.lastElementChild!
    const indicatorStyle = getComputedStyle(indicator)
    const iconStyle = getComputedStyle(icon)
    const bounds = indicator.getBoundingClientRect()
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--bg-hover)'
    probe.style.color = button.hasAttribute('aria-current') ? 'var(--primary-soft)' : 'var(--fg-3)'
    button.append(probe)
    const token = getComputedStyle(probe).backgroundColor
    const labelToken = getComputedStyle(probe).color
    probe.remove()
    return {
      buttonFill: getComputedStyle(button).backgroundColor,
      indicatorFill: indicatorStyle.backgroundColor,
      radius: Math.min(Number.parseFloat(indicatorStyle.borderTopLeftRadius), bounds.width / 2, bounds.height / 2),
      width: bounds.width,
      height: bounds.height,
      label: getComputedStyle(label).color,
      labelToken,
      icon: iconStyle.fill === 'none' ? iconStyle.stroke : iconStyle.fill,
      canvas: getComputedStyle(button.closest('nav')!).backgroundColor,
      token,
      hovered: button.matches(':hover'),
      pressed: button.matches(':active'),
    }
  })
}

for (const width of [412, 840]) {
  for (const mode of ['dark', 'light'] as const) {
    test.describe(`tab indicator hover at ${width}px in ${mode}`, () => {
      test.use({ appLocale: 'pt-BR', layoutProfile: { themePreference: mode }, viewport: { width, height: 915 } })
      test('keeps active and inactive labels on the canvas and fills only the indicator', async ({ page }) => {
        await page.goto('/profile')
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`))
        const navigation = page.getByRole('navigation', { name: ptBR.nav.mainNavigation, exact: true })
        for (const [name, active] of [[ptBR.nav.profile, true], [ptBR.nav.calendar, false]] as const) {
          const tab = navigation.getByRole('button', { name, exact: true })
          await expect(tab).toBeVisible()
          if (active) await expect(tab).toHaveAttribute('aria-current', 'page')
          else await expect(tab).not.toHaveAttribute('aria-current')
          await page.mouse.move(0, 0)
          const resting = await measureTab(tab)
          expect(resting.label).toBe(resting.labelToken)
          const target = await tab.boundingBox()
          expect(target!.width).toBeGreaterThanOrEqual(48)
          expect(target!.height).toBeGreaterThanOrEqual(48)
          await tab.hover()
          await expect.poll(async () => (await measureTab(tab)).indicatorFill).toBe(resting.token)
          const hovered = await measureTab(tab)
          expect(hovered).toMatchObject({
            buttonFill: 'rgba(0, 0, 0, 0)', indicatorFill: resting.token,
            radius: 16, width: 56, height: 32, label: resting.label, hovered: true,
          })
          expect(contrastOnSurface(hovered.label, [hovered.canvas])).toBeGreaterThanOrEqual(4.5)
          expect(contrastOnSurface(hovered.icon, [hovered.canvas, hovered.indicatorFill])).toBeGreaterThanOrEqual(3)
          await page.mouse.down()
          try {
            const pressed = await measureTab(tab)
            expect(pressed).toMatchObject({ buttonFill: hovered.buttonFill, indicatorFill: hovered.indicatorFill, label: resting.label, hovered: true, pressed: true })
          } finally {
            await page.mouse.move(0, 0)
            await page.mouse.up()
          }
        }
      })
    })
  }
}

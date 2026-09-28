import { expect, test, type Locator } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'

async function expectOneComposerRing(control: Locator): Promise<void> {
  await control.focus()
  await expect(control).toBeFocused()
  const styles = await control.evaluate((element) => {
    const controlStyle = getComputedStyle(element)
    const wrapperStyle = getComputedStyle(element.parentElement!)
    return {
      focusVisible: element.matches(':focus-visible'),
      controlOutlineStyle: controlStyle.outlineStyle,
      controlOutlineWidth: controlStyle.outlineWidth,
      wrapperOutlineStyle: wrapperStyle.outlineStyle,
      wrapperOutlineWidth: wrapperStyle.outlineWidth,
    }
  })
  expect(styles.focusVisible).toBe(true)
  expect(styles.controlOutlineStyle === 'none' || styles.controlOutlineWidth === '0px').toBe(true)
  expect(styles.wrapperOutlineStyle).toBe('solid')
  expect(styles.wrapperOutlineWidth).toBe('2px')
}

async function expectComposerControlsUseWrapperRing(container: Locator): Promise<void> {
  await expectOneComposerRing(container.locator('[data-composer-input]'))
  const attachFile = container.locator('[data-composer-input] + button')
  await expect(attachFile).toBeVisible()
  await expectOneComposerRing(attachFile)
}

for (const width of [412, 1280] as const) {
  test.describe(`Hoje composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    test('draws one focus ring', async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await page.goto('/')

      await expectComposerControlsUseWrapperRing(page.locator('[data-shell-pinned-slot]'))

      if (width === 1280) {
        await page.getByRole('button', { name: ptBr.todayAstra.openConversation }).click()
        const panel = page.locator('[data-shell-conversation="panel"]')
        await expect(panel).toBeVisible()
        await expectComposerControlsUseWrapperRing(panel)
      }
    })
  })
}

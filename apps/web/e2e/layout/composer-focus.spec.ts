import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectOneFieldIndicator } from './focus-indicators'

async function expectOneControlRing(control: Locator, forcedColors: boolean): Promise<void> {
  await expect(control).toBeFocused()
  const styles = await control.evaluate((element) => {
    for (const animation of document.getAnimations()) animation.finish()
    const controlStyle = getComputedStyle(element)
    const wrapperStyle = getComputedStyle(element.parentElement!)
    return {
      focusVisible: element.matches(':focus-visible'),
      controlOutlineStyle: controlStyle.outlineStyle,
      controlOutlineWidth: controlStyle.outlineWidth,
      controlOutlineColor: controlStyle.outlineColor,
      systemOutlineColor: (() => {
        const sample = document.createElement('span')
        sample.style.color = 'CanvasText'
        document.body.append(sample)
        const color = getComputedStyle(sample).color
        sample.remove()
        return color
      })(),
      wrapperOutlineStyle: wrapperStyle.outlineStyle,
      wrapperOutlineWidth: wrapperStyle.outlineWidth,
    }
  })
  expect(styles.focusVisible).toBe(true)
  expect(styles.controlOutlineStyle).toBe('solid')
  expect(styles.controlOutlineWidth).toBe('2px')
  expect(styles.controlOutlineColor).toBe(forcedColors ? styles.systemOutlineColor : 'rgb(196, 83, 15)')
  expect(styles.wrapperOutlineStyle === 'none' || styles.wrapperOutlineWidth === '0px').toBe(true)
}

async function expectComposerKeyboardRings(page: Page, container: Locator, forcedColors: boolean): Promise<void> {
  const mode = forcedColors ? 'forced colors' : 'normal colors'
  const field = container.locator('[data-composer-input]')
  await expectOneFieldIndicator(page, field, '[data-composer-input-row]', `composer field in ${mode}`, { forcedColors })

  for (const control of [
    container.locator('[data-composer-input] + button'),
    container.locator('[data-composer-input] + button + button'),
    container.locator('[data-composer-input] + button + button + button'),
  ]) {
    await expect(control).toBeVisible()
    await page.keyboard.press('Tab')
    await expectOneControlRing(control, forcedColors)
  }
}

for (const width of [412, 1280] as const) {
  test.describe(`Hoje composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    test('draws one focus ring', async ({ page }) => {
      await page.goto('/')

      const pinnedComposer = page.locator('[data-shell-pinned-slot]')
      await pinnedComposer.locator('[data-composer-input]').focus()
      const conversation = page.locator(`[data-shell-conversation="${width === 1280 ? 'panel' : 'overlay'}"]`)
      await expect(conversation).toBeVisible()
      await expect(page.locator('[data-composer-input]:visible')).toHaveCount(1)
      await expect(conversation.locator('[data-composer-input]')).toBeFocused()
      await expectComposerKeyboardRings(page, conversation, false)
      await page.emulateMedia({ forcedColors: 'active' })
      await expectComposerKeyboardRings(page, conversation, true)
      await page.emulateMedia({ forcedColors: 'none' })
    })
  })
}

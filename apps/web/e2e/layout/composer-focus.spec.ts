import { expect, test, type Locator, type Page } from '@playwright/test'
import messages from '@orbit/shared/i18n/en.json'

async function expectOneComposerRing(control: Locator, ringOwner: 'control' | 'wrapper', forcedColors: boolean): Promise<void> {
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
  if (ringOwner === 'wrapper') {
    expect(styles.controlOutlineStyle === 'none' || styles.controlOutlineWidth === '0px').toBe(true)
    expect(styles.wrapperOutlineStyle).toBe('solid')
    expect(styles.wrapperOutlineWidth).toBe('2px')
  } else {
    expect(styles.controlOutlineStyle).toBe('solid')
    expect(styles.controlOutlineWidth).toBe('2px')
    expect(styles.controlOutlineColor).toBe(forcedColors ? styles.systemOutlineColor : 'rgb(196, 83, 15)')
    expect(styles.wrapperOutlineStyle === 'none' || styles.wrapperOutlineWidth === '0px').toBe(true)
  }
}

async function expectComposerKeyboardRings(page: Page, container: Locator, forcedColors: boolean): Promise<void> {
  const fieldRingOwner = forcedColors ? 'control' : 'wrapper'
  const field = container.locator('[data-composer-input]')
  await field.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expectOneComposerRing(field, fieldRingOwner, forcedColors)

  for (const control of [
    container.locator('[data-composer-input] + button'),
    container.locator('[data-composer-input] + button + button'),
    container.locator('[data-composer-input] + button + button + button'),
  ]) {
    await expect(control).toBeVisible()
    await page.keyboard.press('Tab')
    await expectOneComposerRing(control, 'control', forcedColors)
  }
}

for (const width of [412, 1280] as const) {
  test.describe(`Hoje composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    test('draws one focus ring', async ({ page }) => {
      await page.goto('/')

      const pinnedComposer = page.locator('[data-shell-pinned-slot]')
      await expectComposerKeyboardRings(page, pinnedComposer, false)
      await page.emulateMedia({ forcedColors: 'active' })
      await expectComposerKeyboardRings(page, pinnedComposer, true)
      await page.emulateMedia({ forcedColors: 'none' })

      if (width === 1280) {
        await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()
        const panel = page.locator('[data-shell-conversation="panel"]')
        await expect(panel).toBeVisible()
        await expectComposerKeyboardRings(page, panel, false)
        await page.emulateMedia({ forcedColors: 'active' })
        await expectComposerKeyboardRings(page, panel, true)
      }
    })
  })
}

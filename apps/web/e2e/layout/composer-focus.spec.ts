import { expect, test, type Locator, type Page } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'

async function expectOneComposerRing(control: Locator, ringOwner: 'control' | 'wrapper'): Promise<void> {
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
  if (ringOwner === 'wrapper') {
    expect(styles.controlOutlineStyle === 'none' || styles.controlOutlineWidth === '0px').toBe(true)
    expect(styles.wrapperOutlineStyle).toBe('solid')
    expect(styles.wrapperOutlineWidth).toBe('2px')
  } else {
    expect(styles.controlOutlineStyle).toBe('solid')
    expect(styles.controlOutlineWidth).toBe('2px')
    expect(styles.wrapperOutlineStyle === 'none' || styles.wrapperOutlineWidth === '0px').toBe(true)
  }
}

async function expectComposerKeyboardRings(page: Page, container: Locator, fieldRingOwner: 'control' | 'wrapper'): Promise<void> {
  const field = container.locator('[data-composer-input]')
  await field.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expectOneComposerRing(field, fieldRingOwner)

  for (const control of [
    container.locator('[data-composer-input] + button'),
    container.locator('[data-composer-input] + button + button'),
    container.locator('[data-composer-input] + button + button + button'),
  ]) {
    await expect(control).toBeVisible()
    await page.keyboard.press('Tab')
    await expectOneComposerRing(control, 'control')
  }
}

for (const width of [412, 1280] as const) {
  test.describe(`Hoje composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    test('draws one focus ring', async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await page.goto('/')

      const pinnedComposer = page.locator('[data-shell-pinned-slot]')
      await expectComposerKeyboardRings(page, pinnedComposer, 'wrapper')
      await page.emulateMedia({ forcedColors: 'active' })
      await expectComposerKeyboardRings(page, pinnedComposer, 'control')
      await page.emulateMedia({ forcedColors: 'none' })

      if (width === 1280) {
        await page.getByRole('button', { name: ptBr.todayAstra.openConversation }).click()
        const panel = page.locator('[data-shell-conversation="panel"]')
        await expect(panel).toBeVisible()
        await expectComposerKeyboardRings(page, panel, 'wrapper')
        await page.emulateMedia({ forcedColors: 'active' })
        await expectComposerKeyboardRings(page, panel, 'control')
      }
    })
  })
}

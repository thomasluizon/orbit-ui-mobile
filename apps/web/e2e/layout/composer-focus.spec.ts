import { expect, test, type Locator } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'

async function expectOneComposerRing(field: Locator): Promise<void> {
  await field.focus()
  await expect(field).toBeFocused()
  const styles = await field.evaluate((element) => {
    const fieldStyle = getComputedStyle(element)
    const wrapperStyle = getComputedStyle(element.parentElement!)
    return {
      fieldOutlineStyle: fieldStyle.outlineStyle,
      fieldOutlineWidth: fieldStyle.outlineWidth,
      wrapperOutlineStyle: wrapperStyle.outlineStyle,
      wrapperOutlineWidth: wrapperStyle.outlineWidth,
    }
  })
  expect(styles.fieldOutlineStyle === 'none' || styles.fieldOutlineWidth === '0px').toBe(true)
  expect(styles.wrapperOutlineStyle).toBe('solid')
  expect(styles.wrapperOutlineWidth).toBe('2px')
}

for (const width of [412, 1280] as const) {
  test.describe(`Hoje composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    test('draws one focus ring', async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await page.goto('/')

      await expectOneComposerRing(page.locator('[data-shell-pinned-slot] [data-composer-input]'))

      if (width === 1280) {
        await page.getByRole('button', { name: ptBr.todayAstra.openConversation }).click()
        const panel = page.locator('[data-shell-conversation="panel"]')
        await expect(panel).toBeVisible()
        await expectOneComposerRing(panel.locator('[data-composer-input]'))
      }
    })
  })
}

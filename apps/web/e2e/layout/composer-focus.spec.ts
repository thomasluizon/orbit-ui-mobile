import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './layout-test'
import { expectOneControlRing, expectOneFieldIndicator } from './focus-indicators'
import en from '@orbit/shared/i18n/en.json'

async function expectComposerKeyboardRings(page: Page, container: Locator, forcedColors: boolean): Promise<void> {
  const mode = forcedColors ? 'forced colors' : 'normal colors'
  const field = container.locator('[data-composer-input]')
  await field.fill('Draft')
  await expectOneFieldIndicator(page, field, '[data-composer-input-row]', `composer field in ${mode}`, { forcedColors })

  const clearInSlot = await container.locator('[data-composer-clear]').count() > 0
  for (const control of [
    ...(clearInSlot ? [container.getByRole('button', { name: en.shell.composer.clear, exact: true })] : []),
    container.getByRole('button', { name: en.shell.composer.actions, exact: true }),
  ]) {
    await expect(control).toBeVisible()
    await page.keyboard.press('Tab')
    await expectOneControlRing(control, forcedColors)
  }
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: en.shell.composer.actions, exact: true })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Home')
  const names = [...(!clearInSlot ? [en.shell.composer.clear] : []), en.shell.composer.attach.image, en.shell.composer.attach.file, en.shell.composer.voice.start]
  await expect(menu.getByRole('menuitem')).toHaveCount(names.length)
  for (const name of names) {
    const control = menu.getByRole('menuitem', { name, exact: true })
    await expect(control).toBeVisible()
    await expectOneControlRing(control, forcedColors)
    await page.keyboard.press('ArrowDown')
  }
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(container.getByRole('button', { name: en.shell.composer.actions, exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expectOneControlRing(container.getByRole('button', { name: en.shell.composer.send, exact: true }), forcedColors)
}

for (const width of [412, 1280] as const) {
  test.describe(`Hoje composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    test('draws one focus ring', async ({ page }) => {
      await page.goto('/')

      const pinnedComposer = page.locator('[data-shell-pinned-slot]')
      if (width >= 1024) await page.locator('[data-shell-astra-row]').click()
      else await pinnedComposer.locator('[data-composer-input]').focus()
      const conversation = page.locator('[data-shell-conversation="overlay"]')
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

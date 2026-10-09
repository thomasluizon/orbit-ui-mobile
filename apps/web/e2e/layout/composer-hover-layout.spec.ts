import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { hoverSettledComposerControl } from './composer-hover-state'

for (const width of [412, 1280]) {
  for (const theme of ['dark', 'light'] as const) {
    test(`disabled composer attachments keep their resting fill at ${width}px in ${theme}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 915 })
      const profile = profileSchema.parse({ ...profileFixture, themePreference: theme,
        aiMessagesUsed: profileFixture.aiMessagesLimit })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
      await page.goto('/')
      if (width >= 1024) await page.locator('[data-shell-astra-row]').click()
      const composer = page.locator(width >= 1024
        ? '[data-shell-conversation="overlay"] [data-composer-root]'
        : '[data-shell-bottom] [data-composer-root]')
      await expect(composer).toHaveAttribute('data-state', 'atLimit')
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
      const actions = composer.getByRole('button', { name: en.shell.composer.actions, exact: true })
      await actions.click()
      const menu = page.getByRole('menu', { name: en.shell.composer.actions, exact: true })
      for (const name of [en.shell.composer.attach.file, en.shell.composer.attach.image]) {
        const control = menu.getByRole('menuitem', { name, exact: true })
        await expect(control).toBeDisabled()
        await page.mouse.move(0, 0)
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await hoverSettledComposerControl(control)
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      }
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await context.setOffline(true)
      await expect(composer).toHaveAttribute('data-state', 'offline')
      await expect(actions).toBeDisabled()
      await page.mouse.move(0, 0)
      await expect(actions).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await hoverSettledComposerControl(actions)
      await expect(actions).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    })
  }
}

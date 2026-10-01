import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

for (const width of [412, 1280]) {
  for (const theme of ['dark', 'light'] as const) {
    test(`disabled composer attachments keep their resting fill at ${width}px in ${theme}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 915 })
      const profile = profileSchema.parse({ ...profileFixture, themePreference: theme,
        aiMessagesUsed: profileFixture.aiMessagesLimit })
      await setLayoutProfileSession(context, profile)
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      await page.goto('/')
      const composer = page.locator('[data-shell-bottom] [data-composer-root]')
      await expect(composer).toHaveAttribute('data-state', 'atLimit')
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
      for (const name of [en.chat.attachFile, en.chat.attachImage]) {
        const control = composer.getByRole('button', { name, exact: true })
        await expect(control).toBeDisabled()
        await page.mouse.move(0, 0)
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        const bounds = (await control.boundingBox())!
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        await page.waitForTimeout(300)
        expect(await control.evaluate((element) => element.matches(':hover'))).toBe(true)
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      }
    })
  }
}

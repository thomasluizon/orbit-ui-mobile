import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', weekStartDay: 1 })

for (const width of [412, 1352]) {
  test.describe(`calendar profile frame at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 }, layoutProfile: profile })

    test('keeps the same Semana radio connected and focused after profile loading', async ({ page, context }) => {
      let releaseProfile = () => {}
      let markProfileRequested = () => {}
      const pendingProfile = new Promise<void>((resolve) => { releaseProfile = resolve })
      const profileRequested = new Promise<void>((resolve) => { markProfileRequested = resolve })
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, async (route) => {
        markProfileRequested()
        await pendingProfile
        await route.fulfill({ json: profile })
      })
      try {
        await page.goto('/calendar')
        await profileRequested
        const radio = page.getByRole('radio', { name: ptBR.calendar.view.week, exact: true })
        await radio.focus()
        await expect(radio).toBeFocused()
        await expect(page.getByTestId('calendar-grid-card').getByRole('progressbar')).toBeVisible()
        const originalRadio = await radio.elementHandle()
        expect(originalRadio).not.toBeNull()
        const profileResponse = page.waitForResponse((response) => response.url() === `${LAYOUT_ORIGIN}${API.profile.get}`)
        releaseProfile()
        await profileResponse
        await expect(page.getByTestId('calendar-grid-card').getByRole('progressbar')).toHaveCount(0)
        expect(await originalRadio!.evaluate((element) => ({
          connected: element.isConnected,
          focused: document.activeElement === element,
        }))).toEqual({ connected: true, focused: true })
        await originalRadio!.dispose()
      } finally {
        releaseProfile()
      }
    })
  })
}

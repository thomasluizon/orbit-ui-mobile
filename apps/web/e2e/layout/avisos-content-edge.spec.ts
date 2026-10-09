import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { completeInstallOnboarding } from './install-onboarding'
import { setLayoutProfileSession } from './profile-session'

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [412, 840, 1100, 1352]) {
    for (const populated of [true, false]) {
      test(`Avisos ${populated ? 'rows' : 'empty state'} share the content edge at ${width}px in ${locale}`, async ({ page, context }) => {
        const words = locale === 'en' ? en : ptBr
        await page.setViewportSize({ width, height: 915 })
        await completeInstallOnboarding(page)
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        const items = populated ? [0, 1, 2].map((index) => createMockNotification({ id: `avisos-edge-${index}`, title: `Alert ${index}`, url: '/progress' })) : []
        await context.route(`${LAYOUT_ORIGIN}${API.notifications.list}`, (route) => route.fulfill({
          json: notificationsResponseSchema.parse({ items, unreadCount: items.length }),
        }))
        await page.goto('/notifications')
        const list = page.getByRole('list', { name: words.notifications.title })
        await expect(list).toHaveAttribute('aria-busy', 'false')
        await expect(list.getByRole('listitem')).toHaveCount(populated ? 3 : 1)
        if (populated) await expect(list.getByRole('listitem').first()).toContainText(items[0]!.title)
        else await expect(list).toContainText(words.notifications.empty)
        const back = page.getByRole('button', { name: words.common.back, exact: true })
        await expect(back).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const backLeft = await back.evaluate((element) => element.getBoundingClientRect().left)
        const rowLeft = await list.getByRole('listitem').first().evaluate((element) => element.getBoundingClientRect().left)
        expect(Math.abs(rowLeft - backLeft - 8)).toBeLessThanOrEqual(0.5)
        expect(await list.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(560)
      })
    }
  }
}

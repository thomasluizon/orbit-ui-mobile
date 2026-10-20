import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './layout-test'
import { LAYOUT_ORIGIN } from '../support/env'
import { openSignIn } from '../support/sign-in-entry'

test.use({ storageState: { cookies: [], origins: [] } })

for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
  test(`${locale} smoke entry uses the fresh account action and returns directly to login`, async ({ page, context }) => {
    await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
    const visits: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visits.push(new URL(frame.url()).pathname)
    })

    await openSignIn(page)

    expect(visits).toContain('/onboarding')
    await expect(page).toHaveURL((url) => url.pathname === '/login')
    await expect(page.getByRole('textbox', { name: messages.auth.email, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: messages.onboarding.flow.what.haveAccount, exact: true })).toHaveCount(0)
    visits.length = 0

    await openSignIn(page)

    expect(visits).not.toContain('/onboarding')
    await expect(page).toHaveURL((url) => url.pathname === '/login')
    await expect(page.getByRole('textbox', { name: messages.auth.email, exact: true })).toBeVisible()
  })
}

import { expect } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { completeInstallOnboarding } from './install-onboarding'
import { test } from './layout-test'
import { inspectControls } from './interaction-fill-states'
import { layoutRouteInventory } from './layout-route-inventory'
import { installInteractionFillFixtures } from './interaction-fill-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

for (const width of [320, 412, 600, 1024, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`interaction fill clearance at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, contextOptions: { reducedMotion: 'reduce' } })
      for (const { path: route, hasControls } of layoutRouteInventory) {
        test(`${route} keeps fills clear of neighbours`, async ({ page, context }) => {
          test.setTimeout(120_000)
          await installInteractionFillFixtures(context, route, locale)
          if (route !== '/onboarding') await completeInstallOnboarding(page)
          if (route === '/login') await context.clearCookies({ name: /^(auth_token|refresh_token)$/ })
          await page.goto(route)
          await page.evaluate(() => document.fonts.ready)
          if (hasControls) await expect(page.locator('h1:visible').first()).toBeVisible()
          if (route === '/chat') await expect(page.getByRole('button', { name: (locale === 'en' ? en : ptBR).common.closeConversation })).toBeVisible()
          if (route === '/habits/habit-1') await expect(page.locator('.orbit-habit-rename')).toBeVisible()
          const controls = page.locator(':is(button, a[href], input, textarea, select, summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [tabindex="0"]):visible:not(:disabled):not([aria-disabled="true"])')
          const count = await controls.count()
          if (hasControls) expect(count, `${route} control inventory`).toBeGreaterThan(0)
          await inspectControls(page, controls, `${route}, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE)
        })
      }
    })
  }
}

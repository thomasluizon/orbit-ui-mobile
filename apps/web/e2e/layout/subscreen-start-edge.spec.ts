import { expect, type Locator } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { completeInstallOnboarding } from './install-onboarding'

async function assertStartEdge(body: Locator, back: Locator) {
  await expect(body).toBeVisible()
  await expect(back).toBeVisible()
  await expect.poll(async () => {
    const backElement = await back.elementHandle()
    try {
      return await body.evaluate((element, control) => {
        if (!element.isConnected || !control.isConnected) return Infinity
        const bodyBounds = element.getBoundingClientRect()
        const backBounds = control.getBoundingClientRect()
        if (!bodyBounds.width || !backBounds.width) return Infinity
        return Math.abs(bodyBounds.left - backBounds.left - 8)
      }, backElement)
    } finally {
      await backElement.dispose()
    }
  }).toBeLessThanOrEqual(0.5)
}

async function assertCap(box: Locator, maximum: number) {
  const width = await box.evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeLessThanOrEqual(maximum)
}

async function assertContentWidth(body: Locator, back: Locator, viewportWidth: number, cap: number) {
  const columnWidth = await back.evaluate((element) => element.closest('header')!.getBoundingClientRect().width)
  const expected = viewportWidth < 1024 ? columnWidth - 32 : Math.min(columnWidth - 32, cap)
  const width = await body.evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeCloseTo(expected, 0)
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const subscriptionState of ['free', 'lapsed', 'stripe'] as const) {
    test.describe(`${subscriptionState} sub-screen edges in ${locale}`, () => {
      test.use({ appLocale: locale, subscriptionState })
      for (const width of [412, 840, 1100, 1352]) {
        test(`aligns About, Support and upgrade at ${width}px`, async ({ page }) => {
          const words = locale === 'en' ? en : ptBR
          await page.setViewportSize({ width, height: 915 })
          await completeInstallOnboarding(page)
          const back = page.getByRole('button', { name: words.common.backToProfile })

          await page.goto('/about')
          const identity = page.getByTestId('about-identity')
          await expect(identity).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          await assertStartEdge(identity, back)
          await assertContentWidth(identity, back, width, 620)
          await assertContentWidth(page.getByTestId('about-facts'), back, width, 620)

          await page.goto('/support')
          const form = page.locator('form')
          const control = form.getByRole('radio').first()
          await expect(control).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          await assertStartEdge(control, back)
          await assertCap(form, 520)

          await page.goto('/upgrade')
          const upgrade = page.locator('[data-upgrade-screen]')
          await expect(upgrade).toHaveAttribute('data-state', subscriptionState)
          await expect(upgrade).toHaveAttribute('aria-busy', 'false')
          const body = subscriptionState === 'free'
            ? upgrade.getByRole('heading', { name: words.upgrade.convert.freeHeading })
            : upgrade.locator('section').first()
          await expect(body).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          await assertStartEdge(body, back)
          await assertContentWidth(body, back, width, subscriptionState === 'free' ? 652 : 560)
        })
      }
    })
  }
}

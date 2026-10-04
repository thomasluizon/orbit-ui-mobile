import { expect, type Locator } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

async function expectPeriodFillsColumn(control: Locator) {
  await expect(control.getByRole('radio')).toHaveCount(2)
  const geometry = await control.evaluate((group) => {
    const bounds = group.getBoundingClientRect()
    const column = group.parentElement!.parentElement!.getBoundingClientRect()
    const segments = [...group.querySelectorAll('[role="radio"]')].map((segment) => {
      const box = segment.getBoundingClientRect()
      return { top: box.top, width: box.width, height: box.height }
    })
    return { left: bounds.left, width: bounds.width, columnLeft: column.left, columnWidth: column.width, segments }
  })
  expect(geometry.left).toBeCloseTo(geometry.columnLeft, 0)
  expect(geometry.width).toBeCloseTo(geometry.columnWidth, 0)
  expect(geometry.segments[0]!.top).toBeCloseTo(geometry.segments[1]!.top, 0)
  expect(geometry.segments[0]!.width).toBeCloseTo(geometry.segments[1]!.width, 0)
  for (const segment of geometry.segments) expect(segment.height).toBeGreaterThanOrEqual(48)
  await expectLabelsFit(control.page(), control)
}

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const subscriptionState of ['free', 'trial'] as const) {
      test.describe(`Orbit Pro ${locale} ${subscriptionState} at ${width}px`, () => {
        test.use({ appLocale: locale, subscriptionState, viewport: { width, height: 915 } })

        test('keeps period segments and allowance captions whole', async ({ page }) => {
          await page.goto('/upgrade')
          const screen = page.locator('[data-upgrade-screen]')
          await expect(screen.locator('[data-tier-reservation]')).toHaveCount(0)
          await expect(screen.locator('[data-tier]')).toHaveCount(2)
          await expect(screen.locator('[data-tier="yearly"]')).toBeVisible()
          await expect(screen.locator('[data-tier="monthly"]')).toBeVisible()
          await expect(screen.getByRole('progressbar')).toHaveCount(0)
          await page.evaluate(() => document.fonts.ready)
          const allowance = screen.getByRole('region', { name: words.upgrade.convert.allowanceLabel, exact: true })
          const captions = allowance.getByText(words.upgrade.convert.perDay, { exact: true })
          await expect(captions).toHaveCount(2)
          for (const label of [words.upgrade.free, 'Pro', words.upgrade.convert.freeAllowance, words.upgrade.convert.proAllowance]) {
            await markRequiredLabels(allowance.getByText(label, { exact: true }))
          }
          await markRequiredLabels(captions)
          await expectLabelsFit(page, allowance)
          const control = screen.getByRole('radiogroup', { name: words.upgrade.plans.intervalLabel, exact: true })
          await expectPeriodFillsColumn(control)
          const monthly = control.getByRole('radio', { name: words.upgrade.plans.interval.monthly, exact: true })
          await expectInteractionFill(monthly)
          await monthly.click()
          await expect(monthly).toHaveAttribute('aria-checked', 'true')
          await expectPeriodFillsColumn(control)
        })
      })
    }
  }
}

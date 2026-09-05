import { expect, type Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { plural } from '@orbit/shared/utils/plural'
import { test } from './upgrade-fixtures'

function singleLineLabels(messages: typeof en, trial: boolean): string[] {
  return [
    ...(trial ? [
      plural(messages.upgrade.convert.trialDaysLeft.replaceAll('{days}', '14'), 14),
      messages.upgrade.convert.trialHeading,
    ] : [
      messages.upgrade.convert.freeEyebrow,
      messages.upgrade.convert.freeHeading,
      messages.upgrade.convert.trustLine,
    ]),
    messages.upgrade.convert.promise,
    messages.upgrade.free,
    'Pro',
    messages.upgrade.convert.freeAllowance,
    messages.upgrade.convert.proAllowance,
    messages.upgrade.convert.perDay,
    ...Object.values(messages.upgrade.outcomes).flatMap((outcome) =>
      typeof outcome === 'string' ? [] : [outcome.title]),
    messages.upgrade.plans.interval.monthly,
    messages.upgrade.plans.interval.annual,
    messages.upgrade.plans.monthly.name,
    messages.upgrade.plans.yearly.name,
    messages.upgrade.plans.recommended,
    messages.upgrade.plans.cta,
    messages.upgrade.convert.cancelAnytime,
    messages.upgrade.convert.stayFree,
  ]
}

async function renderedLineCounts(page: Page, label: string): Promise<number[]> {
  return page.locator('main').last().getByText(label, { exact: true }).evaluateAll((elements) =>
    elements.map((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return new Set(
        Array.from(range.getClientRects()).map((rect) => Math.round(rect.top * 10) / 10),
      ).size
    }),
  )
}

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const subscriptionState of ['free', 'trial'] as const) {
    for (const width of [412, 640] as const) {
      test.describe(`${locale} ${subscriptionState} at ${width}px`, () => {
        test.use({ appLocale: locale, subscriptionState, viewport: { width, height: 1400 } })

        test('keeps labels on one line and copy inside its box', async ({ page }) => {
          await page.goto('/upgrade')
          const main = page.locator('main').last()
          const heading = subscriptionState === 'trial'
            ? messages.upgrade.convert.trialHeading : messages.upgrade.convert.freeHeading
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
          await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible()
          await expect(main.getByText(messages.upgrade.convert.stayFree, { exact: true })).toBeVisible()
          await page.evaluate(() => document.fonts.ready)

          const overflows = await main.evaluate((root) =>
            Array.from(root.querySelectorAll('p,h1,h2,a,button,span'))
              .filter((element) => element.textContent.trim())
              .filter((element) => element.scrollWidth > element.getBoundingClientRect().width + 0.5)
              .map((element) => element.textContent.trim()),
          )
          expect(overflows, `copy stays inside the layout at ${width}px`).toEqual([])

          for (const label of singleLineLabels(messages, subscriptionState === 'trial')) {
            const lines = await renderedLineCounts(page, label)
            expect(lines.length, `${label} is present at ${width}px`).toBeGreaterThan(0)
            expect(lines.every((count) => count === 1), `${label} stays on one line at ${width}px; lines=${lines.join(',')}`).toBe(true)
          }

          const allowance = main.getByRole('region', { name: messages.upgrade.convert.allowanceLabel })
            .getByText(messages.upgrade.convert.freeAllowance, { exact: true })
          await expect(allowance).toHaveCSS('font-size', width === 412 ? '34px' : '44px')
        })
      })
    }
  }
}

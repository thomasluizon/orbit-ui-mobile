import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { profileSchema } from '@orbit/shared/types/profile'
import { buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { test } from './layout-test'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'

for (const width of [320, 412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`Progress chart in ${locale} at ${width}`, () => {
      test.use({ viewport: { width, height: 900 } })
      test('selects full columns without scrolling and keeps edge readouts inside the chart', async ({ page, context }) => {
        const words = locale === 'en' ? en : ptBR
        const profile = profileSchema.parse({ ...profileFixture, language: locale, hasProAccess: true, canViewGamification: true })
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await setLayoutProfileSession(context, profile)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        const retrospective = retrospectiveResponseSchema.parse({
          period: 'month', fromCache: false,
          narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
          metrics: createMockRetrospectiveMetrics({ completionSeries: { granularity: 'day', points: Array.from({ length: 30 }, (_, index) => ({
            startDate: `2026-09-${String(index + 1).padStart(2, '0')}`, endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
            scheduled: index === 0 ? 0 : 4, completed: index < 2 ? 0 : 2,
            completionRate: index === 0 ? null : index === 1 ? 0 : 50,
          })) } }),
        })
        await context.route(`${LAYOUT_ORIGIN}${buildRetrospectiveRequestUrl('month', locale)}`, (route) => route.fulfill({ json: retrospective }))
        await page.goto('/progress')
        const chart = page.getByTestId('bar-chart')
        const group = chart.getByRole('radiogroup', { name: words.progressScreen.window.chartLabel })
        const radios = group.getByRole('radio')
        await expect(radios).toHaveCount(30)
        await expect(chart.getByRole('slider')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        const columns = await radios.evaluateAll((targets) => targets.map((target) => {
          const box = target.getBoundingClientRect()
          const plot = target.parentElement!.getBoundingClientRect()
          return { left: box.left - plot.left, right: box.right - plot.left, height: box.height, width: plot.width }
        }))
        expect(columns[0]!.left).toBe(0)
        for (const [index, column] of columns.entries()) {
          expect(column.height).toBeGreaterThanOrEqual(48)
          if (index > 0) expect(column.left).toBeCloseTo(columns[index - 1]!.right, 1)
          expect(column.right).toBeLessThanOrEqual(column.width + 0.1)
        }
        expect(columns.at(-1)!.right).toBeCloseTo(columns[0]!.width, 1)
        const readout = chart.locator('[data-slot="bar-chart-readout"]')
        for (const index of [0, 29]) {
          await radios.nth(index).click()
          await expect(radios.nth(index)).toHaveAttribute('aria-checked', 'true')
          await expect(readout).toHaveText(await radios.nth(index).getAttribute('aria-label') as string)
          await expect(async () => {
            const bounds = await chart.boundingBox()
            const text = await readout.boundingBox()
            expect(text!.x).toBeGreaterThanOrEqual(bounds!.x)
            expect(text!.x + text!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.1)
          }).toPass()
        }
        await radios.nth(29).focus()
        await page.keyboard.press('Home')
        await expect(radios.first()).toBeFocused()
        await page.keyboard.press('ArrowRight')
        await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
        await expect(readout).toContainText('0%')
        expect(await chart.locator('path[data-empty]').evaluateAll((paths) => paths.map((path) => (path as SVGGraphicsElement).getBBox().height))).toEqual([4, 4])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })
    })
  }
}

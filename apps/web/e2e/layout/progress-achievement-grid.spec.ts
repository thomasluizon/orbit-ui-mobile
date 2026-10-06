import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockAchievement } from '@orbit/shared/__tests__/factories'
import { gamificationProfileSchema } from '@orbit/shared/types/gamification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { gamificationProfileFixture } from '../../test-support/hermetic/mock-api/fixtures/gamification'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const achievements = ['first_orbit', 'liftoff', 'mission_control'].map((id, index) =>
  createMockAchievement({ id, isEarned: index === 0 }),
)
const gamification = gamificationProfileSchema.parse({
  ...gamificationProfileFixture,
  isPro: true,
  achievementsLocked: false,
  achievementsEarned: 1,
  achievementsTotal: achievements.length,
  achievements,
})

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Achievement grid in ${locale}`, () => {
    test.use({ appLocale: locale, subscriptionState: 'stripe', layoutProfile: { canViewGamification: true }, colorScheme: 'dark' })
    const words = locale === 'pt-BR' ? ptBR : en

    for (const width of [840, 1100, 1352]) {
      test(`aligns two columns and the last tile at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await context.route(`${LAYOUT_ORIGIN}${API.gamification.profile}`, (route) => route.fulfill({ json: gamification }))
        await page.goto('/progress')
        const section = page.getByRole('region', { name: words.progressScreen.sections.achievements })
        const tiles = section.locator('[data-achievement-id]')
        await expect(tiles).toHaveCount(3)
        await expect(section.getByText(words.progressScreen.achievements.earnedLabel, { exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const expectedGap = width >= 1024 ? 16 : 12
        await expect(async () => {
          const geometry = await tiles.evaluateAll((elements) => {
            const tiles = elements.map((element) => element.getBoundingClientRect())
            const section = elements[0]!.closest('section')!
            const bounds = section.getBoundingClientRect()
            const style = getComputedStyle(section)
            return {
              left: bounds.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
              right: bounds.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight),
              tiles: tiles.map((tile) => ({ left: tile.left, right: tile.right, top: tile.top, bottom: tile.bottom, width: tile.width })),
            }
          })
          const [first, second, third] = geometry.tiles
          expect(Math.abs(first!.left - geometry.left)).toBeLessThanOrEqual(0.5)
          expect(Math.abs(second!.right - geometry.right)).toBeLessThanOrEqual(0.5)
          expect(Math.abs(second!.top - first!.top)).toBeLessThanOrEqual(0.5)
          for (const tile of geometry.tiles) expect(Math.abs(tile.width - first!.width)).toBeLessThanOrEqual(0.5)
          expect(Math.abs(second!.left - first!.right - expectedGap)).toBeLessThanOrEqual(0.5)
          expect(Math.abs(third!.top - Math.max(first!.bottom, second!.bottom) - expectedGap)).toBeLessThanOrEqual(0.5)
          expect(Math.abs(third!.left - geometry.left)).toBeLessThanOrEqual(0.5)
        }).toPass()
      })
    }
  })
}

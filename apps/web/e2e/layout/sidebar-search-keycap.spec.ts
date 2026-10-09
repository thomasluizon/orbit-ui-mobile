import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const platforms = [
  { name: 'default', hint: 'Ctrl K' },
  { name: 'macOS', hint: '⌘K', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
] as const

for (const width of [1100, 1352, 1440]) {
  for (const [locale, messages] of [['pt-BR', ptBR], ['en', en]] as const) {
    for (const platform of platforms) {
      for (const theme of ['dark', 'light'] as const) {
        test.describe(`Search keycaps at ${width}px in ${locale} on ${platform.name} in ${theme}`, () => {
          test.use({ viewport: { width, height: 900 }, ...('userAgent' in platform ? { userAgent: platform.userAgent } : {}) })

          test('mirrors the leading icon and shares palette footer geometry', async ({ page, context }) => {
            const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: theme })
            await setLayoutProfileSession(context, profile)
            await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
            await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
            await page.goto('/search')
            const control = page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.nav.search })
            const sidebarKeycap = control.locator('kbd')
            await expect(sidebarKeycap).toHaveText(platform.hint)
            await page.evaluate(() => document.fonts.ready)
            const measured = await control.evaluate((button) => {
              const field = button.getBoundingClientRect()
              const icon = button.querySelector('svg')!.getBoundingClientRect()
              const keycap = button.querySelector('kbd')!
              const bounds = keycap.getBoundingClientRect()
              const style = getComputedStyle(keycap)
              const probe = document.createElement('span')
              probe.style.color = 'var(--fg-3)'
              probe.style.fontFamily = 'var(--font-mono)'
              probe.style.boxShadow = 'inset 0 0 0 1px var(--hairline)'
              button.append(probe)
              const expected = getComputedStyle(probe)
              const result = {
                icon: { leading: icon.left - field.left, top: icon.top - field.top, bottom: field.bottom - icon.bottom },
                keycap: { trailing: field.right - bounds.right, top: bounds.top - field.top, bottom: field.bottom - bounds.bottom },
                paint: { height: bounds.height, padding: style.padding, radius: style.borderRadius, background: style.backgroundColor,
                  shadow: style.boxShadow, font: style.fontFamily, size: style.fontSize, color: style.color },
                expectedColor: expected.color, expectedShadow: expected.boxShadow, expectedFont: expected.fontFamily,
              }
              probe.remove()
              return result
            })
            expect(measured.icon.leading).toBeCloseTo(12, 1)
            expect(measured.icon.top).toBeCloseTo(14, 1)
            expect(measured.icon.bottom).toBeCloseTo(14, 1)
            expect(Math.abs(measured.keycap.trailing - measured.icon.leading)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(measured.keycap.top - measured.icon.top)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(measured.keycap.bottom - measured.icon.bottom)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(measured.paint.height - 20)).toBeLessThanOrEqual(0.5)
            expect(measured.paint.padding).toBe('0px 4px')
            expect(measured.paint.radius).toBe('8px')
            expect(measured.paint.background).toBe('rgba(0, 0, 0, 0)')
            expect(measured.paint.shadow).toBe(measured.expectedShadow)
            expect(measured.paint.font).toBe(measured.expectedFont)
            expect(measured.paint.size).toBe('12px')
            expect(measured.paint.color).toBe(measured.expectedColor)
            await expect(sidebarKeycap).toHaveAttribute('data-keycap', '')
            await control.click()
            const palette = page.getByRole('dialog', { name: messages.command.title })
            await expect(palette).toBeVisible()
            await expect(palette.locator('kbd')).toHaveText(['↑↓', '↵', 'esc'])
            await expect(palette.locator('kbd[data-keycap]')).toHaveCount(3)
            const footer = await palette.locator('kbd').evaluateAll((keys) => keys.map((key) => {
              const style = getComputedStyle(key)
              return { height: key.getBoundingClientRect().height, padding: style.padding, radius: style.borderRadius,
                background: style.backgroundColor, shadow: style.boxShadow, font: style.fontFamily, size: style.fontSize, color: style.color }
            }))
            for (const keycap of footer) expect(keycap).toEqual(measured.paint)
          })
        })
      }
    }
  }
}

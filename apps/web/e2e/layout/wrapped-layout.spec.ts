import { expect, test } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { profileSchema } from '@orbit/shared/types/profile'
import { buildRecapRequestUrl, buildWrappedSlides } from '@orbit/shared/utils'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { resolveWebThemeVariables } from '../../lib/theme-dom'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const recap = recapResponseSchema.parse(createMockRecap())
const finalSlideIndex = buildWrappedSlides(recap).length - 1
const themeVariables = resolveWebThemeVariables('orange', 'dark')

function computedCssColor(value: string): string {
  if (value.startsWith('#')) {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
    return `rgb(${channels.join(', ')})`
  }
  return value.replace(/\s*,\s*/g, ', ')
}

const selectedBackground = computedCssColor(themeVariables['--primary-dim']!)
const unselectedBackground = computedCssColor(themeVariables['--bg-well']!)
const selectedRing = `${computedCssColor(themeVariables['--primary']!)} 0px 0px 0px 1.5px inset`
const unselectedRing = `${computedCssColor(themeVariables['--hairline']!)} 0px 0px 0px 1px inset`

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [320, 412, 640, 1440] as const) {
    test.describe(`${locale} Wrapped final page at ${width}px`, () => {
      test.use({ viewport: { width, height: 1400 } })

      test('keeps the Pager actions visible without horizontal overflow', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await context.addInitScript(() => {
          Object.defineProperties(navigator, {
            share: { configurable: true, value: async () => undefined },
            canShare: { configurable: true, value: () => true },
          })
        })
        await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`,
          (route) => route.fulfill({ json: recap }))

        await page.goto('/wrapped')
        const periodGroup = page.getByRole('group', { name: messages.wrapped.periodGroup })
        await expect(periodGroup.getByRole('button')).toHaveCount(3)
        const chipStyles = await periodGroup.getByRole('button').evaluateAll((buttons) => {
          const expectedFontSize = getComputedStyle(document.documentElement).getPropertyValue('--fs-sm').trim()
          return buttons.map((button) => {
            const selected = button.getAttribute('aria-pressed') === 'true'
            const style = getComputedStyle(button)
            return {
              selected,
              fontSize: style.fontSize,
              expectedFontSize,
              background: style.backgroundColor,
              ring: style.boxShadow,
              height: button.getBoundingClientRect().height,
            }
          })
        })
        expect(chipStyles.filter((chip) => chip.selected)).toHaveLength(1)
        for (const chip of chipStyles) {
          expect(chip.fontSize).toBe(chip.expectedFontSize)
          expect(chip.background).toBe(chip.selected ? selectedBackground : unselectedBackground)
          expect(chip.ring).toBe(chip.selected ? selectedRing : unselectedRing)
          expect(chip.height).toBeGreaterThanOrEqual(44)
        }
        await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
        for (const id of ['wrapped-previous-zone', 'wrapped-next-zone']) {
          const zone = page.getByTestId(id)
          await expect(zone).toHaveAttribute('tabindex', '-1')
          await expect(zone.locator('..')).toHaveAttribute('aria-hidden', 'true')
        }
        if (width === 412) {
          await page.evaluate(() => document.fonts.ready)
          const frame = await page.getByTestId('wrapped-frame').boundingBox()
          const introTitle = await page.getByTestId('wrapped-slide-intro').locator('h1').boundingBox()
          expect(frame).not.toBeNull()
          expect(introTitle).not.toBeNull()
          expect(Math.abs(introTitle!.x - frame!.x - 16)).toBeLessThanOrEqual(1)
        }
        const pager = page.getByTestId('wrapped-pager')
        for (let index = 0; index < finalSlideIndex; index += 1) {
          await pager.getByRole('button', { name: messages.wrapped.next, exact: true }).click()
        }
        await expect(page.getByTestId('wrapped-slide-share')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)

        const narrowActions = pager.getByTestId('wrapped-share-actions-narrow')
        const wideActions = pager.getByTestId('wrapped-share-actions-wide')
        const activeActions = width < 640 ? narrowActions : wideActions
        await expect(activeActions).toBeVisible()
        await expect(width < 640 ? wideActions : narrowActions).toBeHidden()
        await expect(pager.getByRole('button', { name: messages.wrapped.previous, exact: true })).toBeVisible()
        await expect(activeActions.getByRole('button', { name: messages.shareCard.share, exact: true })).toBeVisible()
        await expect(activeActions.getByRole('button', { name: messages.shareCard.download, exact: true })).toBeVisible()

        const actionBounds = await activeActions.locator('button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const { left, right, top, bottom } = button.getBoundingClientRect()
            return { left, right, top, bottom }
          }),
        )
        expect(actionBounds).toHaveLength(2)
        if (width < 640) {
          expect(actionBounds[1]!.top, `share actions stack at ${width}px`)
            .toBeGreaterThanOrEqual(actionBounds[0]!.bottom)
        } else {
          expect(actionBounds[1]!.left, `share actions form a row at ${width}px`)
            .toBeGreaterThanOrEqual(actionBounds[0]!.right)
        }

        const documentWidth = await page.evaluate(() => Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ))
        expect(documentWidth, `document width at ${width}px`).toBeLessThanOrEqual(width)

        const clippedActions = await pager.locator('button').evaluateAll((buttons) => {
          const pagerBounds = buttons[0]?.closest('[data-testid="wrapped-pager"]')?.getBoundingClientRect()
          if (!pagerBounds) return ['Pager missing']
          return buttons.filter((button) => {
            const bounds = button.getBoundingClientRect()
            if (bounds.width === 0 || bounds.height === 0) return false
            return bounds.left < Math.max(0, pagerBounds.left) - 0.5
              || bounds.right > Math.min(innerWidth, pagerBounds.right) + 0.5
          }).map((button) => button.textContent.trim())
        })
        expect(clippedActions, `Pager actions stay inside the viewport at ${width}px`).toEqual([])
      })
    })
  }

  for (const width of [1000, 1024, 1440] as const) {
    test.describe(`${locale} Wrapped frame at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('centres the cover and player with the wide slide treatment at the breakpoint', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`,
          (route) => route.fulfill({ json: recap }))

        await page.goto('/wrapped')
        await page.evaluate(() => document.fonts.ready)
        const mark = await page.locator('main svg[data-asset="orbit-mark"]').boundingBox()
        const coverTitle = await page.locator('main h1').boundingBox()
        const back = await page.getByRole('button', { name: messages.common.backToProfile }).boundingBox()
        const frameLeft = (width - 900) / 2
        expect(mark).not.toBeNull()
        expect(coverTitle).not.toBeNull()
        expect(back).not.toBeNull()
        expect(Math.abs(mark!.x - (frameLeft + 24))).toBeLessThanOrEqual(1)
        expect(Math.abs(coverTitle!.x - mark!.x)).toBeLessThanOrEqual(1)
        expect(back!.x).toBeGreaterThanOrEqual(frameLeft)

        await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
        const frame = await page.getByTestId('wrapped-frame').boundingBox()
        expect(frame).not.toBeNull()
        expect(Math.abs(frame!.width - 900)).toBeLessThanOrEqual(1)
        expect(Math.abs(frame!.x - (width - frame!.x - frame!.width))).toBeLessThanOrEqual(1)

        const wide = width >= 1024
        const intro = page.getByTestId('wrapped-slide-intro')
        const introPadding = await intro.evaluate((element) => {
          const style = getComputedStyle(element)
          return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
        })
        expect(introPadding).toEqual(wide
          ? ['48px', '64px', '48px', '64px']
          : ['24px', '16px', '24px', '16px'])
        expect(await intro.locator('h1').evaluate((element) => getComputedStyle(element).fontSize))
          .toBe(wide ? '44px' : '34px')

        if (wide) {
          const pager = page.getByTestId('wrapped-pager')
          for (let index = 0; index < finalSlideIndex; index += 1) {
            await pager.getByRole('button', { name: messages.wrapped.next, exact: true }).click()
            const padding = await page.locator('[data-testid^="wrapped-slide-"]').evaluate((element) => {
              const style = getComputedStyle(element)
              return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
            })
            expect(padding).toEqual(['48px', '64px', '48px', '64px'])
          }
        }
      })
    })
  }
}

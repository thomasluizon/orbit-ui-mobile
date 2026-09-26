import { expect, test } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl, buildWrappedSlides } from '@orbit/shared/utils'
import { LAYOUT_ORIGIN } from '../support/env'

const recap = recapResponseSchema.parse(createMockRecap())
const finalSlideIndex = buildWrappedSlides(recap).length - 1

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [320, 412, 640] as const) {
    test.describe(`${locale} Wrapped final page at ${width}px`, () => {
      test.use({ viewport: { width, height: 1400 } })

      test('keeps the Pager actions visible without horizontal overflow', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await context.addInitScript(() => {
          Object.defineProperties(navigator, {
            share: { configurable: true, value: async () => undefined },
            canShare: { configurable: true, value: () => true },
          })
        })
        await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`,
          (route) => route.fulfill({ json: recap }))

        await page.goto('/wrapped')
        await page.getByRole('button', { name: messages.wrapped.start, exact: true }).click()
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
}

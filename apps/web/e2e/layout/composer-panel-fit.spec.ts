import { expect, test } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [1024, 1352] as const) {
    test.describe(`${locale} Astra panel composer at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('fits the placeholder and wrapped text with reachable controls', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await page.goto('/')
        await page.getByRole('button', { name: messages.todayAstra.openConversation }).click()

        const panel = page.locator('[data-shell-conversation="panel"]')
        await expect(panel).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const field = panel.locator('[data-composer-input]')
        await expect(field).toHaveAttribute('placeholder', messages.shell.composer.placeholder)

        const empty = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          const style = getComputedStyle(input)
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')!
          context.font = style.font
          return {
            clientHeight: input.clientHeight,
            scrollHeight: input.scrollHeight,
            textWidth: context.measureText(input.placeholder).width,
            availableWidth: input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
          }
        })
        expect(empty.scrollHeight).toBe(empty.clientHeight)
        expect(empty.availableWidth).toBeGreaterThanOrEqual(empty.textWidth)

        await field.fill('Astra '.repeat(10))
        const typed = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          return { clientHeight: input.clientHeight, scrollHeight: input.scrollHeight }
        })
        expect(typed.clientHeight).toBeGreaterThan(empty.clientHeight)
        expect(typed.scrollHeight).toBe(typed.clientHeight)

        for (const name of [
          messages.chat.attachFile,
          messages.chat.attachImage,
          messages.shell.composer.voice.start,
          messages.shell.composer.send,
        ]) {
          const control = panel.getByRole('button', { name, exact: true })
          await expect(control).toBeVisible()
          const bounds = await control.boundingBox()
          expect(bounds).not.toBeNull()
          expect(bounds!.width).toBeGreaterThanOrEqual(44)
          expect(bounds!.height).toBeGreaterThanOrEqual(44)
          const panelBounds = await panel.boundingBox()
          expect(bounds!.x).toBeGreaterThanOrEqual(panelBounds!.x)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width)
        }
      })
    })
  }
}

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [320, 360, 412, 600] as const) {
    test.describe(`${locale} compact composer at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('keeps usable text with an ellipsised single-line placeholder', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await page.goto('/')
        await page.evaluate(() => document.fonts.ready)
        const field = page.locator('[data-composer-root]:visible [data-composer-input]')
        await expect(field).toHaveAttribute('placeholder', messages.shell.composer.placeholder)
        const empty = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          const style = getComputedStyle(input)
          return {
            contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            clientHeight: input.clientHeight,
            scrollHeight: input.scrollHeight,
            whiteSpace: getComputedStyle(input, '::placeholder').whiteSpace,
          }
        })
        expect(empty.contentWidth).toBeGreaterThanOrEqual(width === 320 ? 140 : 160)
        expect(empty.scrollHeight).toBe(empty.clientHeight)
        expect(empty.whiteSpace).toBe('nowrap')

        await field.fill('Astra '.repeat(10))
        const typed = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          const style = getComputedStyle(input)
          return {
            contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            whiteSpace: style.whiteSpace,
            wordBreak: style.wordBreak,
            left: input.getBoundingClientRect().left,
            right: input.getBoundingClientRect().right,
          }
        })
        expect(typed.contentWidth).toBeGreaterThanOrEqual(width === 320 ? 140 : 160)
        expect(typed.whiteSpace).toBe('pre-wrap')
        expect(typed.wordBreak).toBe('normal')
        expect(typed.left).toBeGreaterThanOrEqual(0)
        expect(typed.right).toBeLessThanOrEqual(width)
      })
    })
  }
}

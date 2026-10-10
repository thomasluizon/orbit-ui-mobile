import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { measureFieldInset } from './field-inset-geometry'

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [412, 1024, 1352] as const) {
    test.describe(`${locale} Astra full-screen composer at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('fits the placeholder and wrapped text with reachable controls', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await page.goto('/')
        await page.getByRole('button', { name: width >= 1024 ? messages.chat.title : messages.todayAstra.openConversation }).click()

        const panel = page.locator('[data-shell-conversation="overlay"]')
        await expect(panel).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const field = panel.locator('[data-composer-input]')
        await expect(field).toHaveAttribute('placeholder', messages.shell.composer.placeholder)

        const inset = await field.evaluate(measureFieldInset)
        expect(inset.paddingStart).toBe(8)
        expect(inset.paddingEnd).toBe(8)
        expect(inset.pillInset).toBeCloseTo(12, 1)

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

        const wrappedText = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          const style = getComputedStyle(input)
          const context = document.createElement('canvas').getContext('2d')!
          context.font = style.font
          const availableWidth = input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd)
          const text = 'Astra '.repeat(Math.ceil(availableWidth / context.measureText('Astra ').width) + 2)
          return { text, width: context.measureText(text).width, availableWidth }
        })
        expect(wrappedText.width).toBeGreaterThan(wrappedText.availableWidth)
        await field.fill(wrappedText.text)
        const typed = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          return { clientHeight: input.clientHeight, scrollHeight: input.scrollHeight }
        })
        expect(typed.clientHeight).toBeGreaterThan(empty.clientHeight)
        expect(typed.scrollHeight).toBe(typed.clientHeight)

        for (const name of [
          messages.shell.composer.actions,
          messages.shell.composer.send,
        ]) {
          const control = panel.getByRole('button', { name, exact: true })
          await expect(control).toBeVisible()
          const bounds = await control.boundingBox()
          expect(bounds).not.toBeNull()
          expect(bounds!.width).toBeGreaterThanOrEqual(48)
          expect(bounds!.height).toBeGreaterThanOrEqual(48)
          const panelBounds = await panel.boundingBox()
          expect(bounds!.x).toBeGreaterThanOrEqual(panelBounds!.x)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width)
        }
      })
    })
  }
}

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [320, 360, 384, 412, 600] as const) {
    for (const state of ['idle', 'offline', 'atLimit'] as const) {
      test(`${locale} compact ${state} placeholder fits or is absent at ${width}px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale,
          aiMessagesUsed: state === 'atLimit' ? profileFixture.aiMessagesLimit : 0 })
        await setLayoutProfileSession(context, profile)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await page.goto('/')
        const composer = page.locator('[data-shell-bottom] [data-composer-root]')
        await expect(composer).toHaveAttribute('data-state', state === 'offline' ? 'idle' : state)
        if (state === 'offline') await context.setOffline(true)
        await expect(composer).toHaveAttribute('data-state', state)
        await page.evaluate(() => document.fonts.ready)
        const field = composer.locator('[data-composer-input]')
        const expected = state === 'offline' ? messages.shell.composer.offline.placeholder
          : state === 'atLimit' ? messages.shell.composer.limit.placeholder : messages.shell.composer.placeholder
        await expect.poll(async () => {
          const value = await field.getAttribute('placeholder')
          return value === expected || (state !== 'idle' && value === '')
        }).toBe(true)
        const measurement = await field.evaluate(element => {
          const input = element as HTMLTextAreaElement
          const style = getComputedStyle(input)
          const context = document.createElement('canvas').getContext('2d')!
          context.font = style.font
          context.letterSpacing = style.letterSpacing
          return { textWidth: context.measureText(input.placeholder).width,
            contentWidth: input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd) }
        })
        expect(measurement.textWidth).toBeLessThanOrEqual(measurement.contentWidth)
        if (state !== 'idle') {
          await expect(field).toBeDisabled()
          await expect(composer).toContainText(state === 'offline' ? messages.shell.composer.offline.reason
            : messages.shell.composer.limit.reason.replace('{allowance}', String(profile.aiMessagesLimit)))
        }
      })
    }
  }
}

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [320, 360, 384, 412, 600] as const) {
    test.describe(`${locale} compact composer at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })

      test('keeps all controls in one pill with a whole single-line placeholder', async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile)
        await page.goto('/')
        await page.evaluate(() => document.fonts.ready)
        const field = page.locator('[data-shell-pinned-slot] [data-composer-input]')
        await expect(field).toHaveAttribute('placeholder', messages.shell.composer.placeholder)
        const empty = await field.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          const style = getComputedStyle(input)
          const context = document.createElement('canvas').getContext('2d')!
          context.font = style.font
          context.letterSpacing = style.letterSpacing
          return {
            placeholderWidth: context.measureText(input.placeholder).width,
            pillHeight: input.parentElement!.getBoundingClientRect().height,
            controls: [...input.parentElement!.querySelectorAll('button')].map((button) => ({ top: button.getBoundingClientRect().top, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
            contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            clientHeight: input.clientHeight,
            scrollHeight: input.scrollHeight,
            singleLineHeight: parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
          }
        })
        expect(empty.pillHeight).toBe(56)
        expect(empty.controls).toHaveLength(3)
        expect(new Set(empty.controls.map((control) => control.top)).size).toBe(1)
        for (const control of empty.controls) { expect(control.width).toBe(48); expect(control.height).toBe(48) }
        expect(empty.contentWidth).toBeGreaterThanOrEqual(empty.placeholderWidth)
        const inset = await field.evaluate(measureFieldInset)
        expect(inset.paddingStart).toBe(8)
        expect(inset.paddingEnd).toBe(8)
        expect(inset.pillInset).toBeCloseTo(60, 1)
        expect(empty.scrollHeight).toBe(empty.clientHeight)
        expect(empty.clientHeight).toBe(empty.singleLineHeight)

        const draft = 'Astra '.repeat(10)
        await page.getByRole('button', { name: width >= 1024 ? messages.chat.title : messages.todayAstra.openConversation }).click()
        const overlay = page.locator('[data-shell-conversation="overlay"]')
        await overlay.locator('[data-composer-input]').fill(draft)
        await page.getByRole('button', { name: messages.common.closeConversation }).click()
        await expect(overlay).toHaveCount(0)
        await expect(field).toHaveValue(draft)
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
        expect(typed.contentWidth).toBe(empty.contentWidth)
        const wrapped = await field.evaluate(measureFieldInset)
        if (width === 320) expect(wrapped.height).toBeGreaterThan(empty.clientHeight)
        expect(wrapped.height).toBeLessThanOrEqual(5 * wrapped.lineHeight + 24)
        expect(wrapped.scrollHeight).toBe(wrapped.height)
        expect(wrapped.pillInset).toBeCloseTo(60, 1)
        expect(typed.whiteSpace).toBe('pre-wrap')
        expect(typed.wordBreak).toBe('normal')
        expect(typed.left).toBeGreaterThanOrEqual(0)
        expect(typed.right).toBeLessThanOrEqual(width)
      })
    })
  }
}

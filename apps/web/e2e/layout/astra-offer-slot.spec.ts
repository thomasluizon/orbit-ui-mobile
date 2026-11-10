import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { profileSchema } from '@orbit/shared/types/profile'
import { offeredReadFixture } from '@orbit/shared/test-support/astra-offer-fixtures'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { getShellConversationEntry } from './shell-conversation-entry'
import { inspectFocusedControlRings } from './focus-indicators'

function measureOfferLabel(button: HTMLElement) {
  const bounds = button.getBoundingClientRect()
  const style = getComputedStyle(button)
  const left = bounds.left + button.clientLeft + parseFloat(style.paddingLeft)
  const right = bounds.left + button.clientLeft + button.clientWidth - parseFloat(style.paddingRight)
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
  const tops = new Set<number>()
  let fits = true
  while (walker.nextNode()) {
    const range = document.createRange()
    range.selectNodeContents(walker.currentNode)
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0) continue
      tops.add(Math.round(rect.top))
      fits &&= rect.left >= left - 1 && rect.right <= right + 1
    }
  }
  return { lines: tops.size, fits }
}

for (const width of [320, 360, 384, 412]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : pt
    test.describe(`Astra offer at ${width} in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profileSchema.parse({ ...profileFixture, language: locale, plan: 'pro', hasProAccess: true, aiMessagesUsed: 0 }) })
      test('keeps its label whole and one focus indicator per action', async ({ page, context }) => {
        const label = locale === 'en' ? 'Review Astra settings' : 'Ver configurações da Astra'
        await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => {
          const response = chatStreamEventSchema.parse({ type: 'final', response: { actions: [], aiMessage: '', parts: [{ type: 'block', kind: 'periodTotal', block: { ...offeredReadFixture, read: { ...offeredReadFixture.read, nextAction: { ...offeredReadFixture.read.nextAction, kind: 'openSurface', surface: 'ai-settings', label } } } }] } })
          return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(response)}\n\n` })
        })
        await page.goto('/')
        await getShellConversationEntry(page, width, messages).click()
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        await conversation.locator('[data-composer-input]').fill('How did I do?')
        await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
        const slot = conversation.locator('[data-astra-offer]')
        const action = slot.getByRole('button', { name: label, exact: true })
        await expect(action).toBeVisible()
        await expect(slot.getByRole('button')).toHaveCount(2)
        const geometry = await action.evaluate(measureOfferLabel)
        expect(geometry).toEqual({ lines: 1, fits: true })
        expect(await slot.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        for (const button of [action, slot.getByRole('button', { name: messages.chat.offers.dismiss })]) {
          await page.keyboard.press('Tab')
          await button.focus()
          const focus = await inspectFocusedControlRings(page)
          expect(focus?.focusVisible).toBe(true)
          expect(focus?.indicators).toHaveLength(1)
        }
        const maxWidth = await slot.evaluate(element => {
          const previous = element.style.maxWidth
          element.style.maxWidth = '80px'
          return previous
        })
        try {
          const constrained = await action.evaluate(measureOfferLabel)
          expect(constrained.lines > 1 || !constrained.fits).toBe(true)
        } finally {
          await slot.evaluate((element, previous) => { element.style.maxWidth = previous }, maxWidth)
        }
      })
    })
  }
}

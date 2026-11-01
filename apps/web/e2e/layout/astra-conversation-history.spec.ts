import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { storedConversationId } from '@orbit/shared/test-support/conversation-fixtures'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
  for (const width of [320, 1280]) {
    test.describe(`conversation delete header in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { aiMessagesUsed: 0 } })
      test('keeps all three icon actions inside the header with separate touch targets', async ({ page, context }) => {
        const finalEvent = chatStreamEventSchema.parse({ type: 'final', response: {
          aiMessage: 'Ready', actions: [], conversationId: storedConversationId,
        } })
        await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({
          contentType: 'text/event-stream', body: `data: ${JSON.stringify(finalEvent)}\n\n`,
        }))
        await page.goto('/?astra=open')
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        await conversation.locator('[data-composer-input]').fill('Review my routine')
        await conversation.getByRole('button', { name: words.shell.composer.send, exact: true }).click()
        const header = conversation.locator('[data-conversation-header] header')
        const deletion = header.getByRole('button', { name: words.chat.conversation.delete, exact: true })
        await expect(deletion).toBeVisible()
        const headerBox = (await header.boundingBox())!
        const controls = [deletion, header.getByRole('button', { name: words.chat.templates.browse }), header.getByRole('button', { name: words.common.closeConversation })]
        let previousRight = headerBox.x
        for (const control of controls) {
          const box = (await control.boundingBox())!
          expect(box.width).toBeGreaterThanOrEqual(48)
          expect(box.height).toBeGreaterThanOrEqual(48)
          expect(box.x).toBeGreaterThanOrEqual(previousRight)
          expect(box.x + box.width).toBeLessThanOrEqual(headerBox.x + headerBox.width - 16)
          previousRight = box.x + box.width + 12
          await control.focus()
          await expect(control).toBeFocused()
        }
        expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await deletion.click()
        await expect(page.getByRole('dialog')).toContainText(words.chat.conversation.deleteBody)
      })
    })
  }
}

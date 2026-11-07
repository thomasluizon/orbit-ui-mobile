import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeExecutedConversationPage, makeRevisedConversationPage, storedConversationId } from '@orbit/shared/test-support/conversation-fixtures'
import { TICKET_TASK_TITLE } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
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
        await expect(page.getByRole('dialog', { name: words.chat.conversation.deleteTitle, exact: true })).toContainText(words.chat.conversation.deleteBody)
      })
    })
  }
}

for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
  for (const width of [320, 1280]) {
    for (const outcome of ['edited', 'approved'] as const) {
      test.describe(`restored ${outcome} outcome in ${locale} at ${width}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 } })
        test('fits the read-only outcome recorded without an execution and hides the superseded proposal', async ({ page, context }) => {
          const history = makeRevisedConversationPage(outcome)
          history.turns[0]!.image = null
          await setLayoutFixtureSession(context, [{ path: API.chat.latestConversation, body: history }])
          await page.goto('/?astra=open')
          const conversation = page.locator('[data-shell-conversation="overlay"]')
          const notice = conversation.getByText(outcome === 'edited' ? words.chat.operation.edited : words.chat.conversation.approved, { exact: true })
          await expect(notice).toBeVisible()
          await expect(conversation.getByText('Evening walk', { exact: true })).toHaveCount(0)
          await expect(conversation.getByText('Read', { exact: true })).toHaveCount(0)
          await expect(conversation.getByRole('button', { name: words.chat.preview.edit, exact: true })).toHaveCount(0)
          const bounds = (await notice.boundingBox())!
          const thread = (await conversation.boundingBox())!
          expect(bounds.x).toBeGreaterThanOrEqual(thread.x)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(thread.x + thread.width)
          expect(await notice.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        })
      })
    }
  }
}

for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
  for (const width of [320, 412, 1280]) {
    test.describe(`restored approved outcome with a stored execution in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('rebuilds the done block with stacked rows, the row outcome and the open action', async ({ page, context }) => {
        const history = makeExecutedConversationPage()
        history.turns[0]!.image = null
        await setLayoutFixtureSession(context, [{ path: API.chat.latestConversation, body: history }])
        await page.goto('/?astra=open')
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        const summary = conversation.locator('[data-preview-item-meta]')
        await expect(summary).toHaveCount(1)
        await expect(conversation.getByText(words.chat.conversation.approved, { exact: true })).toHaveCount(0)
        await expect(conversation.getByText(words.blockFrame.status.done, { exact: true })).toBeVisible()
        await expect(conversation.getByRole('button', { name: words.chat.action.openEntity.replace('{name}', TICKET_TASK_TITLE), exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const row = await summary.evaluate(meta => {
          const item = meta.closest<HTMLElement>('[data-status]')!
          const style = getComputedStyle(item)
          return {
            status: item.dataset.status, direction: style.flexDirection,
            wordsWidth: item.firstElementChild!.getBoundingClientRect().width,
            wordsBottom: item.firstElementChild!.getBoundingClientRect().bottom,
            trailingTop: item.lastElementChild!.getBoundingClientRect().top,
            inner: item.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            overflow: item.scrollWidth - item.clientWidth,
          }
        })
        expect(row.status).toBe('done')
        expect(row.direction).toBe('column')
        expect(row.wordsWidth).toBeCloseTo(row.inner, 1)
        expect(row.trailingTop).toBeGreaterThanOrEqual(row.wordsBottom)
        expect(row.overflow).toBeLessThanOrEqual(1)
      })
    })
  }
}

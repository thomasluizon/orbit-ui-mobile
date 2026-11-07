import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeConversationPage, storedOperationId } from '@orbit/shared/test-support/conversation-fixtures'
import { makeBulkCreateExecutionResponse, makeTicketTaskPreview, TICKET_TASK_DESCRIPTION, TICKET_TASK_TITLE } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { conversationPageSchema, type ConversationPage } from '@orbit/shared/types/conversation'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const resultTurnId = '00000000-0000-4000-8000-000000000009'

function ticketHistory(created: boolean): ConversationPage {
  const history = makeConversationPage()
  history.turns[0]!.image = null
  history.turns[1]!.responseJson = JSON.stringify({ aiMessage: '', actions: [], pendingOperations: [{ ...makeTicketTaskPreview(), id: storedOperationId }] })
  if (created) history.turns.push({ ...history.turns[1]!, turnId: resultTurnId, order: 5, previewOutcomesJson: '[]',
    responseJson: JSON.stringify({ aiMessage: '', actions: [], operations: [{ ...makeBulkCreateExecutionResponse(['Success']).operation, pendingOperationId: storedOperationId }] }) })
  return conversationPageSchema.parse(history)
}

async function readSummary(summary: Locator) {
  return summary.evaluate(meta => {
    const text = meta.firstChild!
    const range = document.createRange()
    const breaks: string[] = []
    let previousTop: number | undefined
    for (let index = 0; index < text.textContent!.length; index++) {
      range.setStart(text, index)
      range.setEnd(text, index + 1)
      const rect = range.getClientRects()[0]
      if (!rect) continue
      if (previousTop !== undefined && rect.top > previousTop + 1) breaks.push(text.textContent!.slice(Math.max(0, index - 1), index + 1))
      previousTop = rect.top
    }
    const row = meta.closest<HTMLElement>('[data-status]')
    const rowStyle = row ? getComputedStyle(row) : null
    const words = row?.firstElementChild?.getBoundingClientRect()
    const block = meta.closest('[data-conversation-block]') ?? meta.parentElement!
    return {
      text: meta.textContent!, width: meta.getBoundingClientRect().width, overflow: meta.scrollWidth - meta.clientWidth,
      blockOverflow: block.scrollWidth - block.clientWidth, breaks, direction: rowStyle?.flexDirection,
      wordsWidth: words?.width, wordsBottom: words?.bottom, trailingTop: row?.lastElementChild?.getBoundingClientRect().top,
      rowInner: row && rowStyle ? row.getBoundingClientRect().width - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight) : undefined,
    }
  })
}

for (const width of [412, 1280]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : ptBR
    test.describe(`Astra finished preview row at ${width} in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('keeps the created task words at their pending width and breaks them only between words', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [{ path: API.chat.latestConversation, body: ticketHistory(false) }])
        await page.goto('/?astra=open')
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        const summary = conversation.locator('[data-preview-item-meta]')
        await expect(summary).toHaveCount(1)
        await page.evaluate(() => document.fonts.ready)
        const pending = await readSummary(summary)
        expect(pending.text.replace(/\u00a0/g, ' ')).toContain(TICKET_TASK_DESCRIPTION)

        await setLayoutFixtureSession(context, [{ path: API.chat.latestConversation, body: ticketHistory(true) }])
        await page.goto('/?astra=open')
        await expect(summary).toHaveCount(1)
        await expect(conversation.getByText(messages.blockFrame.status.done, { exact: true })).toBeVisible()
        await expect(conversation.getByRole('button', { name: messages.chat.action.openEntity.replace('{name}', TICKET_TASK_TITLE), exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const done = await readSummary(summary)
        expect(done.width).toBeGreaterThanOrEqual(pending.width - 0.5)
        expect(done.direction).toBe('column')
        expect(done.wordsWidth!).toBeCloseTo(done.rowInner!, 1)
        expect(done.trailingTop!).toBeGreaterThanOrEqual(done.wordsBottom!)
        expect(done.overflow).toBeLessThanOrEqual(1)
        expect(done.blockOverflow).toBeLessThanOrEqual(1)
        for (const pair of done.breaks) expect([' ', '\u00a0'], `line break inside ${JSON.stringify(pair)}`).toContain(pair[0])
      })
    })
  }
}

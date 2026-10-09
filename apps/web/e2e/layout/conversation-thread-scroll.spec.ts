import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeAgentOperationResult, makeClarificationPreviewMessage, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { agentExecuteOperationResponseSchema } from '@orbit/shared/types/ai'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const clarification = makeClarificationPreviewMessage()
const pendingOperation = { ...makeHeldHabitMessage().pendingOperations![0]!, actionKey: 'createHabit', expiresAtUtc: '2099-01-01T00:00:00Z' }
const reply = chatStreamEventSchema.parse({ type: 'final', response: {
  aiMessage: 'Podemos revisar a rotina com calma. '.repeat(80), actions: clarification.actions,
} })
const preview = agentExecuteOperationResponseSchema.parse({
  operation: makeAgentOperationResult('PendingConfirmation', 1), pendingOperation,
})

for (const width of [600, 1352]) {
  test.describe(`conversation thread scrolling at ${width}`, () => {
    test.use({ appLocale: 'pt-BR', layoutProfile: { aiMessagesUsed: 0 }, viewport: { width, height: 706 }, contextOptions: { reducedMotion: 'reduce' } })

    test.beforeEach(async ({ context }) => {
      await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({
        contentType: 'text/event-stream', body: `data: ${JSON.stringify(reply)}\n\n`,
      }))
    })

    test('brings all clarification preview actions above the composer', async ({ page, context }) => {
      await context.route(`${LAYOUT_ORIGIN}${API.ai.clarificationResolve(clarification.actions![0]!.clarificationRequest!.operationId)}`,
        route => route.fulfill({ json: preview }))
      await page.goto('/?astra=open')
      const conversation = page.locator('[data-shell-conversation="overlay"]')
      await conversation.locator('[data-composer-input]').fill('Quero criar um hábito')
      await conversation.getByRole('button', { name: pt.shell.composer.send, exact: true }).click()
      const answer = conversation.getByRole('button', { name: pt.habits.clarification.quickAction.daily, exact: true })
      await expect(answer).toBeVisible()
      await answer.click()
      for (const label of [pt.chat.operation.reject, pt.chat.operation.edit, pt.chat.operation.source.createHabit]) {
        const action = conversation.getByRole('button', { name: label, exact: true })
        await expect(action).toBeVisible()
        await expect.poll(async () => {
          const bounds = await action.boundingBox()
          const composer = await conversation.locator('[data-composer-root]').boundingBox()
          return bounds && composer && bounds.y >= 0 && bounds.y + bounds.height <= composer.y
        }).toBe(true)
      }
    })

    test('reopens a long retained conversation at the newest content', async ({ page }) => {
      await page.goto('/?astra=open')
      const conversation = page.locator('[data-shell-conversation="overlay"]')
      await conversation.locator('[data-composer-input]').fill('Quero criar um hábito')
      await conversation.getByRole('button', { name: pt.shell.composer.send, exact: true }).click()
      const feed = conversation.getByRole('feed')
      await expect(feed.getByRole('article')).toHaveCount(2)
      await expect(feed).toHaveAttribute('aria-busy', 'false')
      await feed.hover()
      await page.mouse.wheel(0, -800)
      await expect.poll(() => feed.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(100)
      await conversation.getByRole('button', { name: pt.common.closeConversation, exact: true }).click()
      await page.getByRole('button', { name: width >= 1024 ? pt.chat.title : pt.todayAstra.openConversation, exact: true }).click()
      await expect.poll(() => feed.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1)
    })
  })
}

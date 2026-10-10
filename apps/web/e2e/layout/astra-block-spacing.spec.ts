import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { chatBlockLayoutCases, makeChatBlockLayoutMessage } from '@orbit/shared/test-support/chat-block-layout'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { settleAnimations } from './settle-animations'

for (const width of [412, 600, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const scenario of chatBlockLayoutCases) {
      const messages = locale === 'en' ? en : pt
      test.describe(`${scenario.kind} block spacing at ${width} in ${locale}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 },
          layoutProfile: profileSchema.parse({ ...profileFixture, language: locale, aiMessagesUsed: 0 }) })

        test('keeps turns and blocks 16 apart and fills the composer column', async ({ page, context }) => {
          let prose = true
          await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => {
            const message = makeChatBlockLayoutMessage(scenario, prose)
            const event = chatStreamEventSchema.parse({ type: 'final', response: { ...scenario.fields, aiMessage: message.content, actions: message.actions ?? [] } })
            return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(event)}\n\n` })
          })
          await page.goto('/')
          await page.getByRole('button', { name: width >= 1024 ? messages.chat.title : messages.todayAstra.openConversation, exact: true }).click()
          const conversation = page.locator('[data-shell-conversation="overlay"]')
          const articles = conversation.getByRole('feed').getByRole('article')
          for (const withProse of [true, false]) {
            prose = withProse
            await conversation.locator('[data-composer-input]').fill('Review the routine.')
            await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
            const turn = articles.last()
            await expect(turn.locator('section[data-state]')).toHaveCount(scenario.count)
            await expect(conversation.getByRole('feed')).toHaveAttribute('aria-busy', 'false')
            await page.evaluate(() => document.fonts.ready)
            await turn.evaluate(settleAnimations)
            const geometry = await turn.evaluate((article, copyLabel) => {
              const bounds = (element: Element) => {
                const rect = element.getBoundingClientRect()
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
              }
              const copy = [...article.querySelectorAll('button')].find(button => button.textContent.trim() === copyLabel)
              return { turn: bounds(article), previous: bounds(article.previousElementSibling!),
                copy: copy ? bounds(copy) : null, blocks: [...article.querySelectorAll('section[data-state]')].map(bounds),
                composer: bounds(document.querySelector('[data-shell-conversation] [data-composer-input-row]')!),
                chips: bounds(document.querySelector('[data-shell-conversation] [data-composer-root] [role="group"]')!),
              }
            }, messages.chat.copy)
            expect(geometry.turn.top - geometry.previous.bottom).toBeCloseTo(16, 1)
            expect(geometry.blocks[0]!.top - (geometry.copy?.bottom ?? geometry.turn.top)).toBeCloseTo(withProse ? 16 : 0, 1)
            for (const [index, block] of geometry.blocks.entries()) {
              expect(block.left).toBeCloseTo(geometry.composer.left, 1)
              expect(block.right).toBeCloseTo(geometry.composer.right, 1)
              expect(block.right).toBeCloseTo(geometry.chips.right, 1)
              if (index > 0) expect(block.top - geometry.blocks[index - 1]!.bottom).toBeCloseTo(16, 1)
            }
          }
        })
      })
    }
  }
}

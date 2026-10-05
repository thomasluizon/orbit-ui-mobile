import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const questions = [
  'Quer revisar os seus hábitos e planejar a rotina pra amanhã?',
  'Quer revisar os seus hábitos e planejar a rotina pra depois?',
]
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', aiMessagesUsed: 0 })
const finalEvent = chatStreamEventSchema.parse({ type: 'final', response: {
  aiMessage: 'Podemos revisar a sua rotina.', actions: [], followUps: questions,
} })

for (const width of [320, 412, 1352]) {
  for (const textScale of [1, 2]) {
    test.describe(`follow-up questions at ${width} with text scale ${textScale}`, () => {
      test.use({ appLocale: 'pt-BR', layoutProfile: profile, viewport: { width, height: 915 } })

      test('shows whole sentences on the message edge with a gap after copy', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({
          contentType: 'text/event-stream', body: `data: ${JSON.stringify(finalEvent)}\n\n`,
        }))
        await page.goto('/')
        await page.getByRole('button', { name: pt.todayAstra.openConversation, exact: true }).click()
        const conversation = page.locator(`[data-shell-conversation="${width >= 1024 ? 'panel' : 'overlay'}"]`)
        await conversation.locator('[data-composer-input]').fill('Como posso revisar a minha rotina?')
        await conversation.getByRole('button', { name: pt.shell.composer.send, exact: true }).click()
        const group = conversation.getByRole('group', { name: pt.chat.followUps.label, exact: true })
        await expect(group).toBeVisible()
        await expect(group.getByRole('button')).toHaveCount(2)
        await page.evaluate(() => document.fonts.ready)
        await page.addStyleTag({ content: `html { font-size: ${16 * textScale}px; }` })

        const message = await conversation.locator('[data-bubble-role="ai"]').boundingBox()
        const copy = await conversation.getByRole('button', { name: pt.chat.copy, exact: true }).boundingBox()
        const label = await group.getByText(pt.chat.followUps.label, { exact: true }).boundingBox()
        expect(message).not.toBeNull()
        expect(copy).not.toBeNull()
        expect(label).not.toBeNull()
        expect(label!.y - (copy!.y + copy!.height)).toBeGreaterThanOrEqual(16)
        for (const question of questions) {
          expect(question).toHaveLength(60)
          const row = group.getByRole('button', { name: question, exact: true })
          const geometry = await row.evaluate(element => {
            const text = element.querySelector('span')!
            const bounds = element.getBoundingClientRect()
            return { left: bounds.left, title: element.getAttribute('title'),
              scrollWidth: text.scrollWidth, clientWidth: text.clientWidth,
              scrollHeight: text.scrollHeight, clientHeight: text.clientHeight,
              overflow: getComputedStyle(text).textOverflow, fontSize: parseFloat(getComputedStyle(text).fontSize) }
          })
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
          expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight)
          expect(geometry.overflow).not.toBe('ellipsis')
          expect(geometry.title).toBeNull()
          expect(Math.abs(geometry.left - message!.x)).toBeLessThanOrEqual(1)
          expect(geometry.fontSize).toBe(14 * textScale)
        }
      })
    })
  }
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', aiMessagesUsed: 0 })
const reply = 'Podemos revisar a sua rotina.'
const finalEvent = chatStreamEventSchema.parse({ type: 'final', response: {
  aiMessage: reply, actions: [],
} })

for (const width of [412, 1352]) {
  test.describe(`conversation feed at ${width}`, () => {
    test.use({ appLocale: 'pt-BR', layoutProfile: profile, viewport: { width, height: 915 } })

    test('keeps announcements local and moves focus between positioned turns', async ({ page, context }) => {
      await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({
        contentType: 'text/event-stream', body: `data: ${JSON.stringify(finalEvent)}\n\n`,
      }))
      await page.goto('/')
      await page.getByRole('button', { name: width >= 1024 ? pt.chat.title : pt.todayAstra.openConversation, exact: true }).click()
      const conversation = page.locator('[data-shell-conversation="overlay"]')
      const feed = conversation.getByRole('feed', { name: pt.chat.title, exact: true })
      await expect(feed).toBeVisible()
      for (const attribute of ['aria-live', 'aria-relevant', 'aria-atomic']) {
        await expect(feed).not.toHaveAttribute(attribute)
      }
      for (const [index, question] of ['Como posso revisar a minha rotina?', 'E amanhã?'].entries()) {
        await conversation.locator('[data-composer-input]').fill(question)
        await conversation.getByRole('button', { name: pt.shell.composer.send, exact: true }).click()
        await expect(feed.getByRole('article')).toHaveCount((index + 1) * 2)
        await expect(feed).toHaveAttribute('aria-busy', 'false')
        await expect(feed.getByRole('article').last().locator('[aria-live="polite"]')).toHaveText(reply)
      }
      const articles = feed.getByRole('article')
      for (let index = 0; index < 4; index++) {
        await expect(articles.nth(index)).toHaveAttribute('aria-posinset', String(index + 1))
        await expect(articles.nth(index)).toHaveAttribute('aria-setsize', '4')
        await expect(articles.nth(index)).toHaveAccessibleName(index % 2 === 0 ? pt.chat.senderYou : pt.chat.senderOrbit)
      }
      const nestedLiveRegions = await feed.locator('[aria-live], [role="status"]').evaluateAll(regions =>
        regions.filter(region => region.parentElement?.closest('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="log"], [role="alert"]')).length,
      )
      expect(nestedLiveRegions).toBe(0)
      await expect(feed.locator('[aria-busy]')).toHaveCount(0)
      await articles.first().focus()
      await page.keyboard.press('PageDown')
      await expect(articles.nth(1)).toBeFocused()
      await page.keyboard.press('PageUp')
      await expect(articles.first()).toBeFocused()
    })
  })
}

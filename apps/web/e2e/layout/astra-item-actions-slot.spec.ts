import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeCreateHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

for (const width of [320, 412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : pt
    const name = locale === 'en'
      ? 'Read the books I chose to learn about all the places and people around the world before breakfast every morning'
      : 'Ler os livros que escolhi para aprender sobre todos os lugares e pessoas ao redor do mundo antes do café da manhã'
    const preview = makeCreateHabitsPreview(2)
    preview.expiresAtUtc = '2099-01-01T00:00:00Z'
    preview.items = preview.items!.map((item, index) => index === 0 ? { ...item, entityName: name, fields: item.fields.map(field => ({ ...field, entityName: name, newValue: name })) } : item)
    const event = chatStreamEventSchema.parse({ type: 'final', response: { aiMessage: messages.chat.operation.approve, actions: [], pendingOperations: [preview] } })

    test.describe(`Astra typed item trailing action at ${width} in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('keeps the action beside the first line and discloses the full name', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(event)}\n\n` }))
        await page.goto('/')
        await page.getByRole('button', { name: width >= 1024 ? messages.chat.title : messages.todayAstra.openConversation, exact: true }).click()
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        await conversation.locator('[data-composer-input]').fill(name)
        await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
        const labelControl = conversation.getByRole('button', { name, exact: true })
        const action = conversation.getByRole('button', { name: `${messages.chat.operation.remove} ${name}`, exact: true })
        await expect(labelControl).toBeVisible()
        await expect(action).toBeVisible()
        await expect(labelControl).toHaveAccessibleName(name)
        await page.evaluate(() => document.fonts.ready)
        const geometry = await action.evaluate((control, name) => {
          const label = [...document.querySelectorAll<HTMLElement>('[data-personal-text]')].find(element => element.textContent === name)!
          let row = label.parentElement!
          while (!row.contains(control)) row = row.parentElement!
          const labelBounds = label.getBoundingClientRect()
          const actionBounds = control.getBoundingClientRect()
          const lineHeight = parseFloat(getComputedStyle(label).lineHeight)
          return { direction: getComputedStyle(row).flexDirection, branches: row.children.length, firstLineTop: labelBounds.top, firstLineBottom: labelBounds.top + lineHeight, labelHeight: labelBounds.height, lineHeight, labelRight: labelBounds.right, actionLeft: actionBounds.left, actionCenter: actionBounds.top + actionBounds.height / 2, actionBottom: actionBounds.bottom, rowBottom: row.getBoundingClientRect().bottom }
        }, name)
        expect(geometry.direction).toBe('row')
        expect(geometry.branches).toBe(2)
        expect(geometry.actionCenter).toBeGreaterThanOrEqual(geometry.firstLineTop - 0.5)
        expect(geometry.actionCenter).toBeLessThanOrEqual(geometry.firstLineBottom + 0.5)
        expect(geometry.labelHeight).toBeLessThanOrEqual(geometry.lineHeight * 2 + 0.5)
        expect(geometry.labelRight).toBeLessThanOrEqual(geometry.actionLeft)
        expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.rowBottom)
        await labelControl.click()
        await expect(labelControl).toHaveAttribute('aria-expanded', 'true')
        await expect(conversation.locator('[data-personal-text-expanded]').filter({ hasText: name })).toHaveText(name)
        await labelControl.click()
        await expect(labelControl).toHaveAttribute('aria-expanded', 'false')
        await expect(action).toBeVisible()
      })
    })
  }
}

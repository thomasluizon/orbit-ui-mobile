import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeDatedTaskPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { formatLocaleDate } from '@orbit/shared/utils'
import { LAYOUT_ORIGIN } from '../support/env'
import { getShellConversationEntry } from './shell-conversation-entry'
import { readTargetGeometry } from './press-shape-helpers'
import { test } from './upgrade-fixtures'

for (const width of [320, 1280]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test.describe(`Astra preview date ${width}px ${locale} ${theme}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { themePreference: theme } })

        test('fits the proposed dates, optional clear and footer around calendar selection', async ({ page, context }) => {
          const messages = locale === 'en' ? en : ptBR
          const preview = makeDatedTaskPreview()
          preview.expiresAtUtc = '2099-01-01T00:00:00Z'
          const item = preview.items![0]!
          item.fields.push({ ...item.fields[1]!, field: 'end_date', newValue: '2026-12-31', proposedValue: '2026-12-31' })
          const event = chatStreamEventSchema.parse({ type: 'final', response: { aiMessage: '', actions: [], pendingOperations: [preview] } })
          await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(event)}\n\n` }))
          await page.goto('/')
          await getShellConversationEntry(page, width, messages).click()
          const conversation = page.locator('[data-shell-conversation="overlay"]')
          await conversation.locator('[data-composer-input]').fill(item.entityName)
          await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
          await conversation.getByRole('button', { name: messages.chat.preview.edit, exact: true }).click()
          const editor = page.getByRole('dialog', { name: `${messages.chat.operation.editTitle}: ${item.entityName}`, exact: true })
          const date = editor.getByRole('button', { name: new RegExp(`^${messages.chat.operation.field.due_date},`) })
          const endDate = editor.getByRole('button', { name: new RegExp(`^${messages.chat.operation.field.end_date},`) })
          const clear = editor.getByRole('button', { name: messages.habits.form.removeEndDate, exact: true })
          const save = editor.getByRole('button', { name: messages.common.save, exact: true })
          const cancel = editor.getByRole('button', { name: messages.common.cancel, exact: true })
          await expect(date).toHaveText(formatLocaleDate('2026-11-04', locale))
          await expect(endDate).toHaveText(formatLocaleDate('2026-12-31', locale))
          await expect(save).toBeVisible()
          await expect(cancel).toBeVisible()
          for (const control of [date, endDate, clear, save, cancel]) {
            const { hit } = await readTargetGeometry(control)
            expect(hit.width).toBeGreaterThanOrEqual(48)
            expect(hit.height).toBeGreaterThanOrEqual(48)
            expect(hit.left).toBeGreaterThanOrEqual(0)
            expect(hit.right).toBeLessThanOrEqual(width)
          }
          const bounds = await editor.evaluate(element => {
            const body = element.querySelector('[data-slot="sheet-body"]')!
            const footer = element.querySelector('footer')!
            return { overflow: body.scrollWidth > body.clientWidth + 1, bodyBottom: body.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top }
          })
          expect(bounds.overflow).toBe(false)
          expect(bounds.bodyBottom).toBeLessThanOrEqual(bounds.footerTop)
          await date.click()
          const calendar = page.getByRole('dialog', { name: messages.common.selectDate, exact: true })
          await expect(calendar.locator('button[data-day="2026-11-04"]')).toHaveAttribute('aria-pressed', 'true')
          const days = calendar.locator('td button')
          await expect(days).toHaveCount(42)
          for (const day of await days.all()) {
            const box = (await day.boundingBox())!
            expect(box.width).toBeGreaterThanOrEqual(44)
            expect(box.height).toBeGreaterThanOrEqual(44)
            expect(box.x).toBeGreaterThanOrEqual(0)
            expect(box.x + box.width).toBeLessThanOrEqual(width)
          }
          await calendar.locator('button[data-day="2026-11-05"]').click()
          await expect(calendar).toHaveCount(0)
          await expect(date).toHaveText(formatLocaleDate('2026-11-05', locale))
          await expect(save).toBeVisible()
          await clear.click()
          await expect(endDate).toHaveText(messages.common.selectDate)
          await expect(endDate).toBeFocused()
          await expect(clear).toHaveCount(0)
        })
      })
    }
  }
}

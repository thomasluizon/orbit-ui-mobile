import { getShellConversationEntry } from './shell-conversation-entry'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeAgentOperationResult, makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { chatStreamEventSchema, daySummaryCardSchema } from '@orbit/shared/types/chat'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { readTargetGeometry } from './press-shape-helpers'

const finalEvent = chatStreamEventSchema.parse({ type: 'final', response: {
  aiMessage: 'Podemos revisar a sua rotina.', actions: [],
  operations: [makeAgentOperationResult('UnsupportedByPolicy', 1)],
  daySummary: daySummaryCardSchema.parse({ date: '2026-09-29', due: 3, done: 2, completionRate: 67, overdueCount: 1, currentStreak: 4, surfaceId: 'today' }),
  pendingOperations: [makePendingAgentOperation({ capabilityId: 'habits.write', displayName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', expiresAtUtc: '2099-01-01T00:00:00Z' })],
} })

for (const width of [412, 1280]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    const messages = locale === 'en' ? en : pt
    test.describe(`Block action row at ${width} in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profileSchema.parse({ ...profileFixture, language: locale, aiMessagesUsed: 0 }) })

      test('hugs lone pills and keeps the preview pair at the trailing content edge', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.chat.stream}`, route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(finalEvent)}\n\n` }))
        await page.goto('/')
        await getShellConversationEntry(page, width, messages).click()
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        await conversation.locator('[data-composer-input]').fill('Oi, como estou hoje?')
        await conversation.getByRole('button', { name: messages.shell.composer.send, exact: true }).click()
        const profile = conversation.getByRole('button', { name: messages.chat.operation.openProfile, exact: true })
        await expect(profile).toBeVisible()
        await expect(conversation.getByRole('button', { name: messages.chat.daySummary.open, exact: true })).toBeVisible()
        const preview = conversation.locator('section').filter({ has: page.getByRole('button', { name: messages.chat.operation.reject, exact: true }) })
        await expect(preview.locator('.orbit-pill-action')).toHaveCount(2)
        await page.evaluate(() => document.fonts.ready)
        const lone = await profile.evaluate(pill => {
          const style = getComputedStyle(pill)
          const children = [...pill.children].map(child => child.getBoundingClientRect().width)
          const intrinsicWidth = children.reduce((sum, child) => sum + child, 0) + Math.max(0, children.length - 1) * parseFloat(style.columnGap) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
          const frame = pill.closest('section')!
          const frameStyle = getComputedStyle(frame)
          return { intrinsicWidth, contentEnd: frame.getBoundingClientRect().right - parseFloat(frameStyle.paddingRight) - parseFloat(frameStyle.borderRightWidth) }
        })
        const loneGeometry = await readTargetGeometry(profile)
        expect(Math.abs(loneGeometry.width - lone.intrinsicWidth)).toBeLessThanOrEqual(1)
        expect(Math.abs(loneGeometry.painted.right - lone.contentEnd)).toBeLessThanOrEqual(0.5)
        const pair = await preview.evaluate(frame => {
          const style = getComputedStyle(frame)
          const pills = [...frame.querySelectorAll<HTMLButtonElement>('.orbit-pill-action')].map(pill => {
            return { size: pill.dataset.size, variant: pill.dataset.variant }
          })
          return { pills, contentEnd: frame.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth) }
        })
        const [reject, approve] = pair.pills
        const [rejectGeometry, approveGeometry] = await Promise.all((await preview.locator('.orbit-pill-action').all()).map(control => readTargetGeometry(control)))
        expect(reject!.variant).toBe('ghost')
        expect(approve!.variant).not.toBe('ghost')
        expect(Math.abs(rejectGeometry!.painted.top - approveGeometry!.painted.top)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(approveGeometry!.painted.left - rejectGeometry!.painted.right - 12)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(approveGeometry!.painted.right - pair.contentEnd)).toBeLessThanOrEqual(0.5)
        for (const geometry of [loneGeometry, rejectGeometry!, approveGeometry!]) {
          expect(geometry.height).toBe(44)
          expect(geometry.hit.width).toBeGreaterThanOrEqual(48)
          expect(geometry.hit.height).toBeGreaterThanOrEqual(48)
        }
        expect(pair.pills.map(pill => pill.size)).toEqual(['sm', 'sm'])
        await expect(preview.locator('[data-slot="action-row"]')).toHaveCount(1)
      })
    })
  }
}

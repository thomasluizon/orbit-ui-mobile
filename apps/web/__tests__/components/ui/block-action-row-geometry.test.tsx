import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeAgentOperationResult, makePendingAgentOperation, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { selectMessageOperationBlocks } from '@orbit/shared/chat'
import { daySummaryCardSchema } from '@orbit/shared/types/chat'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { OperationOutcomes } from '@/components/chat/operation-outcomes'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))

const summary = daySummaryCardSchema.parse({ date: '2026-09-29', due: 3, done: 2, completionRate: 67, overdueCount: 1, currentStreak: 4, surfaceId: 'today' })
const pending = makePendingAgentOperation({ capabilityId: 'habits.write', displayName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', expiresAtUtc: '2099-01-01T00:00:00Z' })
const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [makeAgentOperationResult('UnsupportedByPolicy', 1)] })).outcomes

const cases = [412, 1280].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale })))

describe('Block action row geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('hugs lone actions and aligns preview pairs at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : pt
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ width: Math.min(width, 600), padding: 16 }}>
        <OperationOutcomes outcomes={outcomes} />
        <DaySummaryCard daySummary={summary} />
        <PendingOperationCard pendingOperation={pending} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      const rows = await page.locator('[data-action-row]').evaluateAll(footers => footers.map(footer => {
        const frame = footer.closest('section')!
        const frameStyle = getComputedStyle(frame)
        const contentEnd = frame.getBoundingClientRect().right - parseFloat(frameStyle.paddingRight) - parseFloat(frameStyle.borderRightWidth)
        const pills = [...footer.querySelectorAll<HTMLButtonElement>('.orbit-pill-action')].map(pill => {
          const bounds = pill.getBoundingClientRect()
          const style = getComputedStyle(pill)
          const children = [...pill.children].map(child => child.getBoundingClientRect().width)
          const intrinsicWidth = children.reduce((sum, child) => sum + child, 0) + Math.max(0, children.length - 1) * parseFloat(style.columnGap) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
          return { width: bounds.width, intrinsicWidth, top: bounds.top, height: bounds.height, left: bounds.left, right: bounds.right, variant: pill.dataset.variant }
        })
        return { contentEnd, pills }
      }))
      expect(rows.map(row => row.pills.length)).toEqual([1, 1, 2])
      for (const row of rows) {
        for (const pill of row.pills) expect(Math.abs(pill.width - pill.intrinsicWidth)).toBeLessThanOrEqual(1)
        expect(Math.abs(row.pills.at(-1)!.right - row.contentEnd)).toBeLessThanOrEqual(0.5)
      }
      const [reject, approve] = rows[2]!.pills
      expect(reject!.variant).toBe('ghost')
      expect(approve!.variant).not.toBe('ghost')
      expect(Math.abs(reject!.top - approve!.top)).toBeLessThanOrEqual(0.5)
      expect(approve!.left - reject!.right).toBeCloseTo(12, 1)
      expect(approve!.height).toBe(reject!.height)
    } finally { await page.close() }
  })

  it.each(cases)('keeps the security handoff on a full line at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : pt
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ width, padding: 16 }}>
        <PendingOperationCard pendingOperation={{ ...pending, riskClass: 'High', confirmationRequirement: 'StepUp' }} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      const geometry = await page.locator('.orbit-step-up').evaluate(handoff => {
        const frame = handoff.parentElement!.closest('section')!
        const style = getComputedStyle(frame)
        const frameBounds = frame.getBoundingClientRect()
        const bounds = handoff.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, contentStart: frameBounds.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth), contentEnd: frameBounds.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth) }
      })
      expect(geometry.left).toBeCloseTo(geometry.contentStart, 1)
      expect(geometry.right).toBeCloseTo(geometry.contentEnd, 1)
    } finally { await page.close() }
  })
})

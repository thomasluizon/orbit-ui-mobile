import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeCreateHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const onboarding = {
  title: 'Read', emoji: '', schedule: { days: weekdays, frequencyUnit: 'Day' as const, frequencyQuantity: 1, intervalWeeks: 1, isGeneral: false, isFlexible: false, dueTime: '' },
  proposed: false, correcting: true, canSaveRepeatWeeks: true, atLimit: false, allowance: 5,
  onCorrect: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onFrequencyUnitChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn(),
}

const cases = [320, 360, 393, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [1, 2].flatMap(scale =>
  (['onboarding', 'proposal', 'astra'] as const).map(surface => ({ width, locale, scale, surface })),
)))

describe('weekday surface geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${variables}}`
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps $surface in one line at $width in $locale with text scale $scale', async ({ width, locale, scale, surface }) => {
    const messages = locale === 'en' ? en : ptBR
    const operation = makeCreateHabitsPreview(1)
    const item = operation.items![0]!
    operation.items = [{ ...item, fields: [{ ...item.fields[0]!, field: 'days', newValue: 'Monday', proposedValue: ['Monday'] }] }]
    render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {surface === 'astra' ? <PendingOperationCard pendingOperation={operation} onRevise={vi.fn()} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
        : <OnboardingCreateHabit {...onboarding} proposed={surface === 'proposal'} correcting={surface !== 'proposal'} />}
    </NextIntlClientProvider>)
    if (surface === 'astra') fireEvent.click(screen.getByRole('button', { name: messages.chat.operation.edit }))
    const names = Object.values(surface === 'astra' ? messages.dates.daysLong : messages.onboarding.flow.when.daysLong)
    const controls = [...document.querySelectorAll('button')].filter(button => names.includes(button.getAttribute('aria-label') ?? '') || names.includes(button.textContent))
    const row = surface === 'proposal' ? document.querySelector(`[aria-label="${messages.onboarding.flow.when.daysLabel}"]`)! : controls[0]!.parentElement!
    const page = await browser.newPage({ viewport: { width, height: 1200 } })
    try {
      await page.setContent(`<style>${stylesheet}:root{font-size:${16 * scale}px}</style><main style="padding:16px"><section style="padding:24px">${row.outerHTML}</section></main>`)
      await loadAppFonts(page)
      const bounds = await page.locator('section > :first-child > *').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        return { top: box.top, left: box.left, right: box.right, width: box.width, height: box.height, textLeft: text.left, textRight: text.right, textBottom: text.bottom, bottom: box.bottom }
      }))
      expect(bounds).toHaveLength(7)
      bounds.forEach((box, index) => {
        expect(box.top).toBe(bounds[0]!.top)
        expect(box.width).toBeGreaterThanOrEqual(24)
        expect(box.height).toBeGreaterThanOrEqual(surface === 'proposal' ? 36 : 48)
        expect(box.textLeft).toBeGreaterThanOrEqual(box.left - 0.1)
        expect(box.textRight).toBeLessThanOrEqual(box.right + 0.1)
        expect(box.textBottom).toBeLessThanOrEqual(box.bottom + 0.1)
        if (index) expect(box.left).toBeGreaterThanOrEqual(bounds[index - 1]!.right)
      })
      expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    } finally { await page.close() }
  })
})

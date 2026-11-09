import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { habitSuggestionDraftFixture as draft, makeHabitSuggestionMessage } from '@orbit/shared/test-support/chat-fixtures'
import type { ChatMessage } from '@orbit/shared/types'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitSuggestionsCard } from '@/components/chat/habit-suggestions-card'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { measureStartEdgeIconAction } from '@/__tests__/support/start-edge-icon-action'

const mocks = vi.hoisted(() => ({ refine: vi.fn(), preview: vi.fn(), scheduleError: false }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-habit-suggestion-actions', () => ({ useHabitSuggestionActions: () => ({ refine: mocks.refine, preview: mocks.preview, isCurrent: () => true, transition: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: (id: string | null) => ({ data: id && !mocks.scheduleError ? { ...createMockHabit({ id }), children: [] } : undefined, isError: Boolean(id) && mocks.scheduleError, refetch: vi.fn() }),
}))

type Failure = { name: string; existing?: boolean; trigger?: (messages: typeof en) => Promise<void> }

const press = async (name: string) => { await act(async () => { fireEvent.click(screen.getAllByRole('button', { name })[0]!) }) }

const failures: Failure[] = [
  { name: 'row refine error', trigger: async (messages) => { mocks.refine.mockRejectedValueOnce(new Error('Unavailable')); await press(messages.chat.habitSuggestions.swap) } },
  { name: 'card preview error', trigger: async (messages) => { mocks.preview.mockRejectedValueOnce(new Error('Unavailable')); await press(messages.chat.habitSuggestions.addAll) } },
  { name: 'current schedule error', existing: true },
]

const cases = failures.flatMap((failure) => [412, 1280].flatMap((width) => ([['en', en], ['pt-BR', ptBR]] as const).map(([locale, messages]) => ({ ...failure, width, locale, messages }))))

function suggestionMessage(existing: boolean): ChatMessage {
  const message = makeHabitSuggestionMessage()
  if (!existing) return message
  return { ...message, parts: [{ type: 'block', kind: 'habitSuggestions', block: { language: 'en', drafts: [{ ...draft, existingHabitId: '33333333-3333-4333-8333-333333333333' }] } }] }
}

describe('habit suggestion retries below error text in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    mocks.refine.mockReset()
    mocks.preview.mockReset()
    mocks.scheduleError = false
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $name retry glyph and starts it on the text column at $width px in $locale', async ({ existing, trigger, width, locale, messages }) => {
    mocks.scheduleError = Boolean(existing)
    const message = suggestionMessage(Boolean(existing))
    const part = message.parts![0]!
    if (part.type !== 'block' || part.kind !== 'habitSuggestions') throw new Error('The fixture carries no habit suggestions block')
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><HabitSuggestionsCard card={part.block} message={message} /></NextIntlClientProvider>)
    await trigger?.(messages)
    expect(screen.getAllByRole('button', { name: messages.common.retry })).toHaveLength(1)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0"><div class="px-screen-gutter">${container.innerHTML}</div></body></html>`)
      const action = await measureStartEdgeIconAction(page, messages.common.retry)
      const detail = JSON.stringify(action)
      expect(action.paintWidth, detail).toBe(44)
      expect(action.targetWidth, detail).toBe(48)
      expect(action.glyphCentreOffset.x, detail).toBeLessThanOrEqual(0.5)
      expect(action.glyphCentreOffset.y, detail).toBeLessThanOrEqual(0.5)
      expect(action.glyphTextOffset, detail).toBeLessThanOrEqual(0.5)
      expect(action.gutter, detail).toBeGreaterThanOrEqual(14)
      expect(action.targetStartClearance, detail).toBeGreaterThanOrEqual(0)
      expect(action.geometry.paint.top, detail).toBeGreaterThanOrEqual(action.geometry.text.bottom)
    } finally { await page.close() }
  })

  it.each(failures.filter((failure) => failure.trigger))('keeps the $name in one polite status region', async ({ trigger }) => {
    const message = suggestionMessage(false)
    const part = message.parts![0]!
    if (part.type !== 'block' || part.kind !== 'habitSuggestions') throw new Error('The fixture carries no habit suggestions block')
    render(<NextIntlClientProvider locale="en" messages={en}><HabitSuggestionsCard card={part.block} message={message} /></NextIntlClientProvider>)
    await trigger!(en)
    const retry = screen.getByRole('button', { name: en.common.retry })
    const status = retry.closest('[role="status"]')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status?.querySelector('p')?.textContent).toMatch(/\S/)
  })
})

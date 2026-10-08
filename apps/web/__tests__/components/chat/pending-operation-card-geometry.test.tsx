import { makeCreateHabitsPreview, makeDeleteHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { IntlMessageFormat } from 'intl-messageformat'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeHeldHabitMessage, habitListCardFixture } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/chat/message-bubble'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { ShellWide } from '@/components/shell/shell-wide'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

const viewports = [1352, 1100, 412, 320]
const deletionSubjects = [{ subject: 'habits', capabilityId: 'habits.bulk.delete', actionKey: 'deleteHabits' }, { subject: 'goals', capabilityId: 'goals.delete', actionKey: 'deleteGoal' }, { subject: 'tags', capabilityId: 'tags.delete', actionKey: 'deleteTag' }, { subject: 'alerts', capabilityId: 'notifications.delete', actionKey: 'deleteNotifications' }, { subject: 'memories', capabilityId: 'user-facts.delete', actionKey: 'deleteUserFacts' }, { subject: 'templates', capabilityId: 'checklist-templates.write', actionKey: 'deleteChecklistTemplate' }]
const countedActions = ['createHabits', 'rescheduleHabits', 'updateHabitEmojis', 'setCalendarSync', 'dismissCalendarImport', 'markAllNotificationsRead']
const locales = ['en', 'pt-BR'] as const
const message = makeHeldHabitMessage({ habitList: habitListCardFixture })
const operation = message.pendingOperations![0]!
const originalItem = operation.items![0]!
const fields = [...originalItem.fields, { ...originalItem.fields[0]!, field: 'frequency_unit', newValue: 'Day' }, { ...originalItem.fields[0]!, field: 'frequency_quantity', newValue: '1', valueType: 'number' }]
message.pendingOperations = [{ ...operation, changes: fields, items: [{ ...originalItem, fields }] }]

function setViewport(width: number) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: width >= Number(query.match(/\d+/)?.[0]), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

function ConversationPreview({ locale, counted }: Readonly<{ locale: typeof locales[number]; counted: string | undefined }>) {
  const messages = locale === 'en' ? en : pt
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <ShellWide items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation} onCreate={vi.fn()} createLabel={messages.nav.createHabit} conversationLabel={messages.chat.title} conversation={<div style={{ padding: 16 }}>
      <MessageBubble message={counted ? { ...message, pendingOperations: [{ ...makeCreateHabitsPreview(), actionKey: counted }] } : message} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={vi.fn()} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} />
    </div>} />
  </NextIntlClientProvider>
}

describe('Pending preview geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    const fonts = [400, 500].map((weight) => {
      const folder = weight === 400 ? '400Regular/Geist_400Regular.ttf' : '500Medium/Geist_500Medium.ttf'
      const font = readFileSync(require.resolve(`@expo-google-fonts/geist/${folder}`)).toString('base64')
      return `@font-face { font-family: TestGeist; font-weight: ${weight}; src: url(data:font/ttf;base64,${font}); }`
    }).join('\n')
    const displayFont = readFileSync(require.resolve('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf')).toString('base64')
    stylesheet = `${compiled.css}\n${fonts}\n@font-face { font-family: TestSpaceGrotesk; font-weight: 500; src: url(data:font/ttf;base64,${displayFont}); }\n:root { --font-sans: TestGeist; --font-display: TestSpaceGrotesk; }`
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(viewports.flatMap((width) => locales.flatMap((locale) => [undefined, ...countedActions].map((counted) => ({ width, locale, counted })))))('keeps controls readable at $width in $locale with counted action $counted', async ({ width, locale, counted }) => {
    setViewport(width)
    const messages = locale === 'en' ? en : pt
    const { container } = render(<ConversationPreview locale={locale} counted={counted} />)
    if (!counted) expect(screen.getByText(messages.habits.frequency.everyDay)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: counted ? 'Habit 1' : 'Beber água' })).toHaveLength(1)
    expect(screen.queryByText('Day')).not.toBeInTheDocument()
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate((moreLabel) => {
        const row = document.querySelector<HTMLElement>('[data-preview-actions]')!
        const rowBounds = row.getBoundingClientRect()
        const buttons = Array.from(row.querySelectorAll('button')).map((button) => {
          const bounds = button.getBoundingClientRect()
          const label = button.querySelector('span')!
          return { label: button.textContent, top: bounds.top, left: bounds.left, right: bounds.right, labelHeight: label.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(label).lineHeight), variant: button.dataset.variant }
        })
        const more = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === moreLabel)!
        const moreWidth = more.getBoundingClientRect().width
        const moreRowWidth = more.closest('[data-action-row]')!.getBoundingClientRect().width
        const visiblePrimary = Array.from(document.querySelectorAll('[data-variant="primary"]')).filter((button) => button.getBoundingClientRect().width > 0).length
        return { buttons, rowLeft: rowBounds.left, rowRight: rowBounds.right, moreWidth, moreRowWidth, visiblePrimary }
      }, messages.chat.habitList.more)
      expect(geometry.buttons.map((button) => button.label)).toEqual([counted ? new IntlMessageFormat((messages.chat.operation.approveCount as Record<string, string>)[counted] ?? (messages.chat.operation.approveAction as Record<string, string>)[counted]!, locale).format({ count: 12 }) : messages.chat.operation.approve, messages.chat.operation.edit, messages.chat.operation.reject])
      if (!counted && width >= 360) expect(new Set(geometry.buttons.map((button) => button.top)).size).toBe(1)
      for (const button of geometry.buttons) {
        expect(button.left).toBeGreaterThanOrEqual(geometry.rowLeft)
        expect(button.right).toBeLessThanOrEqual(geometry.rowRight)
        expect(button.labelHeight).toBeLessThanOrEqual(button.lineHeight + 0.5)
      }
      expect(geometry.buttons[0]?.variant).toBe(width >= 1024 ? 'secondary' : 'primary')
      expect(geometry.visiblePrimary).toBe(1)
      expect(geometry.moreWidth).toBeLessThan(geometry.moreRowWidth)
    } finally { await page.close() }
  })

  it.each(locales.flatMap((locale) => deletionSubjects.flatMap((target) => [1, 12, 120].map((count) => ({ locale, ...target, count })))))('keeps the $subject deletion heading on one line for $count in $locale at 320', async ({ locale, capabilityId, actionKey, count }) => {
    setViewport(320)
    const messages = locale === 'en' ? en : pt
    const pendingOperation = { ...makeDeleteHabitsPreview(count), capabilityId, actionKey }
    render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PendingOperationCard pendingOperation={pendingOperation} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} /></NextIntlClientProvider>)
    fireEvent.click(screen.getAllByRole('button').find((button) => button.dataset.variant === 'primary')!)
    await waitFor(() => expect(document.querySelector('.orbit-sheet-title')).not.toBeNull())
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${document.body.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>('.orbit-sheet-title')!
        const range = document.createRange()
        range.selectNodeContents(title)
        const bounds = range.getBoundingClientRect()
        const available = title.getBoundingClientRect()
        return { text: title.textContent, lines: new Set(Array.from(range.getClientRects(), (rect) => rect.top)).size, width: bounds.width, available: available.width }
      })
      expect(geometry.text).not.toMatch(/\d/)
      expect(screen.getByText(new RegExp(`^${count} `))).toBeInTheDocument()
      expect(geometry.lines).toBe(1)
      expect(geometry.width).toBeLessThanOrEqual(geometry.available + 0.5)
    } finally { await page.close() }
  })

  it.each(locales.flatMap((locale) => [1, 3].map((count) => ({ locale, count }))))('collapses $count rejected items with the saved outcome in $locale', async ({ locale, count }) => {
    setViewport(412)
    const messages = locale === 'en' ? en : pt
    const pendingOperation = { ...operation, changeTargetCount: count, items: Array.from({ length: count }, (_, index) => ({ ...originalItem, itemId: `item-${index}`, entityName: `Habit ${index}` })) }
    const confirm = vi.fn()
    const revise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true } })
    render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PendingOperationCard pendingOperation={pendingOperation} onRevise={revise} onRefresh={vi.fn()} onConfirmExecute={confirm} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: messages.chat.operation.reject }))
    const expected = locale === 'en' ? count === 1 ? 'The change was rejected. Nothing was saved.' : 'The 3 changes were rejected. Nothing was saved.' : count === 1 ? 'A mudança foi rejeitada. Nada foi salvo.' : 'As 3 mudanças foram rejeitadas. Nada foi salvo.'
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(expected))
    expect(screen.queryByText('Habit 0')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

import { makeBulkCreateExecutionResponse, makeCreateHabitsPreview, makeDeleteHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
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
const deletionSubjects = [
  { subject: 'habits', capabilityId: 'habits.bulk.delete', actionKey: 'deleteHabits',
    english: ['The habit and everything inside it leave your list.', '# habits and everything inside them leave your list.'],
    portuguese: ['O hábito e tudo dentro dele saem da sua lista.', '# hábitos e tudo dentro deles saem da sua lista.'] },
  { subject: 'goals', capabilityId: 'goals.delete', actionKey: 'deleteGoal',
    english: ['The goal leaves your list.', '# goals leave your list.'],
    portuguese: ['A meta sai da sua lista.', '# metas saem da sua lista.'] },
  { subject: 'tags', capabilityId: 'tags.delete', actionKey: 'deleteTag',
    english: ['The tag leaves your list.', '# tags leave your list.'],
    portuguese: ['A tag sai da sua lista.', '# tags saem da sua lista.'] },
  { subject: 'alerts', capabilityId: 'notifications.delete', actionKey: 'deleteNotifications',
    english: ['The alert leaves your list.', '# alerts leave your list.'],
    portuguese: ['O aviso sai da sua lista.', '# avisos saem da sua lista.'] },
  { subject: 'memories', capabilityId: 'user-facts.delete', actionKey: 'deleteUserFacts',
    english: ['The memory leaves your list.', '# memories leave your list.'],
    portuguese: ['A memória sai da sua lista.', '# memórias saem da sua lista.'] },
  { subject: 'templates', capabilityId: 'checklist-templates.write', actionKey: 'deleteChecklistTemplate',
    english: ['The template leaves your list.', '# templates leave your list.'],
    portuguese: ['O modelo sai da sua lista.', '# modelos saem da sua lista.'] },
]
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
    <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation} onCreate={vi.fn()} createLabel={messages.nav.createHabit} conversationLabel={messages.chat.title} conversation={<div style={{ padding: 16 }}>
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

  it.each([320, 412, 1352].flatMap(width => locales.flatMap(locale => [1, 2].flatMap(textScale => ['pending', 'done'].map(state => ({ width, locale, textScale, state }))))))('keeps typed item actions beside the first line at $width in $locale at text scale $textScale while $state', async ({ width, locale, textScale, state }) => {
    const messages = locale === 'en' ? en : pt
    const name = locale === 'en'
      ? 'Read the books I chose to learn about all the places and people around the world before breakfast every morning'
      : 'Ler os livros que escolhi para aprender sobre todos os lugares e pessoas ao redor do mundo antes do café da manhã'
    const preview = makeCreateHabitsPreview(2)
    preview.items = preview.items!.map((item, index) => index === 0 ? { ...item, entityName: name, fields: item.fields.map(field => ({ ...field, entityName: name, newValue: name })) } : item)
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width: Math.min(width, 600), padding: 16 }}>
      <PendingOperationCard pendingOperation={preview} onRevise={vi.fn()} onOpenTarget={vi.fn()} onConfirmExecute={vi.fn().mockResolvedValue({ ok: true, response: makeBulkCreateExecutionResponse(['Success', 'Success']) })} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
    </div></NextIntlClientProvider>)
    const actionName = state === 'pending' ? `${messages.chat.operation.remove} ${name}` : new IntlMessageFormat(messages.chat.action.openEntity, locale).format({ name }) as string
    if (state === 'done') {
      fireEvent.click(container.querySelector('button[data-variant="primary"]')!)
      await waitFor(() => expect(screen.getByRole('button', { name: actionName })).toBeInTheDocument())
    }
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}\nhtml { font-size: ${16 * textScale}px; }</style><div class="dark">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate(({ name, actionName }) => {
        const action = [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === actionName)!
        const label = [...document.querySelectorAll<HTMLElement>('[data-personal-text]')].find(element => element.textContent === name)!
        let row = label.parentElement!
        while (!row.contains(action)) row = row.parentElement!
        const labelBounds = label.getBoundingClientRect()
        const actionBounds = action.getBoundingClientRect()
        const rowBounds = row.getBoundingClientRect()
        return { direction: getComputedStyle(row).flexDirection, branches: row.children.length, firstLineTop: labelBounds.top, firstLineBottom: labelBounds.top + parseFloat(getComputedStyle(label).lineHeight), labelHeight: labelBounds.height, lineHeight: parseFloat(getComputedStyle(label).lineHeight), labelRight: labelBounds.right, actionLeft: actionBounds.left, actionCenter: actionBounds.top + actionBounds.height / 2, actionBottom: actionBounds.bottom, rowBottom: rowBounds.bottom }
      }, { name, actionName })
      expect(geometry.direction).toBe('row')
      expect(geometry.branches).toBe(2)
      expect(geometry.actionCenter).toBeGreaterThanOrEqual(geometry.firstLineTop - 0.5)
      expect(geometry.actionCenter).toBeLessThanOrEqual(geometry.firstLineBottom + 0.5)
      expect(geometry.labelHeight).toBeLessThanOrEqual(geometry.lineHeight * 2 + 0.5)
      expect(geometry.labelRight).toBeLessThanOrEqual(geometry.actionLeft)
      expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.rowBottom)
    } finally { await page.close() }
  })

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
        const row = [...document.querySelectorAll<HTMLElement>('[data-action-row]')].find(row => row.querySelectorAll('.orbit-pill-action').length === 3)!
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
      expect(geometry.buttons.map((button) => button.label)).toEqual([messages.chat.operation.reject, messages.chat.operation.edit, counted ? new IntlMessageFormat((messages.chat.operation.approveCount as Record<string, string>)[counted] ?? (messages.chat.operation.approveAction as Record<string, string>)[counted]!, locale).format({ count: 12 }) : messages.chat.operation.approve])
      if (!counted && width >= 360) expect(new Set(geometry.buttons.map((button) => button.top)).size).toBe(1)
      for (const button of geometry.buttons) {
        expect(button.left).toBeGreaterThanOrEqual(geometry.rowLeft)
        expect(button.right).toBeLessThanOrEqual(geometry.rowRight)
        expect(button.labelHeight).toBeLessThanOrEqual(button.lineHeight + 0.5)
      }
      expect(geometry.buttons[2]?.variant).toBe(width >= 1024 ? 'secondary' : 'primary')
      expect(geometry.visiblePrimary).toBe(1)
      expect(geometry.moreWidth).toBeLessThan(geometry.moreRowWidth)
    } finally { await page.close() }
  })

  it.each(locales.flatMap((locale) => deletionSubjects.flatMap((target) => [1, 12, 120].map((count) => ({ locale, ...target, count })))))('keeps the $subject deletion heading on one line for $count in $locale at 320', async ({ locale, capabilityId, actionKey, count, english, portuguese }) => {
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
      const consequence = (locale === 'en' ? english : portuguese)[count === 1 ? 0 : 1]!.replace('#', String(count))
      const expectedBody = `${consequence} ${locale === 'en' ? 'There is no way to restore this here.' : 'Não há como restaurar por aqui.'}`
      expect(screen.getByText(expectedBody)).toBeInTheDocument()
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

import { measureClampedPersonalText } from '@/__tests__/support/personal-text'
import type { Page } from '@playwright/test'
import { makePlacementPreview, makeParentChoicePreview, makeBulkCreateExecutionResponse, makeCreateHabitsPreview, makeDeleteHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
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
import { breakdownSubHabits, goalListCardFixture, makeActionResult, makeHeldHabitMessage, habitListCardFixture } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/chat/message-bubble'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { ActionChips } from '@/components/chat/action-chips'
import { ShellWide } from '@/components/shell/shell-wide'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { readControlHitArea } from '@/test-support/control-hit-area'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }), useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

const viewports = [1352, 1100, 412, 320]
const deletionSubjects = [
  { subject: 'habits', capabilityId: 'habits.bulk.delete', actionKey: 'deleteHabits',
    english: ['The habit and everything inside it leave your list.', '# habits and everything inside them leave your list.'],
    portuguese: ['O hábito e tudo o que há nele serão removidos da sua lista.', '# hábitos e tudo o que há neles serão removidos da sua lista.'] },
  { subject: 'goals', capabilityId: 'goals.delete', actionKey: 'deleteGoal',
    english: ['The goal leaves your list.', '# goals leave your list.'],
    portuguese: ['A meta será removida da sua lista.', '# metas serão removidas da sua lista.'] },
  { subject: 'tags', capabilityId: 'tags.delete', actionKey: 'deleteTag',
    english: ['The tag leaves your list.', '# tags leave your list.'],
    portuguese: ['A tag será removida da sua lista.', '# tags serão removidas da sua lista.'] },
  { subject: 'alerts', capabilityId: 'notifications.delete', actionKey: 'deleteNotifications',
    english: ['The alert leaves your list.', '# alerts leave your list.'],
    portuguese: ['O aviso será removido da sua lista.', '# avisos serão removidos da sua lista.'] },
  { subject: 'memories', capabilityId: 'user-facts.delete', actionKey: 'deleteUserFacts',
    english: ['The memory leaves your list.', '# memories leave your list.'],
    portuguese: ['A memória será removida da sua lista.', '# memórias serão removidas da sua lista.'] },
  { subject: 'templates', capabilityId: 'checklist-templates.write', actionKey: 'deleteChecklistTemplate',
    english: ['The template leaves your list.', '# templates leave your list.'],
    portuguese: ['O modelo será removido da sua lista.', '# modelos serão removidos da sua lista.'] },
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

async function expectInteractionGeometry(page: Page, name: string, metaLeft: number) {
  const disclosure = page.getByRole('button', { name, exact: true })
  for (const interaction of ['hover', 'press', 'focus'] as const) {
    if (interaction === 'hover') await disclosure.hover()
    if (interaction === 'press') await page.mouse.down()
    if (interaction === 'focus') { await page.mouse.move(0, 0); await page.mouse.up(); await page.keyboard.press('Tab'); await disclosure.focus() }
    const fill = await disclosure.evaluate(async (control) => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      await Promise.all(control.getAnimations().map(animation => animation.finished))
      const style = getComputedStyle(control)
      const label = control.parentElement!.querySelector('[data-personal-text]')!
      return { background: style.backgroundColor, outline: parseFloat(style.outlineWidth), nameLeft: label.getBoundingClientRect().left, padding: label.getBoundingClientRect().left - control.getBoundingClientRect().left }
    })
    expect(fill.background, interaction).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/)
    expect(fill.nameLeft).toBeCloseTo(metaLeft, 1)
    expect(fill.padding).toBeCloseTo(8, 1)
    if (interaction === 'focus') expect(fill.outline).toBeGreaterThanOrEqual(2)
  }
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
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = `${compiled.css}\n${fonts}\n@font-face { font-family: TestSpaceGrotesk; font-weight: 500; src: url(data:font/ttf;base64,${displayFont}); }\n:root { ${variables}; --font-sans: TestGeist; --font-mono: TestMono; --font-display: TestSpaceGrotesk; }`
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412].flatMap(width => locales.flatMap(locale => [1, 2].map(textScale => ({ width, locale, textScale })))))('keeps long placement destinations within the preview at $width in $locale at text scale $textScale', async ({ width, locale, textScale }) => {
    const operation = makePlacementPreview()
    operation.items![0]!.placement!.destinationName = 'MorningRoutineWithoutSpaces'.repeat(8)
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt} timeZone="UTC"><div style={{ width, padding: 16 }}>
      <PendingOperationCard pendingOperation={operation} onRevise={vi.fn()} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
    </div></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1200 } })
    try {
      await page.setContent(`<style>${stylesheet} html { font-size: ${16 * textScale}px; }</style>${container.innerHTML}`)
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('section[data-state]')!
        return frame.scrollWidth - frame.clientWidth
      })
      expect(overflow).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  })

  it.each([390, 840, 1352].flatMap(width => locales.flatMap(locale => ['dark', 'light'].flatMap(mode => ['pending', 'done', 'failed', 'stale'].map(state => ({ width, locale, mode, state }))))))('keeps drawn block spacing and sans count at $width in $locale $mode while $state', async ({ width, locale, mode, state }) => {
    const messages = locale === 'en' ? en : pt
    const operation = makeCreateHabitsPreview(2)
    const savedState = state === 'stale' ? { stale: true } : state === 'pending' ? undefined : { status: state as 'done' | 'failed', canRetry: true }
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width: Math.min(width, 740), padding: 16 }}>
      <PendingOperationCard pendingOperation={operation} savedState={savedState} onRefresh={vi.fn()} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
    </div></NextIntlClientProvider>)
    const variables = Object.entries(resolveWebThemeVariables('orange', mode as 'dark' | 'light')).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage({ viewport: { width, height: 1200 } })
    try {
      await page.setContent(`<style>${stylesheet} :root { ${variables}; }</style><div class="${mode}">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('section[data-state]')!
        const header = frame.querySelector('header')!
        const next = [...frame.querySelectorAll('[role="status"], div[aria-live="polite"]')]
          .find(region => region.textContent.trim())!
        const row = frame.querySelector<HTMLElement>('div[aria-live="polite"] > div > div')!
        const style = getComputedStyle(frame)
        return { inset: parseFloat(style.paddingLeft), gap: next.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
          rowInset: parseFloat(getComputedStyle(row).paddingLeft), countFont: getComputedStyle(header.querySelector('span')!).fontFamily,
          overflow: frame.scrollWidth - frame.clientWidth }
      })
      expect(geometry.inset).toBe(24)
      expect(geometry.gap).toBeCloseTo(24, 1)
      expect(geometry.rowInset).toBe(12)
      expect(geometry.countFont).toContain('TestGeist')
      expect(geometry.countFont).not.toMatch(/mono/i)
      expect(geometry.overflow).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  })

  it.each([320, 412, 1352].flatMap(width => locales.flatMap(locale => [1, 2].flatMap(textScale => ['pending', 'done', 'acting', 'failed'].map(state => ({ width, locale, textScale, state }))))))('keeps typed item actions beside the first line at $width in $locale at text scale $textScale while $state', async ({ width, locale, textScale, state }) => {
    const messages = locale === 'en' ? en : pt
    const name = locale === 'en'
      ? 'Read the books I chose to learn about all the places and people around the world before breakfast every morning'
      : 'Ler os livros que escolhi para aprender sobre todos os lugares e pessoas ao redor do mundo antes do café da manhã'
    const preview = makeCreateHabitsPreview(2)
    preview.items = preview.items!.map((item, index) => index === 0 ? { ...item, entityName: name, fields: item.fields.map(field => ({ ...field, entityName: name, newValue: name })) } : item)
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width: Math.min(width, 600), padding: 16 }}>
      <PendingOperationCard pendingOperation={preview} onRevise={vi.fn()} onOpenTarget={vi.fn()} onConfirmExecute={state === 'acting' ? vi.fn(() => new Promise(() => {})) : vi.fn().mockResolvedValue({ ok: true, response: makeBulkCreateExecutionResponse(state === 'failed' ? ['Failed', 'Failed'] : ['Success', 'Success']) })} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
    </div></NextIntlClientProvider>)
    const actionName = state === 'failed' ? null : state === 'done' ? new IntlMessageFormat(messages.chat.action.openEntity, locale).format({ name }) as string : `${messages.chat.operation.remove} ${name}`
    if (state !== 'pending') {
      fireEvent.click(container.querySelector('button[data-variant="primary"]')!)
      await waitFor(() => expect(screen.getAllByText(messages.blockFrame.status[state as 'done' | 'acting' | 'failed']).length).toBeGreaterThan(0))
    }
    if (state === 'pending') expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-expanded')
    else if (state === 'acting') expect(screen.getByRole('button', { name })).toBeDisabled()
    else expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}\nhtml { font-size: ${16 * textScale}px; }</style><div class="dark">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.evaluate(({ name, actionName }) => {
        const label = [...document.querySelectorAll<HTMLElement>('[data-personal-text]')].find(element => element.textContent === name)!
        const action = actionName ? [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === actionName)! : label.closest('[data-status="failed"]')!.lastElementChild!.querySelector('svg')!
        let row = label.parentElement!
        while (!row.contains(action)) row = row.parentElement!
        const labelBounds = label.getBoundingClientRect()
        const titleControl = [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name)
        const disclosureBounds = (titleControl ?? label.parentElement!).getBoundingClientRect()
        const actionBounds = action.getBoundingClientRect()
        const rowBounds = row.getBoundingClientRect()
        const metaBounds = row.firstElementChild!.children[1]!.getBoundingClientRect()
        const trailing = row.lastElementChild as HTMLElement
        const trailingBounds = trailing.getBoundingClientRect()
        const status = trailing.querySelector(':scope > span') as HTMLElement | null
        const statusRight = status ? Math.max(...[status, ...status.querySelectorAll('*')].map(element => element.getBoundingClientRect().right)) : trailingBounds.right
        return { nameLeft: labelBounds.left, metaLeft: metaBounds.left, direction: getComputedStyle(row).flexDirection, branches: row.children.length, firstLineTop: labelBounds.top, firstLineBottom: labelBounds.top + parseFloat(getComputedStyle(label).lineHeight), labelHeight: labelBounds.height, labelWidth: labelBounds.width, lineHeight: parseFloat(getComputedStyle(label).lineHeight), labelRight: labelBounds.right, disclosureLeft: disclosureBounds.left, disclosureRight: disclosureBounds.right, actionLeft: actionBounds.left, actionRight: actionBounds.right, actionCenter: actionBounds.top + actionBounds.height / 2, actionBottom: actionBounds.bottom, trailingRight: trailingBounds.right, trailingBottom: trailingBounds.bottom, statusRight, statusOverflow: status ? status.scrollWidth - status.clientWidth : 0, rowLeft: rowBounds.left, rowRight: rowBounds.right, rowBottom: rowBounds.bottom }
      }, { name, actionName })
      expect(geometry.nameLeft).toBeCloseTo(geometry.metaLeft, 1)
      expect(geometry.direction).toBe('row')
      expect(geometry.branches).toBe(2)
      expect(geometry.actionCenter).toBeGreaterThanOrEqual(geometry.firstLineTop - 0.5)
      expect(geometry.actionCenter).toBeLessThanOrEqual(geometry.firstLineBottom + 0.5)
      expect(geometry.labelHeight).toBeLessThanOrEqual(geometry.lineHeight * 2 + 0.5)
      expect(geometry.labelWidth).toBeGreaterThan(0)
      expect(geometry.labelHeight).toBeGreaterThan(0)
      expect(geometry.labelRight).toBeLessThanOrEqual(geometry.actionLeft)
      expect(geometry.disclosureLeft).toBeGreaterThanOrEqual(geometry.rowLeft)
      expect(geometry.disclosureRight).toBeLessThanOrEqual(geometry.actionLeft)
      expect(geometry.actionRight).toBeLessThanOrEqual(geometry.rowRight)
      expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.rowBottom)
      expect(geometry.trailingRight).toBeLessThanOrEqual(geometry.rowRight)
      expect(geometry.trailingBottom).toBeLessThanOrEqual(geometry.rowBottom)
      expect(geometry.statusOverflow).toBeLessThanOrEqual(1)
      expect(geometry.statusRight).toBeLessThanOrEqual(geometry.trailingRight + 0.5)
      if (state === 'pending') await expectInteractionGeometry(page, name, geometry.metaLeft)
    } finally { await page.close() }
  })

  it.each([320, 412, 1352].flatMap(width => locales.flatMap(locale => [1, 2].map(scale => ({ width, locale, scale })))))('fits parent choices at $width in $locale with text scale $scale', async ({ width, locale, scale }) => {
    setViewport(width)
    const messages = locale === 'en' ? en : pt
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width: Math.min(width, 740), padding: 16 }}><PendingOperationCard pendingOperation={makeParentChoicePreview(1)} onRevise={vi.fn()} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} /></div></NextIntlClientProvider>)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await page.evaluate(async (scale) => {
        const textStyles = [...document.querySelectorAll<HTMLElement>('p,span,h3,button')].map(element => ({ element, fontSize: parseFloat(getComputedStyle(element).fontSize), lineHeight: parseFloat(getComputedStyle(element).lineHeight) }))
        textStyles.forEach(({ element, fontSize, lineHeight }) => { element.style.fontSize = `${fontSize * scale}px`; if (Number.isFinite(lineHeight)) element.style.lineHeight = `${lineHeight * scale}px` })
        await document.fonts.ready
      }, scale)
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector('section')!.getBoundingClientRect()
        const controls = [...document.querySelectorAll<HTMLElement>('[role="radio"]')].map(control => {
          const bounds = control.getBoundingClientRect()
          const label = (control.querySelector<HTMLElement>('[data-slot="list-row-title"]') ?? control.parentElement!.querySelector<HTMLElement>('[data-slot="list-row-title"]'))!
          return { labelOverflow: label.scrollHeight - label.clientHeight, left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, height: bounds.height, overflow: control.scrollWidth - control.clientWidth }
        })
        return { frameLeft: frame.left, frameRight: frame.right, controls, pageOverflow: document.documentElement.scrollWidth - innerWidth }
      })
      expect(geometry.controls).toHaveLength(3)
      expect(geometry.pageOverflow).toBeLessThanOrEqual(1)
      geometry.controls.forEach((control, index) => {
        expect(control.height).toBeGreaterThanOrEqual(48)
        expect(control.left).toBeGreaterThanOrEqual(geometry.frameLeft)
        expect(control.right).toBeLessThanOrEqual(geometry.frameRight)
        expect(control.overflow).toBeLessThanOrEqual(1)
        expect(control.labelOverflow).toBeLessThanOrEqual(1)
        if (index) expect(control.top).toBeGreaterThanOrEqual(geometry.controls[index - 1]!.bottom)
      })
    } finally { await page.close() }
  })

  it.each([412, 1352].flatMap(width => locales.flatMap(locale => ['goal', 'goal-disclosure', 'breakdown', 'actions'].flatMap(surface => (surface === 'actions' ? [false] : [false, true]).map(expanded => ({ width, locale, surface, expanded }))))))('keeps the $surface outset unclipped at $width in $locale while expanded $expanded', async ({ width, locale, surface, expanded }) => {
    measureClampedPersonalText()
    const messages = locale === 'en' ? en : pt
    const content = surface === 'actions' ? <ActionChips actions={[makeActionResult()]} onChipClick={vi.fn()} /> : surface === 'breakdown' ? <BreakdownSuggestion parentName="House routine" subHabits={breakdownSubHabits} onConfirmed={vi.fn()} onCancelled={vi.fn()} /> : <GoalListCard goalList={goalListCardFixture} onOpenGoal={surface === 'goal' ? vi.fn() : undefined} />
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width: Math.min(width, 740), padding: 16 }}>{content}</div></NextIntlClientProvider>)
    const name = surface === 'actions' ? container.querySelector('[data-personal-text]')!.textContent! : surface === 'breakdown' ? breakdownSubHabits[0]!.title : goalListCardFixture.items[0]!.title
    if (expanded && surface !== 'goal') fireEvent.click(screen.getByRole('button', { name }))
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.getByRole('button', { name, exact: true }).evaluate(control => {
        const label = control.querySelector('[data-personal-text]') ?? control.parentElement!.querySelector('[data-personal-text]')!
        let row = control.parentElement!
        while (getComputedStyle(row).display !== 'flex' || parseFloat(getComputedStyle(row).paddingLeft) !== 12) row = row.parentElement!
        const nameLeft = label.getBoundingClientRect().left
        const bounds = control.getBoundingClientRect()
        const meta = row.firstElementChild!.children[1]
        let clipLeft = row.getBoundingClientRect().left
        let clipRight = row.getBoundingClientRect().right
        for (let ancestor = control.parentElement; ancestor && row.contains(ancestor); ancestor = ancestor.parentElement) {
          if (getComputedStyle(ancestor).overflowX !== 'visible') { clipLeft = Math.max(clipLeft, ancestor.getBoundingClientRect().left); clipRight = Math.min(clipRight, ancestor.getBoundingClientRect().right) }
        }
        const neighbor = row.lastElementChild!.querySelector('button') ?? row.lastElementChild!
        const hitExtension = neighbor.matches('.orbit-pill-action') ? parseFloat(getComputedStyle(neighbor, '::after').left) : 0
        return { nameLeft, metaLeft: meta?.getBoundingClientRect().left ?? row.getBoundingClientRect().left + 12, controlLeft: bounds.left, controlRight: bounds.right, controlHeight: bounds.height, clipLeft, clipRight, neighborLeft: neighbor.getBoundingClientRect().left + hitExtension }
      })
      expect(geometry.nameLeft).toBeCloseTo(geometry.metaLeft, 1)
      expect(geometry.nameLeft - geometry.controlLeft).toBeCloseTo(8, 1)
      expect(geometry.controlHeight).toBeGreaterThanOrEqual(48)
      expect(geometry.controlLeft).toBeGreaterThanOrEqual(geometry.clipLeft)
      expect(geometry.controlRight).toBeLessThanOrEqual(geometry.clipRight)
      expect(geometry.controlRight).toBeLessThanOrEqual(geometry.neighborLeft)
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
          const label = button.querySelector('span, svg')!
          return { label: button.getAttribute('aria-label') ?? button.textContent, top: bounds.top, left: bounds.left, right: bounds.right, labelHeight: label.getBoundingClientRect().height, lineHeight: label.tagName.toLowerCase() === 'svg' ? 20 : parseFloat(getComputedStyle(label).lineHeight), width: bounds.width, height: bounds.height, icon: label.tagName.toLowerCase() === 'svg', variant: button.dataset.variant }
        })
        const more = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === moreLabel)!
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
        if (button.icon) { expect(button.width).toBe(44); expect(button.height).toBe(44) }
      }
      for (const control of await page.locator('[data-action-row] .orbit-pill-action[aria-label]').all()) {
        await control.evaluate(element => element.scrollIntoView({ block: 'center' }))
        const hit = await control.evaluate(readControlHitArea)
        expect(hit.width).toBeGreaterThanOrEqual(48)
        expect(hit.height).toBeGreaterThanOrEqual(48)
        expect(hit.checks).toEqual([true, true, true, true])
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

vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isPending: false, isError: false, isRefetchError: false }) }))

import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import postcss from 'postcss'
import { execFileSync } from 'node:child_process'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildComposerChips } from '@orbit/shared/chat'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { createTranslator } from 'next-intl'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Composer } from '@/components/shell/composer'
import { AI_MESSAGE_COUNTER_THRESHOLD } from '@orbit/shared/chat'
import { MAX_ACTIVE_HABITS } from '@orbit/shared/validation'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { Menu } from '@/components/ui/menu'
import { measureFieldInset } from '@/e2e/layout/field-inset-geometry'
import { inspectFocusedRing, readFieldIndicators } from '@/e2e/layout/focus-indicators'
import { composerPlaceholderFits } from '@/e2e/layout/composer-column-paint'

let translationMessages = en

vi.mock('next-intl', async (importOriginal) => ({
  ...await importOriginal<typeof import('next-intl')>(),
  useTranslations: () => (key: string) => key === 'nav.astra' ? translationMessages.nav.astra : key === 'habits.form.askDate' ? translationMessages.habits.form.askDate : key,
}))

const cases = [320, 360, 384, 412].flatMap((width) =>
  [en, ptBR].flatMap((messages) => [1, 2].map((fontScale) => ({ width, messages, fontScale }))),
)

type GeometryScenario = 'idle' | 'oneLine' | 'typing' | 'longText' | 'sending' | 'recording' | 'transcribing' | 'tray1' | 'tray2' | 'tray3' | 'atLimit' | 'offline' | 'retry'

function geometryProps(scenario: GeometryScenario, messages: typeof en, withOpener: boolean): ComposerProps {
  translationMessages = messages
  const state = ['oneLine', 'typing', 'longText', 'tray1', 'tray2', 'tray3', 'retry'].includes(scenario) ? 'idle' : scenario
  return {
    state,
    astraRequestLabel: messages.habits.form.askDate,
    ...(state === 'offline' ? { limitReason: messages.shell.composer.offline.reason } : {}),
    ...(state === 'atLimit' ? { limitReason: messages.shell.composer.limit.reason } : {}),
    value: scenario === 'oneLine' ? 'Oi' : scenario === 'typing' ? 'First\nSecond\nThird' : scenario === 'longText' ? 'Long message\n'.repeat(12) : '',
    suggestions: [], words: { ...messages.shell.composer, ...(state === 'offline' ? { placeholder: messages.shell.composer.offline.placeholder } : state === 'atLimit' ? { placeholder: messages.shell.composer.limit.placeholder } : {}) },
    onChangeValue: vi.fn(), onSend: vi.fn(),
    onVoice: vi.fn(), voiceWords: messages.shell.composer.voice,
    onAttachFile: vi.fn(), onAttachImage: vi.fn(),
    attachWords: { ...messages.shell.composer.attach, remove: (name: string) => messages.shell.composer.attach.remove.replace('{name}', name) },
    attachments: Array.from({ length: scenario.startsWith('tray') ? Number(scenario.at(-1)) : 0 }, (_, index) => ({ id: String(index), kind: index === 0 ? 'image' : 'file', name: `attachment-${index}.txt` })),
    onAttachRemove: vi.fn(),
    ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation } : {}),
    ...(scenario === 'retry' ? { onRetry: vi.fn() } : {}),
  } as ComposerProps

}

interface PillGeometry {
  pill: { left: number; right: number; top: number; bottom: number; height: number }
  documentWidth: number
  input: { left: number; right: number; top: number; bottom: number; width: number; contentWidth: number; height: number; scrollHeight: number; maximumHeight: number; placeholderWidth: number } | null
  controls: { name: string; left: number; right: number; top: number; bottom: number; width: number; height: number }[]
  menuItems: { id: string; label: string }[]
  clipboardAvailable: boolean
}

async function readTextActionLayout(page: import('@playwright/test').Page) {
  return page.locator('[data-composer-input]').evaluate(element => {
    const style = getComputedStyle(element)
    const row = element.closest<HTMLElement>('[data-composer-input-row]')!
    const rowStyle = getComputedStyle(row)
    const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
    const controls = trailing.querySelector<HTMLElement>('[data-composer-text-controls]')!
    const controlsStyle = getComputedStyle(controls)
    const slotWidth = parseFloat(controlsStyle.minWidth)
    const gap = parseFloat(controlsStyle.columnGap)
    const inlineWidth = controls.getBoundingClientRect().width
    const minimumWidth = row.querySelector('[data-composer-input-minimum]')!.getBoundingClientRect().width
    const entryWidth = row.querySelector('[data-open-conversation]')?.getBoundingClientRect().width ?? 0
    const sendWidth = trailing.lastElementChild!.getBoundingClientRect().width
    const context = document.createElement('canvas').getContext('2d')!
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    context.letterSpacing = style.letterSpacing
    const metrics = context.measureText(element.getAttribute('placeholder')!)
    return { clientWidth: element.clientWidth, rowWidth: row.clientWidth, entryWidth, sendWidth, inlineWidth, slotWidth, gap, minimumWidth,
      menuItems: JSON.parse(controls.querySelector('[data-composer-menu-items]')?.getAttribute('data-composer-menu-items') ?? '[]') as { id: string; label: string }[],
      rowPaddingStart: rowStyle.paddingInlineStart, rowPaddingEnd: rowStyle.paddingInlineEnd,
      trailingGap: getComputedStyle(trailing).columnGap,
      font: style.font, fontSize: style.fontSize, fontStyle: style.fontStyle, fontWeight: style.fontWeight, fontFamily: style.fontFamily,
      letterSpacing: style.letterSpacing, paddingInlineStart: style.paddingInlineStart, paddingInlineEnd: style.paddingInlineEnd,
      metrics: Object.fromEntries(Object.keys(Object.getPrototypeOf(metrics)).filter(key => typeof Reflect.get(metrics, key) === 'number').map(key => [key, Reflect.get(metrics, key)])) }
  })
}

async function expectNarrowMenuPaste(page: import('@playwright/test').Page, messages: typeof en) {
  const measured = await readTextActionLayout(page)
  const readText = vi.fn().mockResolvedValue('Pasted message')
  vi.stubGlobal('navigator', { clipboard: { readText } })
  function ControlledComposer() {
    const [value, setValue] = useState('')
    return <Composer {...geometryProps('tray1', messages, true)} value={value} onChangeValue={setValue} />
  }
  const view = render(<ControlledComposer />)
  const field = screen.getByRole('textbox') as HTMLTextAreaElement
  Object.assign(field.style, { font: measured.font, fontSize: measured.fontSize, fontStyle: measured.fontStyle,
    fontWeight: measured.fontWeight, fontFamily: measured.fontFamily, letterSpacing: measured.letterSpacing,
    paddingInlineStart: measured.paddingInlineStart, paddingInlineEnd: measured.paddingInlineEnd })
  const row = field.closest<HTMLElement>('[data-composer-input-row]')!
  Object.assign(row.style, { paddingInlineStart: measured.rowPaddingStart, paddingInlineEnd: measured.rowPaddingEnd })
  const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
  const controls = trailing.querySelector<HTMLElement>('[data-composer-text-controls]')!
  trailing.style.columnGap = measured.trailingGap
  Object.assign(controls.style, { minWidth: `${measured.slotWidth}px`, columnGap: `${measured.gap}px` })
  const rowWidth = vi.spyOn(row, 'clientWidth', 'get').mockReturnValue(measured.rowWidth)
  const inputWidth = vi.spyOn(field, 'clientWidth', 'get').mockReturnValue(measured.clientWidth)
  const rectangles = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this === controls ? measured.inlineWidth
      : this.hasAttribute('data-composer-input-minimum') ? measured.minimumWidth
      : this.hasAttribute('data-open-conversation') ? measured.entryWidth : this === trailing.lastElementChild ? measured.sendWidth : measured.slotWidth
    return new DOMRect(0, 0, width, 48)
  })
  const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '', letterSpacing: '', measureText: () => measured.metrics,
  } as unknown as CanvasRenderingContext2D)
  try {
    await act(() => document.fonts.dispatchEvent(new Event('loadingdone')))
    expect(screen.queryByRole('button', { name: messages.shell.composer.paste })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.actions }))
    const menu = await screen.findByRole('menu')
    const paste = within(menu).getAllByRole('menuitem')[0]!
    expect(paste).toHaveAccessibleName(messages.shell.composer.paste)
    expect(within(menu).getAllByRole('menuitem', { name: messages.shell.composer.paste })).toHaveLength(1)
    expect(paste.querySelector('[data-icon="clipboard"] svg')).not.toBeNull()
    fireEvent.click(paste)
    await waitFor(() => expect(field).toHaveValue('Pasted message'))
    expect(readText).toHaveBeenCalledOnce()
    await waitFor(() => expect(field).toHaveFocus())
    expect([field.selectionStart, field.selectionEnd]).toEqual([14, 14])
    expect(screen.queryByRole('button', { name: messages.shell.composer.clear })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: messages.shell.composer.actions }), { key: 'ArrowDown' })
    const clearMenu = await screen.findByRole('menu')
    const clear = within(clearMenu).getAllByRole('menuitem')[0]!
    expect(clear).toHaveAccessibleName(messages.shell.composer.clear)
    expect(within(clearMenu).getAllByRole('menuitem', { name: messages.shell.composer.clear })).toHaveLength(1)
    expect(clear.querySelector('[data-icon="x"] svg')).not.toBeNull()
    await waitFor(() => expect(clear).toHaveFocus())
    fireEvent.click(clear)
    await waitFor(() => expect(field).toHaveValue(''))
    await waitFor(() => expect(field).toHaveFocus())
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0])
    expect(screen.getByText('attachment-0.txt')).toBeInTheDocument()
  } finally { rectangles.mockRestore(); rowWidth.mockRestore(); inputWidth.mockRestore(); contextSpy.mockRestore(); view.unmount(); vi.unstubAllGlobals() }
}

function assertPillActions(measured: PillGeometry, { withOpener, scenario, messages }: { withOpener: boolean; scenario: GeometryScenario; messages: typeof en }, evidence: string) {
  const names = measured.controls.map(control => control.name)
  const voiceActive = scenario === 'recording' || scenario === 'transcribing'
  const expected = [
    ...(withOpener ? [`${messages.todayAstra.openConversation}, Astra`] : []),
    voiceActive ? messages.shell.composer.voice.stop : messages.shell.composer.actions,
    `${messages.shell.composer.send}, ${messages.habits.form.askDate}`,
  ]
  const textAction = ['oneLine', 'typing', 'longText'].includes(scenario) ? messages.shell.composer.clear : messages.shell.composer.paste
  const possibleNames = [...expected, ...names.includes(textAction) ? [textAction] : []]
  expect([...names].sort((left, right) => left.localeCompare(right)), evidence).toEqual(possibleNames.sort((left, right) => left.localeCompare(right)))
  if (['sending', 'atLimit', 'offline', 'recording', 'transcribing'].includes(scenario)) expect(names, evidence).not.toContain(textAction)
  const actionId = ['oneLine', 'typing', 'longText'].includes(scenario) ? 'clear' : 'paste'
  const textActionName = actionId === 'clear' ? messages.shell.composer.clear : messages.shell.composer.paste
  const available = !['sending', 'atLimit', 'offline', 'recording', 'transcribing'].includes(scenario)
    && (actionId === 'clear' || measured.clipboardAvailable)
  expect(measured.controls.filter(control => control.name === textActionName).length
    + measured.menuItems.filter(item => item.id === actionId).length, evidence).toBe(available ? 1 : 0)
  if (measured.menuItems.some(item => item.id === actionId)) {
    expect(measured.menuItems[0], evidence).toEqual({ id: actionId, label: textActionName })
  }
}

function assertPillGeometry(measured: PillGeometry, context: { width: number; fontScale: number; withOpener: boolean; scenario: GeometryScenario; messages: typeof en }) {
  const { width, fontScale, withOpener, scenario } = context
  const evidence = JSON.stringify({ width, fontScale, withOpener, scenario, measured })
  expect(measured.documentWidth, evidence).toBe(width)
  assertPillActions(measured, context, evidence)
  for (const [index, control] of measured.controls.entries()) {
    expect(control.width, evidence).toBeGreaterThanOrEqual(48)
    expect(control.height, evidence).toBeGreaterThanOrEqual(48)
    expect(control.left, evidence).toBeGreaterThanOrEqual(measured.pill.left + INTERACTION_FILL_CLEARANCE)
    expect(control.right, evidence).toBeLessThanOrEqual(measured.pill.right - INTERACTION_FILL_CLEARANCE)
    expect(control.top, evidence).toBeGreaterThanOrEqual(measured.pill.top + INTERACTION_FILL_CLEARANCE)
    expect(control.bottom, evidence).toBeLessThanOrEqual(measured.pill.bottom - INTERACTION_FILL_CLEARANCE)
    if (index > 0) {
      const previous = measured.controls[index - 1]!
      expect(control.left >= previous.right || control.top >= previous.bottom, evidence).toBe(true)
    }
    if (measured.input) {
      const input = measured.input
      expect(control.right <= input.left || control.left >= input.right || control.bottom <= input.top || control.top >= input.bottom, evidence).toBe(true)
    }
  }
  if (measured.input) {
    const input = measured.input
    expect(input.left, evidence).toBeGreaterThanOrEqual(measured.pill.left + INTERACTION_FILL_CLEARANCE)
    expect(input.right, evidence).toBeLessThanOrEqual(measured.pill.right - INTERACTION_FILL_CLEARANCE)
    expect(input.top, evidence).toBeGreaterThanOrEqual(measured.pill.top + INTERACTION_FILL_CLEARANCE)
    expect(input.bottom, evidence).toBeLessThanOrEqual(measured.pill.bottom - INTERACTION_FILL_CLEARANCE)
    expect(input.width, evidence).toBeGreaterThanOrEqual(48 * fontScale)
    expect(measured.pill.height, evidence).toBeGreaterThanOrEqual(input.height + 8)
    expect(input.height, evidence).toBeGreaterThanOrEqual(24 * fontScale + 24)
    expect(input.height, evidence).toBeLessThanOrEqual(input.maximumHeight)
    if (fontScale === 1) expect(input.placeholderWidth, evidence).toBeLessThanOrEqual(input.contentWidth)
    if (scenario === 'longText') {
      expect(input.height, evidence).toBe(input.maximumHeight)
      expect(input.scrollHeight, evidence).toBeGreaterThan(input.height)
    } else expect(input.scrollHeight, evidence).toBeLessThanOrEqual(input.height)
  } else expect(measured.pill.height, evidence).toBeGreaterThanOrEqual(56)
}

const chipScenarios = ['empty', 'pending', 'returning', 'completed', 'habitDetail', 'longTitle', 'unbrokenTitle', 'namedActions'] as const

function liveChipSuggestions(scenario: typeof chipScenarios[number], messages: typeof en) {
  const surface = scenario === 'habitDetail' ? 'habitDetail' as const : 'today' as const
  const title = scenario === 'unbrokenTitle' ? 'a'.repeat(200) : scenario === 'longTitle'
    ? messages === en ? 'Read a chapter of my favorite book before breakfast' : 'Ler um capítulo do meu livro favorito antes do café da manhã'
    : messages === en ? 'Read' : 'Ler'
  const habits = scenario === 'empty' || scenario === 'habitDetail' ? [] : [createMockHabit({
    title, isOverdue: scenario === 'pending', hasSubHabits: true, isCompleted: scenario === 'completed',
  })]
  const chipState = { surface, status: 'success' as const, habits, totalHabitCount: habits.length,
    profile: createMockProfile({ lastCompletionDate: scenario === 'returning' ? '2026-09-01' : null }),
    now: new Date('2026-09-10T12:00:00Z'), detailHabit: { title, checklistItems: [] } }
  const namedHabit = createMockHabit({ title: 'a'.repeat(200), hasSubHabits: true, isOverdue: true })
  const chips = scenario === 'namedActions' ? [
    buildComposerChips({ ...chipState, habits: [namedHabit], totalHabitCount: 1 }),
    buildComposerChips({ ...chipState, habits: [namedHabit], totalHabitCount: 1, profile: createMockProfile({ lastCompletionDate: '2026-09-01' }) }),
    buildComposerChips({ ...chipState, habits: [{ ...namedHabit, isCompleted: true }], totalHabitCount: 1 }),
    buildComposerChips({ ...chipState, surface: 'progress', habits: [namedHabit], totalHabitCount: 1 }),
  ].flat().filter((chip, index, all) => chip.params && all.findIndex(candidate => candidate.id === chip.id) === index)
    : buildComposerChips(chipState)
  return { surface, suggestions: chips.map(({ id, params }) => {
    const [group, name] = id.split('.')
    const labels: Record<string, string> = messages.shell.composer.chips[group as keyof typeof messages.shell.composer.chips]
    return { id, label: labels[name!]!.replace('{title}', params?.title ?? '') }
  }) }
}

it.each([
  { locale: 'pt-BR', messages: ptBR, name: 'Abrir conversa' },
  { locale: 'en', messages: en, name: 'Open the conversation' },
])('names the conversation glyph in $locale', ({ messages, name }) => {
  const onOpenConversation = vi.fn()
  const view = render(<Composer {...geometryProps('idle', messages, true)} onOpenConversation={onOpenConversation} />)
  try {
    fireEvent.click(screen.getByRole('button', { name: `${name}, Astra` }))
    expect(onOpenConversation).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Abrir a conversa' })).not.toBeInTheDocument()
  } finally { view.unmount() }
})

function allowanceConfiguration(messages: typeof en, locale: 'en' | 'pt-BR', used: number, limit: number, withSuggestions: boolean) {
  const nearLimit = limit - used <= AI_MESSAGE_COUNTER_THRESHOLD
  const translate = createTranslator({ locale, messages })
  return {
    ...geometryProps(used === limit ? 'atLimit' : 'idle', messages, false), value: 'Keep this draft',
    suggestions: withSuggestions && used < limit ? toComposerSuggestions(liveChipSuggestions('habitDetail', messages).suggestions.map(suggestion => ({ ...suggestion, onSelect: vi.fn() }))) : [],
    usageMessage: nearLimit && used < limit ? translate('shell.composer.usage', { used, limit }) : undefined,
    allowanceReason: nearLimit ? translate('shell.composer.limit.reason', { allowance: limit }) : undefined,
    renewalHint: nearLimit ? messages.shell.composer.limit.renewal : undefined,
    ...(used === limit ? { state: 'atLimit', limitReason: translate('shell.composer.limit.reason', { allowance: limit }) } : {}),
  } as ComposerProps
}

function readAllowanceGeometry(root: Element) {
  const input = root.querySelector('[data-composer-input]')!
  const usage = root.querySelector('[data-composer-usage]')
  const row = root.querySelector('[data-composer-input-row]')!
  const slot = root.querySelector('[data-composer-status-slot]')
  const reason = root.querySelector('[data-composer-allowance-reason]')
  const renewal = root.querySelector('[data-composer-renewal]')
  const style = getComputedStyle(root)
  return { top: input.getBoundingClientRect().top, height: root.getBoundingClientRect().height,
    overflow: root.scrollWidth > root.clientWidth, numeric: usage ? getComputedStyle(usage).fontVariantNumeric : null,
    reserved: Boolean(slot), reservedHeight: slot?.getBoundingClientRect().height ?? 0,
    reservedMinimum: slot ? parseFloat(getComputedStyle(slot).minHeight) : 0,
    noticeHeight: reason && renewal ? reason.getBoundingClientRect().height + renewal.getBoundingClientRect().height + parseFloat(getComputedStyle(renewal.parentElement!).gap) : 0,
    visibleStatusText: [...(slot?.querySelectorAll('p, [data-suggestion-label]') ?? [])].filter(element => getComputedStyle(element).visibility !== 'hidden').map(element => element.textContent).join(''),
    inset: row.getBoundingClientRect().top - root.getBoundingClientRect().top,
    expected: parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) }
}

function expectAllowanceGeometry(geometry: ReturnType<typeof readAllowanceGeometry>, nearLimit: boolean, exhausted: boolean, withSuggestions: boolean) {
  expect(geometry.overflow).toBe(false)
  expect(geometry.reserved).toBe(nearLimit)
  if (!nearLimit) {
    expect(geometry.numeric).toBeNull()
    if (!withSuggestions) expect(geometry.inset).toBe(geometry.expected)
    return
  }
  expect(geometry.visibleStatusText.length).toBeGreaterThan(0)
  expect(geometry.reservedMinimum).toBe(96)
  expect(geometry.reservedHeight).toBeCloseTo(Math.max(96, geometry.noticeHeight), 1)
  if (!exhausted) expect(geometry.numeric).toContain('tabular-nums')
  else expect(geometry.numeric).toBeNull()
}

describe('Composer compact geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let composerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
    const buildOptions = {
      stdin: { contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
        import { Composer } from './components/shell/composer';
        import { AstraConversation } from './components/chat/conversation';
        import { createChatThreadScroll } from '@orbit/shared/hooks';
        const props = JSON.parse(document.getElementById('configuration').textContent);
        if (props.clipboardText) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => props.clipboardText } });
        function MountedComposer() {
          const [currentProps, setCurrentProps] = useState(props);
          React.useEffect(() => {
            const update = event => setCurrentProps(event.detail);
            document.addEventListener('composer-test-props', update);
            document.getElementById('root').setAttribute('data-composer-test-ready', '');
            return () => document.removeEventListener('composer-test-props', update);
          }, []);
          const [value, setValue] = useState(props.value);
          const composerProps = {
          ...currentProps, value, onChangeValue: setValue, onSend: () => {},
          onOpenConversation: props.conversationLabel ? () => {} : undefined,
          onAttachFile: props.attachWords ? () => {} : undefined,
          onAttachImage: props.attachWords ? () => {} : undefined,
          onAttachRemove: () => {},
          onVoice: props.voiceWords ? () => {} : undefined,
          attachWords: props.attachWords ? { ...props.attachWords,
            remove: name => props.attachmentRemoveTemplate.replace('{name}', name) } : undefined,
          suggestions: currentProps.suggestions.map(chip => ({ ...chip, onSelect: () => {},
            icon: React.createElement('svg', { width: 20, height: 20, 'aria-hidden': true }) }))
          };
          if (props.withMessages === undefined) return React.createElement(Composer, composerProps);
          return React.createElement(AstraConversation, { chat: {
            composerProps, threadScroll: createChatThreadScroll(), chatContainerRef: { current: null },
            messages: props.withMessages ? [{ id: 'previous', role: 'user', content: props.value, timestamp: new Date(0) }] : [],
            activeSteps: [], canShowFollowUps: false, showSuggestions: !props.withMessages,
            isTyping: false, streamingMessageId: null, scrollToBottom: () => {},
          } });
        }
        createRoot(document.getElementById('root')).render(React.createElement(MountedComposer));`, resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    }
    composerScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const options = JSON.parse(process.argv[1]);
      options.plugins = [{ name: 'composer-overlay-boundaries', setup(builder) {
        builder.onResolve({ filter: /^@\\/components\\/ui\\/(menu|sheet)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
        builder.onResolve({ filter: /^(next-intl|next\\/navigation)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
        builder.onResolve({ filter: /^@\\/components\\/(goals\\/goal-detail-drawer|chat\\/message-bubble|chat\\/prompt-library)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
        builder.onResolve({ filter: /^\\.\\/proactive-action$/ }, args => ({ path: args.path, namespace: 'boundary' }));
        builder.onResolve({ filter: /^@\\/stores\\/auth-store$/ }, args => ({ path: args.path, namespace: 'boundary' }));
        builder.onLoad({ filter: /.*/, namespace: 'boundary' }, () => ({ contents:
          'import React from "react"; export const useAuthStore = { getState: () => ({ isAuthenticated: true, user: { userId: "composer-account" } }) }; export const Menu = ({items}) => React.createElement("span", { hidden: true, "data-composer-menu-items": JSON.stringify(items.map(({id,label}) => ({id,label}))) }); export const Sheet = () => null; export const GoalDetailDrawer = () => null; export const MessageBubble = ({message}) => message.content; export const PromptLibrary = () => null; export const ProactiveAction = () => null; export const useRouter = () => ({}); export const useTranslations = () => key => key === \"nav.astra\" ? \"Astra\" : key === \"habits.form.askDate\" ? JSON.parse(document.getElementById(\"configuration\").textContent).astraRequestLabel : key;', loader: 'js', resolveDir: process.cwd() }));
      } }];
      const result = await build(options);
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify(buildOptions)], { maxBuffer: 10 * 1024 * 1024 }).toString()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([en, ptBR])('retains initial label and physical reservation geometry when text actions move into Add', async messages => {
    translationMessages = messages
    const configuration = { ...geometryProps('idle', messages, true), clipboardText: 'Clipboard text' }
    const markup = renderToString(<Composer {...configuration} />)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root">${markup}</div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await loadAppFonts(page)
      const row = page.locator('[data-composer-input-row]')
      const measure = () => row.evaluate(element => ({
        row: element.getBoundingClientRect().toJSON(),
        input: element.querySelector('[data-composer-input]')!.getBoundingClientRect().toJSON(),
        label: element.querySelector('[data-composer-input-minimum]')!.getBoundingClientRect().toJSON(),
        slot: element.querySelector('[data-composer-text-action-slot]')!.getBoundingClientRect().toJSON(),
        controls: element.querySelector('[data-composer-text-controls]')!.getBoundingClientRect().toJSON(),
      }))
      const first = await measure()
      expect(first.slot.width).toBe(48)
      expect(first.controls.width).toBe(100)
      await page.addScriptTag({ content: composerScript })
      await page.locator('#root[data-composer-test-ready]').waitFor()
      await expect.poll(measure).toEqual(first)
      expect(await page.locator('[data-composer-text-action-slot] button').count()).toBe(0)
      expect(await page.locator('[data-composer-input]').evaluate(composerPlaceholderFits, 1)).toBe(true)
    } finally { translationMessages = en; await page.close() }
  })

  it.each([{ width: 600, scale: 1 }, { width: 412, scale: 1.5 }])(
    'calibrates visual-line geometry against the actual composer at $width and $scale text', async ({ width, scale }) => {
      const configuration = geometryProps('idle', en, true)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * scale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const input = page.locator('[data-composer-input]')
        await expect.poll(() => input.evaluate(composerPlaceholderFits, scale)).toBe(true)
        const row = page.locator('[data-composer-input-row]')
        const arrangement = await row.evaluate(element => ({
          entry: element.querySelector('[data-open-conversation]')!.getBoundingClientRect().top,
          send: element.querySelector('[data-composer-trailing-controls]')!.lastElementChild!.getBoundingClientRect().top,
        }))
        expect(arrangement.send > arrangement.entry).toBe(scale > 1)
        const faults = [
          { selector: '[data-composer-controls] button', style: { width: '47px', minWidth: '47px', maxWidth: '47px' } },
          { selector: '[data-composer-controls] button', style: { height: '47px', minHeight: '47px', maxHeight: '47px' } },
          { selector: '[data-composer-trailing-controls] > button', style: { marginInlineStart: '-8px' } },
          { selector: '[data-composer-trailing-controls]', style: { flexDirection: 'row-reverse' } },
          { selector: '[data-open-conversation]', style: { position: 'relative', top: '2px' } },
          { selector: '[data-composer-input-row]', style: { paddingBottom: '8px' } },
          { selector: '[data-composer-input]', style: { width: '20px', minWidth: '20px' } },
          { selector: '[data-composer-trailing-controls] > button', style: { position: 'relative', left: '400px' } },
        ]
        for (const fault of faults) {
          const target = page.locator(fault.selector)
          const previous = await target.getAttribute('style')
          try {
            await target.evaluate((element, style) => Object.assign((element as HTMLElement).style, style), fault.style)
            expect(await input.evaluate(composerPlaceholderFits, scale), JSON.stringify(fault)).toBe(false)
          } finally {
            await target.evaluate((element, previous) => previous === null ? element.removeAttribute('style') : element.setAttribute('style', previous), previous)
          }
          expect(await input.evaluate(composerPlaceholderFits, scale)).toBe(true)
        }
      } finally { await page.close() }
    },
  )

  it('keeps the compact composer inset when no daily allowance hint is supplied', async () => {
    const view = render(<Composer {...geometryProps('idle', en, false)} />)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-composer-root]').evaluate((root) => {
        const input = root.querySelector('[data-composer-input-row]')!
        const style = getComputedStyle(root)
        return { inset: input.getBoundingClientRect().top - root.getBoundingClientRect().top,
          expected: Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.paddingTop) }
      })
      expect(geometry.inset).toBe(geometry.expected)
    } finally { view.unmount(); await page.close() }
  })

  const allowanceCases = [320, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['light', 'dark'] as const).flatMap(mode => [5, 50].flatMap(limit => [false, true].map(withSuggestions =>
      ({ width, locale, mode, limit, withSuggestions, fontScale: 1 }))))))
    .concat((['en', 'pt-BR'] as const).map(locale => ({ width: 320, locale, mode: 'dark' as const, limit: 50, withSuggestions: true, fontScale: 2 })))

  it.each(allowanceCases)('keeps Hoje stable near $limit messages at $width in $locale $mode with chips $withSuggestions and scale $fontScale', async ({ width, locale, mode, limit, withSuggestions, fontScale }) => {
    const messages = locale === 'en' ? en : ptBR
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    const measured: Array<{ top: number; height: number }> = []
    try {
      for (const used of [limit - 3, limit - 2, limit - 1, limit]) {
        const nearLimit = limit - used <= AI_MESSAGE_COUNTER_THRESHOLD
        const configuration = allowanceConfiguration(messages, locale, used, limit, withSuggestions)
        await page.setContent(`<style>${stylesheet}:root{${theme}}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const geometry = await page.locator('[data-composer-root]').evaluate(readAllowanceGeometry)
        expectAllowanceGeometry(geometry, nearLimit, used === limit, withSuggestions)
        measured.push({ top: geometry.top, height: geometry.height })
      }
      expect(measured[0]!.height).toBeLessThan(measured[1]!.height)
      expect(measured[1]).toEqual(measured[2])
      expect(measured[2]).toEqual(measured[3])
    } finally { await page.close() }
  })

  it.each(allowanceCases)('keeps the mounted allowance frame before and after font measurement at $width in $locale $mode near $limit with chips $withSuggestions and scale $fontScale', async ({ width, locale, mode, limit, withSuggestions, fontScale }) => {
    const messages = locale === 'en' ? en : ptBR
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const configuration = allowanceConfiguration(messages, locale, limit - 1, limit, withSuggestions)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}:root{${theme}}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      const root = page.locator('[data-composer-root]')
      await page.locator('#root[data-composer-test-ready]').waitFor()
      for (const phase of ['initial', 'fonts'] as const) {
        if (phase === 'fonts') await loadAppFonts(page)
        const frames: Array<{ top: number; height: number }> = []
        const snapshots = []
        for (const used of [limit - 1, limit, limit - 1, limit]) {
          const next = allowanceConfiguration(messages, locale, used, limit, withSuggestions)
          await page.evaluate(nextProps => document.dispatchEvent(new CustomEvent('composer-test-props', { detail: JSON.parse(nextProps) })), JSON.stringify(next))
          await expect.poll(() => root.getAttribute('data-state')).toBe(next.state)
          const geometry = await root.evaluate(readAllowanceGeometry)
          const snapshot = await page.locator('[data-composer-input]').evaluate(input => {
            const row = input.closest<HTMLElement>('[data-composer-input-row]')!
            const style = getComputedStyle(input)
            return { input: { top: input.getBoundingClientRect().top, width: input.clientWidth, height: input.clientHeight,
              minimum: style.minWidth, font: style.font, placeholder: (input as HTMLTextAreaElement).placeholder },
              pill: { top: row.getBoundingClientRect().top, height: row.getBoundingClientRect().height },
              targets: [...row.querySelectorAll('button')].map(button => ({ name: button.getAttribute('aria-label'),
                top: button.getBoundingClientRect().top, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
              reserved: Boolean(row.querySelector('[data-composer-text-action-slot]')) }
          })
          snapshots.push({ phase, used, snapshot, geometry })
          expectAllowanceGeometry(geometry, true, used === limit, withSuggestions)
          frames.push({ top: geometry.top, height: geometry.height })
        }
        for (const frame of frames.slice(1)) expect(frame, JSON.stringify(snapshots)).toEqual(frames[0])
      }
    } finally { await page.close() }
  })

  it.each(['en', 'pt-BR'] as const)('keeps the 50-message counter on one line at 320 in %s', async (locale) => {
    const messages = locale === 'en' ? en : ptBR
    const translate = createTranslator({ locale, messages })
    const view = render(<Composer {...geometryProps('idle', messages, false)}
      allowanceReason={translate('shell.composer.limit.reason', { allowance: 50 })}
      renewalHint={messages.shell.composer.limit.renewal}
      usageMessage={translate('shell.composer.usage', { used: 48, limit: 50 })} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const lines = await page.locator('[data-composer-usage]').evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))
      expect(lines).toBeCloseTo(1, 1)
    } finally { view.unmount(); await page.close() }
  })

  it.each((['en', 'pt-BR'] as const).flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ locale, mode }))))('keeps the habit capacity message neutral and contained in $locale $mode', async ({ locale, mode }) => {
    const messages = locale === 'en' ? en : ptBR
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const body = createTranslator({ locale, messages })('habits.form.capacityBody', { limit: MAX_ACTIVE_HABITS })
    const view = render(<main style={{ padding: 16 }}><input aria-label="Draft" defaultValue="Morning walk" /><CapacityNotice message={messages.habits.form.capacityTitle} body={body} /></main>)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}:root{${theme}}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      expect(await page.locator('input').inputValue()).toBe('Morning walk')
      const geometry = await page.locator('[data-capacity-notice]').evaluate((notice) => {
        const title = notice.querySelector('p')!
        return { overflow: notice.scrollWidth > notice.clientWidth, titleHeight: title.getBoundingClientRect().height,
          titleLine: Number.parseFloat(getComputedStyle(title).lineHeight), colors: [...notice.querySelectorAll('p')].map((element) => getComputedStyle(element).color),
          neutral: ['--fg-1', '--fg-2'].map((token) => {
            const probe = document.createElement('span')
            probe.style.color = `var(${token})`
            notice.append(probe)
            const color = getComputedStyle(probe).color
            probe.remove()
            return color
          }) }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.titleHeight).toBeLessThanOrEqual(geometry.titleLine + 1)
      expect(await page.locator('[data-capacity-notice] button').count()).toBe(0)
      expect(await page.locator('[data-capacity-notice]').textContent()).toContain(locale === 'pt-BR' ? '1.000' : '1,000')
      expect(geometry.colors).toEqual(geometry.neutral)
    } finally { view.unmount(); await page.close() }
  })
  it.each([320, 412].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
    'moves text actions only when the whole placeholder needs their slot at $width', async ({ width, messages }) => {
      const configuration = { ...geometryProps('idle', messages, true), clipboardText: 'Pasted message' }
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const input = page.locator('[data-composer-input]')
        const placements = new Set<boolean>()
        for (const nextWidth of [width, 600, width === 320 ? 412 : 320, width]) {
          await page.setViewportSize({ width: nextWidth, height: 915 })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const layout = await readTextActionLayout(page)
          const padding = parseFloat(layout.paddingInlineStart) + parseFloat(layout.paddingInlineEnd)
          const available = layout.rowWidth - parseFloat(layout.rowPaddingStart) - parseFloat(layout.rowPaddingEnd)
          const inlineMinimum = layout.entryWidth + layout.sendWidth + layout.inlineWidth + parseFloat(layout.trailingGap)
            + Math.max(3 * parseFloat(layout.fontSize), Math.ceil(layout.metrics.width!) + padding)
          const inMenu = inlineMinimum > available
          placements.add(inMenu)
          const pasteCount = await page.locator('[data-composer-paste]').count()
          const menuPaste = layout.menuItems.filter(item => item.id === 'paste')
          expect(pasteCount + menuPaste.length, JSON.stringify(layout)).toBe(1)
          expect(pasteCount, JSON.stringify(layout)).toBe(inMenu ? 0 : 1)
          if (inMenu) expect(layout.menuItems[0]).toEqual({ id: 'paste', label: messages.shell.composer.paste })
          const empty = await input.evaluate(measureFieldInset)
          expect(await input.getAttribute('placeholder')).toBe(messages.shell.composer.placeholder)
          expect(empty.height).toBe(empty.lineHeight + 24)
          expect(layout.metrics.width!).toBeLessThanOrEqual(empty.contentWidth)
          await input.fill('Draft')
          expect(await input.inputValue()).toBe('Draft')
          const typed = await input.evaluate(measureFieldInset)
          expect(typed.contentWidth).toBe(empty.contentWidth)
          const typedLayout = await readTextActionLayout(page)
          const clearCount = await page.locator('[data-composer-clear]').count()
          expect(clearCount + typedLayout.menuItems.filter(item => item.id === 'clear').length).toBe(1)
          expect(clearCount).toBe(inMenu ? 0 : 1)
          if (inMenu) {
            expect(typedLayout.menuItems[0]).toEqual({ id: 'clear', label: messages.shell.composer.clear })
            await input.fill('')
            await expectNarrowMenuPaste(page, messages)
          } else await page.locator('[data-composer-clear]').click()
          expect(await input.inputValue()).toBe('')
          expect(await input.evaluate(element => element === document.activeElement)).toBe(true)
          expect(await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 0])
          const restored = await readTextActionLayout(page)
          expect(await page.locator('[data-composer-paste]').count() + restored.menuItems.filter(item => item.id === 'paste').length).toBe(1)
          for (const control of await page.locator('[data-composer-input-row] button').all()) {
            const target = (await control.boundingBox())!
            const field = (await page.locator('[data-composer-input-row]').boundingBox())!
            const text = (await input.boundingBox())!
            expect(target.width).toBeGreaterThanOrEqual(48)
            expect(target.height).toBeGreaterThanOrEqual(48)
            expect(target.x).toBeGreaterThanOrEqual(field.x + 4)
            expect(target.y).toBeGreaterThanOrEqual(field.y + 4)
            expect(target.x + target.width).toBeLessThanOrEqual(field.x + field.width - 4)
            expect(target.y + target.height).toBeLessThanOrEqual(field.y + field.height - 4)
            expect(target.x + target.width <= text.x || target.x >= text.x + text.width || target.y + target.height <= text.y || target.y >= text.y + text.height).toBe(true)
          }
        }
        expect([...placements].sort((left, right) => Number(left) - Number(right))).toEqual([false, true])
      } finally { await page.close() }
    },
  )

  it.each([360, 412, 1200, 1600].flatMap(width => [false, true].map(withMessages => ({ width, withMessages }))))(
    'contains the prefilled conversation input at $width with messages $withMessages', async ({ width, withMessages }) => {
      const prompt = ptBR.habits.detail.askAstraSeedDefault.replace('{title}', 'Ler 10 minutos')
      const configuration = { ...geometryProps('idle', ptBR, false), value: prompt, withMessages }
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root" style="height:915px;max-width:740px;margin:auto"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const input = page.locator('[data-composer-input]')
        await expect.poll(() => input.evaluate(element => element === document.activeElement)).toBe(true)
        expect(await input.inputValue()).toBe(prompt)
        expect(await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([prompt.length, prompt.length])
        for (const value of [prompt, Array.from({ length: 8 }, () => prompt).join('\n'), 'Ler']) {
          if (value !== prompt) await input.fill(value)
          const geometry = await input.evaluate(element => {
            const field = element.closest<HTMLElement>('[data-composer-input-row]')!
            const pill = field.getBoundingClientRect()
            const text = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            const fullInput = element.cloneNode(true) as HTMLTextAreaElement
            Object.assign(fullInput.style, { position: 'fixed', visibility: 'hidden', width: `${text.width}px`, minWidth: '0', maxWidth: 'none', maxHeight: 'none', height: 'auto' })
            fullInput.value = (element as HTMLTextAreaElement).value
            document.body.append(fullInput)
            const naturalHeight = fullInput.scrollHeight
            fullInput.remove()
            return { top: text.top, bottom: text.bottom, left: text.left, right: text.right, height: element.clientHeight,
              fieldTop: pill.top, fieldBottom: pill.bottom, fieldLeft: pill.left, fieldRight: pill.right,
              controls: [...field.querySelectorAll('button')].map(button => {
                const target = button.getBoundingClientRect()
                return { name: button.getAttribute('aria-label'), left: target.left, right: target.right,
                  top: target.top, bottom: target.bottom, width: target.width, height: target.height }
              }),
              naturalHeight, minimumHeight: parseFloat(style.minHeight), scrollHeight: element.scrollHeight, maximumHeight: parseFloat(style.maxHeight),
              overflowY: style.overflowY }
          })
          expect(geometry.top).toBeGreaterThanOrEqual(geometry.fieldTop + 4)
          expect(geometry.bottom).toBeLessThanOrEqual(geometry.fieldBottom - 4)
          expect(geometry.left).toBeGreaterThanOrEqual(geometry.fieldLeft + 4)
          expect(geometry.right).toBeLessThanOrEqual(geometry.fieldRight - 4)
          expect(geometry.height).toBe(Math.max(geometry.minimumHeight, Math.min(geometry.maximumHeight, geometry.naturalHeight)))
          for (const control of geometry.controls) {
            expect(control.width).toBeGreaterThanOrEqual(48)
            expect(control.height).toBeGreaterThanOrEqual(48)
            expect(control.left).toBeGreaterThanOrEqual(geometry.fieldLeft + 4)
            expect(control.right).toBeLessThanOrEqual(geometry.fieldRight - 4)
            expect(control.top).toBeGreaterThanOrEqual(geometry.fieldTop + 4)
            expect(control.bottom).toBeLessThanOrEqual(geometry.fieldBottom - 4)
            expect(control.right <= geometry.left || control.left >= geometry.right || control.bottom <= geometry.top || control.top >= geometry.bottom).toBe(true)
          }
          expect(geometry.controls.filter(control => control.name === `${ptBR.shell.composer.send}, ${ptBR.habits.form.askDate}`)).toHaveLength(1)
          expect(await input.inputValue()).toBe(value)
          expect(await input.evaluate(element => element === document.activeElement)).toBe(true)
          expect(await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([value.length, value.length])
          if (geometry.naturalHeight > geometry.maximumHeight) {
            expect(geometry.height).toBe(geometry.maximumHeight)
            expect(geometry.scrollHeight).toBeGreaterThan(geometry.height)
            expect(geometry.overflowY).toBe('auto')
            await input.evaluate(element => { element.scrollTop = element.scrollHeight })
            expect(await input.evaluate(element => ({ reached: element.scrollTop + element.clientHeight, end: element.scrollHeight }))).toEqual({ reached: geometry.scrollHeight, end: geometry.scrollHeight })
          } else {
            expect(geometry.scrollHeight).toBe(geometry.height)
            expect(await input.evaluate(element => element.scrollTop)).toBe(0)
          }
        }
      } finally { await page.close() }
    },
  )

  it.each([320, 412, 1352].flatMap(width => [false, true].flatMap(withOpener =>
    ['ltr', 'rtl'].map(direction => ({ width, withOpener, direction })),
  )))('pads the caret and placeholder at $width with opener $withOpener in $direction', async ({ width, withOpener, direction }) => {
    const configuration = geometryProps('idle', en, withOpener)
    if (direction === 'rtl') configuration.words = { ...configuration.words, placeholder: 'אבג' }
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" dir="${direction}"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const field = page.locator('[data-composer-input]')
      const placeholder = await field.evaluate(measureFieldInset)
      expect.soft(placeholder.paddingStart).toBe(8)
      expect.soft(placeholder.paddingEnd).toBe(8)
      expect.soft(placeholder.inset).toBe(8)
      const leading = await field.evaluate(element => {
        const input = element.getBoundingClientRect()
        const pill = element.closest('[data-composer-input-row]')!.getBoundingClientRect()
        const entry = element.closest('[data-composer-input-row]')!.querySelector('[data-open-conversation]')?.getBoundingClientRect()
        const sameLine = entry && entry.top < input.bottom && entry.bottom > input.top
        return { entryWidth: sameLine ? entry!.width : 0, pillLeft: pill.left, pillRight: pill.right, inputLeft: input.left, inputRight: input.right }
      })
      expect.soft(placeholder.pillInset).toBe(4 + leading.entryWidth + 8)
      const box = (await field.boundingBox())!
      await page.mouse.click(direction === 'rtl' ? box.x + box.width - 2 : box.x + 2, box.y + box.height / 2)
      expect(await field.evaluate(element => element === document.activeElement)).toBe(true)
      await field.fill((direction === 'rtl' ? 'אבג ' : 'Astra ').repeat(10).trim())
      const typed = await field.evaluate(measureFieldInset)
      expect(typed.inset).toBe(placeholder.inset)
      const ownedWidth = await field.evaluate(element => ({ clientWidth: element.clientWidth,
        padding: parseFloat(getComputedStyle(element).paddingInlineStart) + parseFloat(getComputedStyle(element).paddingInlineEnd) }))
      expect(typed.contentWidth).toBe(ownedWidth.clientWidth - ownedWidth.padding)
      expect(typed.contentWidth).toBe(placeholder.contentWidth)
      if (width === 320) expect(typed.height).toBeGreaterThan(placeholder.height)
      expect(typed.height).toBeLessThanOrEqual(typed.maximumHeight)
      if (typed.height === typed.maximumHeight) expect(typed.scrollHeight).toBeGreaterThanOrEqual(typed.height)
      else expect(typed.scrollHeight).toBe(typed.height)
      for (const control of await page.locator('[data-composer-input-row] button').all()) {
        const bounds = (await control.boundingBox())!
        expect(bounds.width).toBeGreaterThanOrEqual(48)
        expect(bounds.height).toBeGreaterThanOrEqual(48)
        const input = (await field.boundingBox())!
        const pill = (await page.locator('[data-composer-input-row]').boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(pill.x + 4)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(pill.x + pill.width - 4)
        expect(bounds.y).toBeGreaterThanOrEqual(pill.y + 4)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(pill.y + pill.height - 4)
        expect(bounds.x + bounds.width <= input.x || bounds.x >= input.x + input.width || bounds.y + bounds.height <= input.y || bounds.y >= input.y + input.height).toBe(true)
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap(messages => (['offline', 'atLimit'] as const).flatMap(scenario =>
    [{ fontScale: 2, width: 320 }, { fontScale: 1, width: 600 },
      { fontScale: 1, width: 240 }].map(size => ({ messages, scenario, ...size })),
  )))('updates the mounted $scenario placeholder at $fontScale text and $width width', async ({ messages, scenario, fontScale, width }) => {
    const configuration = geometryProps(scenario, messages, true)
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    const view = render(<Composer {...geometryProps('idle', messages, true)} />)
    let restoreContext: (() => void) | undefined
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.locator('[data-composer-input]').evaluate((element, placeholder) => {
        const style = getComputedStyle(element)
        const context = document.createElement('canvas').getContext('2d')!
        context.font = style.font
        context.letterSpacing = style.letterSpacing
        const metrics = context.measureText(placeholder)
        return { clientWidth: element.clientWidth, font: style.font, fontSize: style.fontSize,
          letterSpacing: style.letterSpacing, paddingInlineStart: style.paddingInlineStart, paddingInlineEnd: style.paddingInlineEnd,
          metrics: Object.fromEntries(Object.keys(Object.getPrototypeOf(metrics))
            .filter(key => typeof Reflect.get(metrics, key) === 'number').map(key => [key, Reflect.get(metrics, key)])) }
      }, configuration.words.placeholder)
      const field = screen.getByRole('textbox')
      Object.assign(field.style, { font: measured.font, fontSize: measured.fontSize, letterSpacing: measured.letterSpacing,
        paddingInlineStart: measured.paddingInlineStart, paddingInlineEnd: measured.paddingInlineEnd })
      const widthSpy = vi.spyOn(field, 'clientWidth', 'get').mockReturnValue(measured.clientWidth)
      const measureText = vi.fn(() => measured.metrics as unknown as TextMetrics)
      const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '', letterSpacing: '', measureText,
      } as unknown as CanvasRenderingContext2D)
      restoreContext = () => contextSpy.mockRestore()
      view.rerender(<Composer {...configuration} />)
      const style = getComputedStyle(field)
      const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd)
      expect(parseFloat(style.fontSize)).toBe(16 * fontScale)
      for (const clientWidth of [measured.clientWidth, Math.floor(measured.metrics.width!) + padding - 1, Math.ceil(measured.metrics.width!) + padding]) {
        widthSpy.mockReturnValue(clientWidth)
        await act(() => document.fonts.dispatchEvent(new Event('loadingdone')))
        const fits = measured.metrics.width! <= clientWidth - padding
        expect(field).toHaveAttribute('placeholder', fontScale > 1.3 || fits ? configuration.words.placeholder : '')
      }
      if (fontScale === 2) expect(measureText).not.toHaveBeenCalled()
      else expect(measureText).toHaveBeenCalledWith(configuration.words.placeholder)
      widthSpy.mockRestore()
    } finally { restoreContext?.(); view.unmount(); await page.close() }
  })

  it.each([ptBR, en].flatMap(messages => [false, true].flatMap(withOpener =>
    (['idle', 'offline', 'atLimit'] as const).map(scenario => ({ messages, withOpener, scenario })),
  )))('keeps the placeholder whole through text resizing while $scenario with opener $withOpener', async ({ messages, withOpener, scenario }) => {
    const configuration = geometryProps(scenario, messages, withOpener)
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const field = page.locator('[data-composer-input]')
      for (const fontScale of [1, 1.3, 1.5, 2, 1]) {
        await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
        await vi.waitFor(async () => {
          const measured = await field.evaluate(element => {
            const input = element as HTMLTextAreaElement
            const style = getComputedStyle(input)
            const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
            const canvas = document.createElement('canvas').getContext('2d')!
            canvas.font = style.font
            canvas.letterSpacing = style.letterSpacing
            return { placeholder: input.placeholder, width: input.clientWidth, scrollWidth: input.scrollWidth,
              height: input.clientHeight, scrollHeight: input.scrollHeight,
              singleLineHeight: parseFloat(style.lineHeight) + padding,
              textWidth: canvas.measureText(input.placeholder).width,
              contentWidth: input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
              pillHeight: input.closest('[data-composer-input-row]')!.getBoundingClientRect().height }
          })
          const evidence = JSON.stringify({ scenario, withOpener, fontScale, measured })
          expect(measured.scrollWidth, evidence).toBeLessThanOrEqual(measured.width)
          expect(measured.scrollHeight, evidence).toBeLessThanOrEqual(measured.height)
          expect(measured.pillHeight, evidence).toBeGreaterThanOrEqual(56)
          expect(measured.pillHeight, evidence).toBeGreaterThanOrEqual(measured.height + 8)
          if (fontScale > 1.3) {
            expect(measured.placeholder, evidence).toBe(configuration.words.placeholder)
          }
          if (measured.textWidth > measured.contentWidth) expect(measured.height, evidence).toBeGreaterThan(measured.singleLineHeight)
          else expect(measured.height, evidence).toBeCloseTo(measured.singleLineHeight, 0)
        })
        if (scenario === 'idle' && fontScale === 2) {
          const placeholderHeight = await field.evaluate(element => element.clientHeight)
          await field.fill('Oi')
          await vi.waitFor(async () => {
            expect(await field.inputValue()).toBe('Oi')
            expect(await field.evaluate(element => element.clientHeight)).toBe(72)
          })
          await field.fill('Mensagem longa\n'.repeat(12))
          await vi.waitFor(async () => {
            const typed = await field.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }))
            expect(typed.height).toBe(264)
            expect(typed.scrollHeight).toBeGreaterThan(typed.height)
          })
          await field.fill('')
          await vi.waitFor(async () => expect(await field.evaluate(element => element.clientHeight)).toBe(placeholderHeight))
        }
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap(messages => ['idle', 'offline', 'atLimit'].map(state => ({ messages, state }))))(
    'shows a whole state placeholder or omits it as the pill resizes: $state', async ({ messages, state }) => {
      const configuration = geometryProps(state as GeometryScenario, messages, true)
      const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const field = page.locator('[data-composer-input]')
        for (const width of [320, 360, 384, 412, 600, 320]) {
          await page.setViewportSize({ width, height: 740 })
          await vi.waitFor(async () => {
            const measured = await field.evaluate(element => {
              const input = element as HTMLTextAreaElement
              const style = getComputedStyle(input)
              const context = document.createElement('canvas').getContext('2d')!
              context.font = style.font
              context.letterSpacing = style.letterSpacing
              return { placeholder: input.placeholder, textWidth: context.measureText(input.placeholder).width,
                availableWidth: input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd) }
            })
            expect(measured.textWidth, JSON.stringify({ width, state, measured })).toBeLessThanOrEqual(measured.availableWidth)
            if (state === 'idle' || width === 600) expect(measured.placeholder).toBe(configuration.words.placeholder)
          })
        }
      } finally { await page.close() }
    }, 30_000,
  )

  it.each([en, ptBR])('hugs every returning conversation suggestion across supported widths', async messages => {
    const { suggestions } = liveChipSuggestions('returning', messages)
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
      for (const width of [320, 412, 600, 840, 1100, 1352, 320]) {
        await page.setViewportSize({ width, height: 740 })
        await vi.waitFor(async () => {
          const measured = await strip.evaluate(element => {
            element.scrollLeft = 0
            const bounds = element.getBoundingClientRect()
            return { available: element.parentElement!.getBoundingClientRect().width, viewport: bounds.width,
              chips: [...element.querySelectorAll('button')].map(button => {
                const style = getComputedStyle(button)
                return { label: button.textContent, width: button.getBoundingClientRect().width,
                  content: button.querySelector('[data-suggestion-content]')!.getBoundingClientRect().width,
                  padding: parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) }
              }) }
          })
          const evidence = JSON.stringify({ width, measured })
          expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          for (const chip of measured.chips) expect(Math.abs(chip.width - chip.content - chip.padding), evidence).toBeLessThanOrEqual(1)
        })
      }
    } finally { await page.close() }
  })

  it('keeps content widths when a mounted habit detail strip grows and shrinks', async () => {
    const { suggestions } = liveChipSuggestions('habitDetail', en)
    expect(suggestions.map(chip => chip.id)).toEqual(['habitDetail.pauseThisWeek', 'habitDetail.rename'])
    const configuration = { state: 'idle', value: '', suggestions, words: en.shell.composer }
    const page = await browser.newPage({ viewport: { width: 600, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="width:208px"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel })
      const measure = () => strip.evaluate(element => {
        element.scrollLeft = 0
        const bounds = element.getBoundingClientRect()
        const chips = [...element.querySelectorAll('button')].map(button => {
          const chip = button.getBoundingClientRect()
          const style = getComputedStyle(button)
          return { left: chip.left - bounds.left, right: chip.right - bounds.left, width: chip.width,
            maximum: parseFloat(style.maxWidth),
            content: button.querySelector('[data-suggestion-content]')!.getBoundingClientRect().width,
            padding: parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) }
        })
        const partial = chips.find(chip => chip.left < bounds.width && chip.right > bounds.width)
        return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          available: element.parentElement!.getBoundingClientRect().width,
          chips, peek: partial ? bounds.width - partial.left : 0,
          hidden: partial ? partial.right - bounds.width : 0 }
      })
      for (const width of [208, 459, 208, 459]) {
        await page.locator('#root').evaluate((element, nextWidth) => { element.style.width = `${nextWidth}px` }, width)
        await vi.waitFor(async () => {
          const measured = await measure()
          expect(measured.clientWidth).toBe(width - 32)
          expect(measured.available).toBe(measured.clientWidth)
          for (const chip of measured.chips) {
            expect(chip.maximum, JSON.stringify(measured)).toBe(width - 64)
            expect(Math.abs(chip.width - chip.content - chip.padding), JSON.stringify(measured)).toBeLessThanOrEqual(1)
          }
          if (width === 459) {
            expect(measured.scrollWidth, JSON.stringify(measured)).toBe(measured.clientWidth)
            expect(measured.chips.every(chip => chip.left >= 0 && chip.right <= measured.clientWidth)).toBe(true)
          } else {
            expect(measured.scrollWidth).toBeGreaterThan(measured.clientWidth)
            expect(measured.peek).toBeGreaterThanOrEqual(16)
            expect(measured.hidden).toBeGreaterThanOrEqual(16)
          }
        })
      }
      const resized = await measure()
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="width:459px"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      await vi.waitFor(async () => { expect(await measure()).toEqual(resized) })
    } finally { await page.close() }
  })

  it.each([en, ptBR])('keeps a readable peek for live Today chips at 320 with doubled text', async (messages) => {
    const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0,
      profile: createMockProfile() })
    const labels = messages.shell.composer.chips.today
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('today.', '') as keyof typeof labels], onSelect: vi.fn() })))

    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
      const measured = await strip.evaluate((element) => {
        const viewport = element.getBoundingClientRect()
        const controls = [...element.querySelectorAll('button')].map((button) => {
          const bounds = button.getBoundingClientRect()
          return { label: button.textContent, left: bounds.left, right: bounds.right, width: bounds.width }
        })
        const partial = controls.find((control) => control.left < viewport.right && control.right > viewport.right)
        return { availableWidth: viewport.width, controls, peek: partial ? viewport.right - partial.left : 0,
          hidden: partial ? partial.right - viewport.right : 0 }
      })
      const evidence = JSON.stringify(measured)
      expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
      expect(measured.hidden, evidence).toBeGreaterThanOrEqual(16)
    } finally { await page.close() }
  })


  it.each([en, ptBR].flatMap(messages => [1, 2].flatMap(fontScale =>
    chipScenarios.map(scenario => ({ messages, fontScale, scenario })))))(
    'keeps $scenario chips whole with a measured peek at $fontScale text across compact widths', async ({ messages, fontScale, scenario }) => {
      const { surface, suggestions } = liveChipSuggestions(scenario, messages)
      const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
        await strip.waitFor()
        for (const width of [320, 360, 384, 412, 600, 840, 1100, 1352, 412, 320]) {
          await page.setViewportSize({ width, height: 740 })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const measured = await strip.evaluate(element => {
            element.scrollLeft = 0
            const viewport = element.getBoundingClientRect()
            const controls = [...element.querySelectorAll('button')].map(button => {
              const bounds = button.getBoundingClientRect()
              const text = button.querySelector('[data-suggestion-label]')!
              const style = getComputedStyle(text)
              const range = document.createRange()
              range.selectNodeContents(text)
              const lines = [...range.getClientRects()]
              const attribution = [...button.querySelectorAll<HTMLElement>('[translate="no"]')]
              const marks = [...button.querySelectorAll<SVGElement>('[data-asset="astra-mark-16"]')]
              return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
                label: text.textContent, accessibleName: button.getAttribute('aria-label'), lines: lines.length, textOverflow: style.textOverflow,
                textFits: lines.every(line => line.left >= bounds.left && line.right <= bounds.right && line.bottom <= bounds.bottom),
                attribution: attribution.map(element => element.textContent),
                attributionFits: attribution.every(element => {
                  const ink = element.getBoundingClientRect()
                  return ink.left >= bounds.left && ink.right <= bounds.right && ink.top >= bounds.top && ink.bottom <= bounds.bottom
                }),
                marks: marks.length, decorative: marks.every(mark => mark.getAttribute('aria-hidden') === 'true'),
                iconTop: button.querySelector('svg')!.getBoundingClientRect().top, firstLineTop: lines[0]!.top }
            })
            const partial = controls.find(control => control.left < viewport.right && control.right > viewport.right)
            return { viewport: viewport.width, available: element.parentElement!.getBoundingClientRect().width,
              overflow: element.scrollWidth > element.clientWidth, peek: partial ? viewport.right - partial.left : 0,
              hidden: partial ? partial.right - viewport.right : 0,
              documentWidth: document.documentElement.scrollWidth, controls }
          })
          const evidence = JSON.stringify({ width, fontScale, surface, scenario, measured })
          expect(measured.documentWidth, evidence).toBe(width)
          expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          if (measured.overflow) {
            expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
            expect(measured.hidden, evidence).toBeGreaterThanOrEqual(16)
            expect(measured.controls[0]!.right - measured.controls[0]!.left, evidence).toBeLessThan(measured.viewport)
          } else expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          for (const control of measured.controls) {
            expect(control.textFits, evidence).toBe(true)
            expect(control.accessibleName, evidence).toBe(`${control.label}, ${messages.nav.astra}`)
            expect(control.attribution, evidence).toEqual([messages.nav.astra])
            expect(control.attributionFits, evidence).toBe(true)
            expect(control.marks, evidence).toBe(1)
            expect(control.decorative, evidence).toBe(true)
            expect(control.textOverflow, evidence).not.toBe('ellipsis')
            expect(control.height, evidence).toBeGreaterThanOrEqual(48)
            expect(control.width, evidence).toBeLessThanOrEqual(measured.viewport)
            if (fontScale === 1) expect(control.lines, evidence).toBe(1)
            if (control.lines > 1) expect(Math.abs(control.iconTop - control.firstLineTop), evidence).toBeLessThanOrEqual(8)
          }
          await strip.locator('button').last().evaluate(element => (element as HTMLElement).blur())
          await strip.locator('button').last().focus()
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
          const lastVisible = await strip.evaluate(element => {
            const control = element.querySelector('button:last-child')!.getBoundingClientRect()
            const viewport = element.getBoundingClientRect()
            return control.left >= viewport.left - 1 && control.right <= viewport.right + 1
          })
          expect(lastVisible, evidence).toBe(true)
        }
      } finally { await page.close() }
    }, 30_000,
  )

  it.each([412, 1280].flatMap((width) => (['light', 'dark'] as const).flatMap((mode) => [false, true].map((forcedColors) => ({ width, mode, forcedColors })))))(
    'draws one field and action focus ring at $width in $mode with forced colors $forcedColors', async ({ width, mode, forcedColors }) => {
      const view = render(<Composer {...geometryProps('typing', en, false)} />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.emulateMedia({ forcedColors: forcedColors ? 'active' : 'none' })
        await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
        await page.evaluate((variables) => { for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, value) }, resolveWebThemeVariables('orange', mode))
        await page.keyboard.press('Tab')
        const field = page.getByRole('textbox')
        expect(await field.evaluate((element) => element === document.activeElement)).toBe(true)
        expect(await readFieldIndicators(field, '[data-composer-input-row]', { forcedColors })).toHaveLength(1)
        for (const name of [en.shell.composer.clear, en.shell.composer.actions, en.shell.composer.send]) {
          await page.keyboard.press('Tab')
          const control = page.getByRole('button', { name: name === en.shell.composer.send ? `${name}, Ask Astra` : name, exact: true })
          expect(await control.evaluate((element) => element === document.activeElement)).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          const outline = await control.evaluate((element) => {
            const style = getComputedStyle(element)
            const sample = document.createElement('span')
            sample.style.color = 'CanvasText'
            document.body.append(sample)
            const systemColor = getComputedStyle(sample).color
            sample.remove()
            const separator = document.createElement('span')
            separator.style.color = 'var(--bg)'
            document.body.append(separator)
            const separatorColor = getComputedStyle(separator).color
            separator.remove()
            return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor, systemColor, separatorColor, shadow: style.boxShadow }
          })
          expect(outline.width).toBe('2px')
          expect(outline.style).toBe('solid')
          expect(outline.color).toBe(forcedColors ? outline.systemColor : 'rgb(196, 83, 15)')
          if (!forcedColors && name === en.shell.composer.send) {
            expect(outline.shadow).toContain(`${outline.separatorColor} 0px 0px 0px 4px inset`)
            expect(contrastOnSurface(outline.color, [outline.separatorColor])).toBeGreaterThanOrEqual(3)
          }
        }
        fireEvent.click(screen.getByRole('button', { name: en.shell.composer.actions }))
        const menu = await screen.findByRole('menu')
        const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await page.keyboard.press('Tab')
        for (const name of [en.shell.composer.attach.image, en.shell.composer.attach.file, en.shell.composer.voice.start]) {
          const control = page.getByRole('menuitem', { name, exact: true })
          await control.focus()
          expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each([412, 1280].flatMap((width) => (['dark', 'light'] as const).map((mode) => ({ width, mode }))))(
    'keeps disabled attachment menu fills at rest on hover at $width in $mode', async ({ width, mode }) => {
      const view = render(<Composer {...geometryProps('atLimit', en, false)} />)
      fireEvent.click(screen.getByRole('button', { name: en.shell.composer.actions }))
      const menu = await screen.findByRole('menu')
      const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}:root{${theme}}.orbit-menu-item{--test-hover:0}.orbit-menu-item:hover{--test-hover:1}</style>${markup}`)
        for (const name of [en.shell.composer.attach.file, en.shell.composer.attach.image]) {
          const control = page.getByRole('menuitem', { name, exact: true })
          expect(await control.isDisabled()).toBe(true)
          await page.mouse.move(0, 914)
          const restingFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
          expect(restingFill).toBe('rgba(0, 0, 0, 0)')
          const bounds = (await control.boundingBox())!
          await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2)
          await page.waitForTimeout(300)
          expect(await control.evaluate((element) => getComputedStyle(element).getPropertyValue('--test-hover').trim())).toBe('1')
          expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restingFill)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each([412, 1280].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))(
    'keeps menu rows at their minimum height and grows for large text at $width and $fontScale', async ({ width, fontScale }) => {
      const presentation = width < 900 ? { presentation: 'sheet' as const }
        : { presentation: 'anchored' as const, anchorRef: createRef<HTMLButtonElement>() }
      const view = render(<Menu open {...presentation} title="Actions" items={[
        { id: 'file', label: en.shell.composer.attach.file, icon: 'file' },
        { id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
      ]} />)
      const menu = await screen.findByRole('menu')
      const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${markup}`)
        for (const item of await page.getByRole('menuitem').all()) {
          const measured = await item.evaluate((element) => {
            const style = getComputedStyle(element)
            return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight),
              padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom), border: parseFloat(style.borderTopWidth) }
          })
          const minimum = width < 900 ? 56 : 48
          expect(measured.height).toBeCloseTo(Math.max(minimum, measured.lineHeight + measured.padding + measured.border), 1)
          if (fontScale === 1) expect(measured.height).toBe(minimum)
          if (width >= 900 && fontScale === 2) expect(measured.height).toBeGreaterThan(minimum)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each(['reduce', 'no-preference'] as const)('keeps the press target intact with %s motion', async (reducedMotion) => {
    const view = render(<Composer {...geometryProps('idle', en, true)} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.emulateMedia({ reducedMotion })
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      const target = page.locator('[data-open-conversation]')
      const bounds = (await target.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(48)
      expect(bounds.height).toBeGreaterThanOrEqual(48)
      expect(await target.getAttribute('aria-label')).toBe(`${en.todayAstra.openConversation}, ${en.nav.astra}`)
      expect(await target.locator('[translate="no"]').allTextContents()).toEqual([en.nav.astra])
      expect(await target.locator('[data-asset="astra-mark"][aria-hidden="true"]').count()).toBe(1)
      expect((await target.locator('svg').boundingBox())!.width).toBe(20)
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(250)
      expect(await target.boundingBox()).toEqual(bounds)
      const glyphWidth = (await target.locator('svg').boundingBox())!.width
      expect(glyphWidth).toBeCloseTo(reducedMotion === 'reduce' ? 20 : 19.2, 1)
      await page.mouse.up()
      expect(await target.boundingBox()).toEqual(bounds)
      const field = (await page.locator('[data-composer-input-row]').boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(field.x + 4)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(field.x + field.width - 4)
      expect(bounds.y).toBeGreaterThanOrEqual(field.y + 4)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(field.y + field.height - 4)
      for (const control of await page.locator('[data-composer-input], [data-composer-trailing-controls] button').all()) {
        const other = (await control.boundingBox())!
        expect(bounds.x + bounds.width <= other.x || bounds.x >= other.x + other.width || bounds.y + bounds.height <= other.y || bounds.y >= other.y + other.height).toBe(true)
      }
    } finally { await page.close(); view.unmount() }
  })

  it.each([en, ptBR])('keeps composer sheet titles whole and close targets at 48 with doubled text', async (messages) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      for (const surface of ['actions', 'attachment'] as const) {
        const props = geometryProps('tray1', messages, true)
        const view = render(<Composer {...props} />)
        fireEvent.click(screen.getByRole('button', { name: surface === 'actions' ? messages.shell.composer.actions : props.attachments![0]!.name }))
        const dialog = await screen.findByRole('dialog')
        const markup = dialog.outerHTML
        view.unmount()
        await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${markup}`)
        await loadAppFonts(page)
        const header = await page.locator('.orbit-sheet-title').evaluate((title) => {
          const font = getComputedStyle(title).font
          const canvas = document.createElement('canvas').getContext('2d')!
          canvas.font = font
          const text = canvas.measureText(title.textContent!).width
          canvas.font = '500 44px Geist'
          return { available: title.clientWidth, text, nativeText: canvas.measureText(title.textContent!).width, fontSize: getComputedStyle(title).fontSize }
        })
        expect(header.fontSize).toBe('44px')
        expect(header.text, JSON.stringify({ surface, header })).toBeLessThanOrEqual(header.available)
        expect(header.nativeText, JSON.stringify({ surface, header })).toBeLessThanOrEqual(header.available)
        const close = page.getByRole('button', { name: 'common.close' })
        const bounds = (await close.boundingBox())!
        expect(bounds.width).toBeGreaterThanOrEqual(48)
        expect(bounds.height).toBeGreaterThanOrEqual(48)
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(250)
        expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(48)
        await page.mouse.up()
        for (const item of await page.getByRole('menuitem').all()) {
          expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(48)
        }
      }
    } finally { await page.close() }
  })

  it.each(cases)('keeps controls inside one pill at $width and $fontScale text size in both locales', async ({ width, messages, fontScale }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      for (const withOpener of [true, false]) for (const scenario of ['idle', 'oneLine', 'typing', 'longText', 'sending', 'recording', 'transcribing', 'tray1', 'tray2', 'tray3', 'atLimit', 'offline', 'retry'] as const) {
        const props = geometryProps(scenario, messages, withOpener)
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ ...props, attachmentRemoveTemplate: messages.shell.composer.attach.remove })}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const measured = await page.evaluate(() => {
          const pill = document.querySelector<HTMLElement>('[data-composer-input-row]')!
          const bounds = pill.getBoundingClientRect()
          const input = pill.querySelector<HTMLTextAreaElement>('textarea')
          const canvas = document.createElement('canvas').getContext('2d')!
          if (input) { canvas.font = getComputedStyle(input).font; canvas.letterSpacing = getComputedStyle(input).letterSpacing }
          return {
            pill: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, height: bounds.height },
            documentWidth: document.documentElement.scrollWidth,
            clipboardAvailable: 'clipboard' in navigator && typeof navigator.clipboard.readText === 'function',
            menuItems: JSON.parse(pill.querySelector('[data-composer-menu-items]')?.getAttribute('data-composer-menu-items') ?? '[]'),
            input: input ? { width: input.clientWidth, height: input.clientHeight, scrollHeight: input.scrollHeight,
              left: input.getBoundingClientRect().left, right: input.getBoundingClientRect().right,
              top: input.getBoundingClientRect().top, bottom: input.getBoundingClientRect().bottom,
              contentWidth: input.clientWidth - parseFloat(getComputedStyle(input).paddingInlineStart) - parseFloat(getComputedStyle(input).paddingInlineEnd),
              maximumHeight: parseFloat(getComputedStyle(input).maxHeight), placeholderWidth: canvas.measureText(input.placeholder).width } : null,
            controls: [...pill.querySelectorAll('button')].map((button) => {
              const rectangle = button.getBoundingClientRect()
              return { name: button.getAttribute('aria-label')!, left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom, width: rectangle.width, height: rectangle.height }
            }),
          }
        })
        assertPillGeometry(measured, { width, fontScale, withOpener, scenario, messages })

      }
    } finally { await page.close() }
  }, 30_000)

  it.each([412, 1280].flatMap((width) => (['dark', 'light'] as const).flatMap((mode) =>
    (['idle', 'sending', 'offline', 'atLimit', 'transcribing', 'recording'] as const).map((state) => ({ width, mode, state })))))(
    'paints hover only on enabled menu and stop controls while $state at $width in $mode', async ({ width, mode, state }) => {
      const statuses = { idle: { state: 'idle' }, sending: { state: 'sending' }, recording: { state: 'recording' }, transcribing: { state: 'transcribing' }, offline: { state: 'offline', limitReason: en.shell.composer.offline.reason }, atLimit: { state: 'atLimit', limitReason: en.shell.composer.limit.reason } } as const
      const { container } = render(<Composer {...statuses[state]} value="" suggestions={[]} words={en.shell.composer}
        onChangeValue={vi.fn()} onSend={vi.fn()} onVoice={vi.fn()} voiceWords={en.shell.composer.voice}
        onAttachFile={vi.fn()} onAttachImage={vi.fn()} attachWords={{ ...en.shell.composer.attach, remove: (name) => name }} />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<style>${stylesheet}:root{${theme}}[data-composer-controls] button{--test-hover:0}[data-composer-controls] button:hover{--test-hover:1}</style>${container.innerHTML}`)
        const control = page.locator('[data-composer-controls] button')
        expect(await control.count()).toBe(1)
        const restingFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
        const bounds = (await control.boundingBox())!
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 4)
        await page.waitForTimeout(300)
        expect(await control.evaluate((element) => getComputedStyle(element).getPropertyValue('--test-hover').trim())).toBe('1')
        const hoveredFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
        if (await control.isDisabled()) expect(hoveredFill).toBe(restingFill)
        else expect(hoveredFill).not.toBe(restingFill)
        if (state === 'recording') {
          await page.keyboard.press('Shift')
          await control.focus()
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          expect(await control.evaluate((element) => getComputedStyle(element).outlineColor)).toBe('rgb(196, 83, 15)')
        }
      } finally { await page.close() }
    },
  )

  it.each([320, 360, 384, 412].flatMap((width) => [en, ptBR].map((messages) => ({ width, messages }))))('keeps habit detail chips whole in one scroll row at $width', async ({ width, messages }) => {
    const chips = buildComposerChips({ surface: 'habitDetail', status: 'success', habits: [], totalHabitCount: 1,
      detailHabit: { title: 'Reading', checklistItems: [] }, profile: createMockProfile() })
    const labels = messages.shell.composer.chips.habitDetail
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('habitDetail.', '') as keyof typeof labels], onSelect: vi.fn() })))
    const { container } = render(<Composer state="idle" value="" suggestions={suggestions} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel })
      const tops = []
      for (const control of await strip.getByRole('button').all()) {
        await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
        const measured = await control.evaluate((element) => {
          const label = element.querySelector('span')!
          return { top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height, labelWidth: label.clientWidth, textWidth: label.scrollWidth, overflow: getComputedStyle(label).textOverflow }
        })
        tops.push(measured.top)
        expect(measured.height).toBeGreaterThanOrEqual(48)
        expect(measured.labelWidth).toBe(measured.textWidth)
        expect(measured.overflow).not.toBe('ellipsis')
      }
      expect(new Set(tops).size).toBe(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    } finally { await page.close() }
  })
})

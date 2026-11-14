import { createRef, type ReactElement } from 'react'
import { View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { createTokensV2 } from '@/lib/theme'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'
import { CalendarOrbitLine, type CalendarOrbitLineProps } from '@/app/(tabs)/calendar/_components/calendar-orbit-line'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const state = vi.hoisted((): { flag: boolean; online: boolean; locale: 'en' | 'pt-BR'; profile: Record<string, unknown> } => ({ flag: true, online: true, locale: 'en', profile: {} }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => state.flag }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: state.profile }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.online }) }))
vi.mock('react-i18next', async () => {
  const messages = { en: (await import('@orbit/shared/i18n/en.json')).default, 'pt-BR': (await import('@orbit/shared/i18n/pt-BR.json')).default }
  const { IntlMessageFormat: Format } = await import('intl-messageformat')
  const t = (key: string, values?: Record<string, string | number>) => {
    const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages[state.locale])
    return typeof message === 'string' ? String(new Format(message, state.locale).format(values)) : key
  }
  return { useTranslation: () => ({ t, i18n: { language: state.locale } }) }
})


const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

const TODAY = '2026-11-13'
const tokens = createTokensV2('purple', 'dark')

function entry(status: CalendarDayEntry['status'], habitId: string): CalendarDayEntry {
  return { habitId, title: habitId, emoji: null, status, isOneTime: false, isRecurring: true, dueTime: null } as unknown as CalendarDayEntry
}

function props(overrides: Partial<CalendarOrbitLineProps> = {}): CalendarOrbitLineProps {
  return {
    view: 'month', currentMonth: new Date(2026, 10, 1), monthDisplayState: 'ready', selectedDay: TODAY, todayKey: TODAY,
    displayMonthDayMap: new Map([[TODAY, [entry('completed', 'a'), entry('upcoming', 'b'), entry('upcoming', 'c')]], ['2026-11-12', []]]),
    displayRangeDayMap: new Map(), rangeLoading: false,
    weekStart: new Date(2026, 10, 9), weekEnd: new Date(2026, 10, 15), agendaStart: new Date(2026, 10, 13), agendaEnd: new Date(2026, 10, 19),
    rangeModel: { start: new Date(2026, 9, 15), end: new Date(2026, 10, 13) }, selectedDayRef: createRef<View>(), tokens, ...overrides,
  }
}

function render(element: ReactElement): { root: TestNode; update(next: ReactElement): void } {
  let tree: { root: TestNode; update(next: ReactElement): void } | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

function host(root: TestNode, testID: string): TestNode | undefined {
  return root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]
}

beforeEach(() => {
  state.flag = true
  state.online = true
  state.locale = 'en'
  state.profile = { ...createMockProfile(), aiMessagesUsed: 0, aiMessagesLimit: 50, hasProAccess: true }
  useUIStore.getState().setAstraConversationOpen(false)
  useChatStore.getState().setDraft('')
})
afterEach(() => { reanimatedTestState.reducedMotion = false })

describe('the Calendário Orbit line on Android', () => {
  it('is absent with the guided flows off, so Calendário keeps its current form', () => {
    state.flag = false
    const tree = render(<CalendarOrbitLine {...props()} />)
    expect(host(tree.root, 'calendar-orbit-line')).toBeUndefined()
  })

  it.each([
    ['en', 'The 13th: 1 of 3 done.'],
    ['pt-BR', 'Dia 13: 1 de 3 feitos.'],
  ] as const)('states the selected day with Orbit at 48 in %s', (locale, sentence) => {
    state.locale = locale
    const tree = render(<CalendarOrbitLine {...props()} />)
    const row = host(tree.root, 'today-astra-slot')!
    expect(row.props.accessibilityLabel).toBe(sentence)
    expect(row.props.accessibilityState).toMatchObject({ disabled: false })
    const mascots = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
    expect(mascots).toHaveLength(1)
    expect(mascots[0]!.props.width).toBe(48)
  })

  it('changes the sentence on a day select', () => {
    const tree = render(<CalendarOrbitLine {...props()} />)
    TestRenderer.act(() => tree.update(<CalendarOrbitLine {...props({ selectedDay: '2026-11-12' })} />))
    expect(host(tree.root, 'today-astra-slot')!.props.accessibilityLabel).toBe('Nothing planned that day.')
  })

  it('states the future month and the empty month in the line', () => {
    const tree = render(<CalendarOrbitLine {...props({ monthDisplayState: 'future', currentMonth: new Date(2027, 0, 1), selectedDay: '2027-01-01' })} />)
    expect(host(tree.root, 'today-astra-slot')!.props.accessibilityLabel).toBe('This month has not arrived yet.')
    TestRenderer.act(() => tree.update(<CalendarOrbitLine {...props({ monthDisplayState: 'empty' })} />))
    expect(host(tree.root, 'today-astra-slot')!.props.accessibilityLabel).toBe('Nothing planned in November.')
  })

  it('opens the conversation with the selected day offered above the composer', () => {
    const tree = render(<CalendarOrbitLine {...props()} />)
    TestRenderer.act(() => { (host(tree.root, 'today-astra-slot')!.props.onPress as () => void)() })
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().draft).toBe('Tell me about November 13 in my calendar.')
  })

  it.each([
    ['at the message limit', { aiMessagesUsed: 50, aiMessagesLimit: 50 }, true],
    ['offline', {}, false],
  ] as const)('rests Orbit and disables the row with the reason %s, while the day sentence still shows', (_case, profile, online) => {
    state.profile = { ...state.profile, ...profile }
    state.online = online
    const tree = render(<CalendarOrbitLine {...props()} />)
    const row = host(tree.root, 'today-astra-slot')!
    const reason = online ? String(new IntlMessageFormat(en.shell.composer.limit.reason, 'en').format({ allowance: 50 })) : en.shell.composer.offline.reason
    expect(row.props.accessibilityLabel).toBe('The 13th: 1 of 3 done.')
    expect(row.props.accessibilityState).toMatchObject({ disabled: true })
    expect(row.props.accessibilityHint).toBe(reason)
    expect(host(tree.root, 'calendar-orbit-line-reason')!.props.children).toBe(reason)
    expect(host(tree.root, 'orbit-mascot')!.props['data-orbit-state']).toBe('descansando')
  })

  it('shows the skeleton on the same line while the month loads, and no spinner', () => {
    const tree = render(<CalendarOrbitLine {...props({ monthDisplayState: 'loading' })} />)
    expect(host(tree.root, 'summary-skeleton')).toBeDefined()
    expect(tree.root.findAll((node) => node.type === 'ActivityIndicator')).toHaveLength(0)
    expect(host(tree.root, 'today-astra-slot')!.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
  })

  it('closes up in the week view when the selected day is outside the shown week', () => {
    const tree = render(<CalendarOrbitLine {...props({ view: 'week', displayRangeDayMap: new Map([[TODAY, [entry('completed', 'a')]]]) })} />)
    expect(host(tree.root, 'today-astra-slot')!.props.accessibilityLabel).toBe('The 13th: all done.')
    TestRenderer.act(() => tree.update(<CalendarOrbitLine {...props({ view: 'week', weekStart: new Date(2026, 10, 16), weekEnd: new Date(2026, 10, 22) })} />))
    expect(host(tree.root, 'calendar-orbit-line')).toBeUndefined()
  })

  it('gives the mascot a new turn key on a page turn, and none under reduced motion', () => {
    const tree = render(<CalendarOrbitLine {...props()} />)
    TestRenderer.act(() => tree.update(<CalendarOrbitLine {...props({ currentMonth: new Date(2026, 11, 1), selectedDay: '2026-12-01', displayMonthDayMap: new Map() })} />))
    const mascot = tree.root.findAll((node) => typeof node.type === 'function' && (node.type as { name?: string }).name === 'OrbitMascot')[0]!
    expect(mascot.props.turnKey).toBe(1)
    reanimatedTestState.reducedMotion = true
    const still = render(<CalendarOrbitLine {...props()} />)
    TestRenderer.act(() => still.update(<CalendarOrbitLine {...props({ currentMonth: new Date(2026, 11, 1), selectedDay: '2026-12-01', displayMonthDayMap: new Map() })} />))
    expect(host(still.root, 'orbit-mascot')!.props['data-orbit-turn']).toBe('rest')
  })
})

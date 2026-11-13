import type { ReactElement, ReactNode } from 'react'
import { Animated, Pressable, View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionDurations, motionSprings } from '@orbit/shared/theme'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { withSpringCalls, withTimingCalls } from '@/test-mocks/react-native-reanimated'
import { DayCell } from '@/components/dates/day-cell'
import { CheckRow } from '@/components/ui/check-row'
import { CalendarViewRouter } from '@/app/(tabs)/calendar/_components/calendar-view-router'
import type { CalendarScreenState } from '@/app/(tabs)/calendar/_components/use-calendar-screen-state'
import { createTokensV2 } from '@/lib/theme'

const state = vi.hoisted(() => ({ reducedMotion: false, guided: true }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => state.reducedMotion }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => state.guided }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/app/(tabs)/calendar/_components/calendar-grid', () => ({ CalendarGrid: () => <View testID="grid" /> }))
vi.mock('@/app/(tabs)/calendar/_components/calendar-day-detail', () => ({ CalendarDayDetail: ({ selectedDate }: { selectedDate: string }) => <View testID={`day-card-${selectedDate}`} /> }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: ({ onClick }: { children: ReactNode; onClick: () => void }) => <Pressable testID="pill" onPress={onClick} /> }))


const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
type Tree = { root: TestNode; update(next: ReactElement): void }

function render(element: ReactElement): Tree {
  let tree: Tree | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

const byTestId = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID)
const words: DayCellWords = { none: 'none', partial: 'partial', full: 'full', notScheduled: 'rest', of: 'of', today: 'today', readOnly: 'read only' }
const circumference = Math.PI * 32

beforeEach(() => {
  state.reducedMotion = false
  state.guided = true
  withSpringCalls.length = 0
  withTimingCalls.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('the cell arc after a log on Android', () => {
  it('draws done over scheduled with the dash offset and sweeps on the slow duration', () => {
    const timing = vi.spyOn(Animated, 'timing')
    const tree = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={1} />)
    const offset = byTestId(tree, 'day-arc')[0]!.props.strokeDashoffset as { value: number }
    expect(offset.value).toBeCloseTo(circumference * (1 - 1 / 3))
    expect(timing).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.update(<DayCell day={13} label="November 13" words={words} scheduled={3} done={2} />))
    expect(timing).toHaveBeenCalledWith(offset, expect.objectContaining({ toValue: circumference * (1 - 2 / 3), duration: motionDurations.slow }))
  })

  it('draws the new share at once under reduced motion', () => {
    state.reducedMotion = true
    const timing = vi.spyOn(Animated, 'timing')
    const tree = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={1} />)
    TestRenderer.act(() => tree.update(<DayCell day={13} label="November 13" words={words} scheduled={3} done={2} />))
    expect(timing).not.toHaveBeenCalled()
    expect((byTestId(tree, 'day-arc')[0]!.props.strokeDashoffset as { value: number }).value).toBeCloseTo(circumference * (1 - 2 / 3))
  })

  it('turns a full day into the neutral disc with no happy Orbit', () => {
    const tree = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={2} />)
    TestRenderer.act(() => tree.update(<DayCell day={13} label="November 13" words={words} scheduled={3} done={3} />))
    expect(byTestId(tree, 'day-cell-full').length).toBeGreaterThan(0)
    expect(byTestId(tree, 'day-arc')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props['data-orbit-state'] === 'feliz')).toHaveLength(0)
  })
})

describe('the check of the day card on Android', () => {
  const row = (checked: boolean) => <CheckRow variant="calendar-day" textMode="personal" label="Read" checked={checked} onChange={vi.fn()} onOpenLabel={vi.fn()} />

  it('pops on a log on the completion spring and never on the first render', () => {
    const tree = render(row(false))
    expect(withSpringCalls).toHaveLength(0)
    TestRenderer.act(() => tree.update(row(true)))
    expect(withSpringCalls).toEqual([expect.objectContaining({ value: 1, config: expect.objectContaining({ stiffness: motionSprings.completion.stiffness }) })])
  })

  it('stays still under reduced motion', () => {
    state.reducedMotion = true
    const tree = render(row(false))
    TestRenderer.act(() => tree.update(row(true)))
    expect(withSpringCalls).toHaveLength(0)
  })
})

function monthState(overrides: Partial<CalendarScreenState>): CalendarScreenState {
  const push = vi.fn()
  return {
    view: 'month', currentMonth: new Date(2026, 10, 1), selectedDay: '2026-11-13', todayKey: '2026-11-13', router: { push }, openImport: vi.fn(), tokens: createTokensV2('purple', 'dark'),
    selectedDayRef: { current: null }, calendarGridRef: { current: null }, displayTime: (time: string) => time, showEventSource: false, calendarEventsState: 'idle', refetchCalendarEvents: vi.fn(),
    isLoading: false, swipeGesture: undefined, selectMonthDay: vi.fn(), gridDays: [], weekdayHeaders: [], monthDisplayState: 'ready', formattedSelectedDate: '', monthDayEntries: [],
    selectedCalendarEvents: [], completedCount: 0, selectedDayLoggable: true, pendingEntryStates: new Map(), changeSelectedEntry: vi.fn(), monthSlide: null, openHabitCreation: vi.fn(), ...overrides,
  } as unknown as CalendarScreenState
}

describe('the month view with the guided flows on, on Android', () => {
  it('cross-fades the day card on the base duration when the person selects a day', () => {
    const tree = render(<CalendarViewRouter state={monthState({})} />)
    expect(withTimingCalls).toHaveLength(0)
    TestRenderer.act(() => tree.update(<CalendarViewRouter state={monthState({ selectedDay: '2026-11-12' })} />))
    expect(withTimingCalls).toEqual([expect.objectContaining({ value: 1, config: expect.objectContaining({ duration: motionDurations.base }) })])
  })

  it('shows the day card at once under reduced motion', () => {
    state.reducedMotion = true
    const tree = render(<CalendarViewRouter state={monthState({})} />)
    TestRenderer.act(() => tree.update(<CalendarViewRouter state={monthState({ selectedDay: '2026-11-12' })} />))
    expect(withTimingCalls).toHaveLength(0)
  })

  it('keeps the create action of an empty month and opens the create flow on the selected day', () => {
    const view = monthState({ monthDisplayState: 'empty', selectedDay: '2026-11-01' })
    const tree = render(<CalendarViewRouter state={view} />)
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'calendar.emptyMonth')).toHaveLength(0)
    const create = byTestId(tree, 'pill').find((node) => typeof node.type === 'string')!
    TestRenderer.act(() => (create.props.onPress as () => void)())
    expect((view.router.push as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/habits/new?date=2026-11-01&from=%2Fcalendar')
  })

  it('moves the future month sentence into the line and offers no create action', () => {
    const tree = render(<CalendarViewRouter state={monthState({ monthDisplayState: 'future' })} />)
    expect(byTestId(tree, 'calendar-month-empty')).toHaveLength(0)
    expect(byTestId(tree, 'pill')).toHaveLength(0)
  })

  it('keeps the current month feedback with the guided flows off', () => {
    state.guided = false
    const view = monthState({ monthDisplayState: 'empty' })
    const tree = render(<CalendarViewRouter state={view} />)
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'calendar.emptyMonth').length).toBeGreaterThan(0)
    TestRenderer.act(() => (byTestId(tree, 'pill').find((node) => typeof node.type === 'string')!.props.onPress as () => void)())
    expect(view.openHabitCreation).toHaveBeenCalledTimes(1)
  })
})

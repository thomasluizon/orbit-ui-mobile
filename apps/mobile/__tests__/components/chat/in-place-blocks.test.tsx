import React from 'react'
import { act, create } from 'react-test-renderer'
import { Pressable, View } from 'react-native'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { renderedText } from '../../support/react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inPlaceDayFixture, inPlaceCalendarFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { createMockHabit, createMockGoal } from '@orbit/shared/__tests__/factories'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { MetricsCard } from '@/components/chat/metrics-card'
import { useUIStore } from '@/stores/ui-store'
import { StreakCard } from '@/components/chat/streak-card'

const state = vi.hoisted(() => ({
  push: vi.fn(), mutate: vi.fn(), refetch: vi.fn(), pro: true,
  disconnected: false,
  query: { isPending: false, isError: false, isRefetchError: false },
  habits: new Map(), goals: new Map(),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: state.pro, timeZone: 'UTC', uses24HourClock: true } }) }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ ...state.query, data: { habitsById: state.habits }, refetch: state.refetch }),
  useLogHabit: () => ({ mutate: state.mutate }),
  useHabitMetrics: () => ({ ...state.query, refetch: state.refetch }),
}))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ ...state.query, data: { goalsById: state.goals }, refetch: state.refetch }) }))
vi.mock('@/hooks/use-recap', () => ({ useProgressRecap: () => ({ ...state.query, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ ...state.query, data: state.disconnected ? { status: 'not-connected', events: [] } : undefined, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [{ id: 'one' }, { id: 'two' }] }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({
  streakQuery: { ...state.query, refetch: state.refetch },
  streakInfo: { currentStreak: 3, longestStreak: 9, lastActiveDate: '2026-10-17', isFrozenToday: false, recentFreezeDates: [] },
  streakFreezesAccumulated: 2, maxStreakFreezesAccumulated: 3, freezesUsedThisMonth: 1, daysUntilNextFreeze: 4,
}) }))
function render(element: React.ReactElement) {
  let tree!: GeometryTree
  void act(() => { tree = create(element) as GeometryTree })
  return tree
}
function press(tree: GeometryTree, name: string) {
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function' && (node.props.accessibilityLabel === name || renderedText(node.props.children).includes(name)))[0]!
  void act(() => { (button.props.onPress as () => void)() })
}
beforeEach(() => {
  vi.clearAllMocks()
  state.pro = true
  state.disconnected = false
  useUIStore.getState().setAstraConversationOpen(true)
  state.query = { isPending: false, isError: false, isRefetchError: false }
  state.habits.clear(); state.goals.clear()
  for (const item of inPlaceDayFixture.rows ?? []) state.habits.set(item.id, createMockHabit({ id: item.id, title: item.title }))
})

describe('Astra blocks act on app state', () => {
  it('caps the rows, blocks a double tap and shows a later log from Hoje', () => {
    const tree = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    const name = 'chat.habitList.log:{"name":"Habit 1"}'
    expect(tree.root.findAll(node => node.type === Pressable && String(node.props.accessibilityLabel).startsWith('chat.habitList.open'))).toHaveLength(20)
    expect(renderedText(tree.toJSON())).toContain('chat.daySummary.rowCount:{"shown":20,"total":25}')
    const log = tree.root.findAll(node => node.props.accessibilityLabel === name && typeof node.props.onPress === 'function')[0]!
    void act(() => { (log.props.onPress as () => void)(); (log.props.onPress as () => void)() })
    expect(state.mutate).toHaveBeenCalledTimes(1)
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'habit-1', intent: 'log' }), expect.any(Object))
    state.habits.set('habit-1', createMockHabit({ id: 'habit-1', title: 'Habit 1', isLoggedInRange: true }))
    void act(() => { tree.update(<DaySummaryCard daySummary={inPlaceDayFixture} />) })
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'chat.habitList.unlog:{"name":"Habit 1"}').length).toBeGreaterThan(0)
    void act(() => tree.unmount())
  })

  it('renders EventRow with its source and opens exactly that event', () => {
    const tree = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
    expect(renderedText(tree.toJSON())).toContain('Work')
    press(tree, 'chat.calendarCard.makeHabit:{"title":"Walk with the team"}')
    expect(state.push).toHaveBeenCalledWith({ pathname: '/calendar', params: { import: '1', event: 'event /one' } })
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    void act(() => tree.unmount())
  })

  it('withholds the calendar block for a free account', () => {
    state.pro = false
    const tree = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
    expect(tree.toJSON()).toBeNull()
    void act(() => tree.unmount())
  })

  it('exposes live goal progress and its source', () => {
    state.goals.set('goal-1', createMockGoal({ id: 'goal-1', title: 'Move', currentValue: 6, targetValue: 10, isProgressDerived: true, linkedHabits: [{ id: 'habit-1', title: 'Walk' }] }))
    const tree = render(<GoalListCard goalList={{ items: [{ id: 'goal-1', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />)
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0]!.props.accessibilityValue).toEqual(expect.objectContaining({ now: 60 }))
    expect(renderedText(tree.toJSON())).toContain('goals.linkedHabits: Walk')
    void act(() => tree.unmount())
  })
})

it.each([
  [{ isPending: true, isError: false, isRefetchError: false }, 'loading'],
  [{ isPending: false, isError: true, isRefetchError: false }, 'partiallyFailed'],
  [{ isPending: false, isError: true, isRefetchError: true }, 'stale'],
] as const)('shares query states across all five blocks: %s', (query, expected) => {
  state.query = { ...query }
  state.goals.set('goal-1', createMockGoal({ id: 'goal-1' }))
  const tree = render(<>
    <DaySummaryCard daySummary={inPlaceDayFixture} />
    <CalendarCard calendarCard={inPlaceCalendarFixture} />
    <GoalListCard goalList={{ items: [{ id: 'goal-1', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />
    <StreakCard streakCard={{ currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />
    <MetricsCard metricsCard={{ period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} />
  </>)
  expect(tree.root.findAll(node => node.type === View && node.props.testID === `block-frame-${expected}`)).toHaveLength(5)
  void act(() => tree.unmount())
})

it('keeps the freeze bank read-only and routes its action to Sequencia', () => {
  const tree = render(<StreakCard streakCard={{ currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />)
  const bank = tree.root.findAll(node => node.props.testID === 'freeze-bank')[0]!
  expect(bank.findAll(node => node.type === Pressable)).toHaveLength(1)
  expect(bank.findAll(node => node.type === Pressable)[0]!.props.accessibilityLabel).toBe('progressScreen.streak.legend')
  press(tree, 'chat.streakCard.open')
  expect(state.push).toHaveBeenCalledWith('/progress/streak')
  void act(() => tree.unmount())
})

it('keeps cached habits loggable after an offline refetch error', () => {
  state.query = { isPending: false, isError: true, isRefetchError: true }
  const tree = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
  const log = tree.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === 'chat.habitList.log:{"name":"Habit 1"}')[0]!
  expect(log.props.disabled).toBe(false)
  press(tree, 'chat.habitList.log:{"name":"Habit 1"}')
  expect(state.mutate).toHaveBeenCalledTimes(1)
  void act(() => tree.unmount())
})

it('offers calendar reconnection and disables import after disconnection', () => {
  state.disconnected = true
  const tree = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
  expect(tree.root.findAll(node => node.type === View && node.props.testID === 'block-frame-partiallyFailed')).toHaveLength(1)
  expect(renderedText(tree.toJSON())).toContain('chat.calendarCard.syncState.ReconnectRequired')
  const importButton = tree.root.findAll(node => node.type === Pressable && String(node.props.accessibilityLabel).startsWith('chat.calendarCard.makeHabit'))[0]!
  expect(importButton.props.disabled).toBe(true)
  press(tree, 'chat.calendarCard.open')
  expect(state.push).toHaveBeenCalledWith('/calendar?import=1')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  void act(() => tree.unmount())
})

it('puts a payload sync error in the calendar actions area', () => {
  const tree = render(<CalendarCard calendarCard={{ ...inPlaceCalendarFixture, sync: { enabled: true, status: 'TransientError', lastSyncedAt: null } }} />)
  const actions = tree.root.findAll(node => node.type === View && node.props.testID === 'block-frame-action-row')[0]!
  expect(actions.findAll(node => node.props.accessibilityRole === 'alert').length).toBeGreaterThan(0)
  expect(renderedText(actions.props.children)).toContain('chat.calendarCard.syncState.TransientError')
  void act(() => tree.unmount())
})


it.each(['child', 'bad'] as const)('keeps a completed %s row outside the parent completion total', (kind) => {
  const parent = inPlaceDayFixture.rows![0]!
  const extra = { ...parent, id: 'extra', title: 'Extra', depth: kind === 'child' ? 1 : 0, isBadHabit: kind === 'bad' }
  const snapshot = { ...inPlaceDayFixture, due: 1, done: 0, rows: [parent, extra] }
  state.habits.set(extra.id, createMockHabit({ id: extra.id, title: extra.title, isBadHabit: extra.isBadHabit, isLoggedInRange: true }))
  const tree = render(<DaySummaryCard daySummary={snapshot} />)
  expect(renderedText(tree.toJSON())).toContain('chat.daySummary.doneOfDue:{"done":0,"due":1}')
  expect(tree.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0]!.props.accessibilityValue).toEqual(expect.objectContaining({ now: 0 }))
  void act(() => tree.unmount())
})

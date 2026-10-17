import React from 'react'
import { act, create } from 'react-test-renderer'
import { Pressable } from 'react-native'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { renderedText } from '../../support/react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inPlaceDayFixture, inPlaceCalendarFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { createMockHabit, createMockGoal } from '@orbit/shared/__tests__/factories'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { MetricsCard } from '@/components/chat/metrics-card'
import { StreakCard } from '@/components/chat/streak-card'

const state = vi.hoisted(() => ({
  push: vi.fn(), mutate: vi.fn(), refetch: vi.fn(), pro: true,
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
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ ...state.query, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ ...state.query, refetch: state.refetch }) }))
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
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function' && (node.props.accessibilityLabel === name || renderedText(node.props.children) === name))[0]!
  void act(() => { (button.props.onPress as () => void)() })
}
beforeEach(() => {
  vi.clearAllMocks()
  state.pro = true
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

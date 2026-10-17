import { fireEvent, render, screen } from '@testing-library/react'
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: state.pro, timeZone: 'UTC', uses24HourClock: true } }) }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ ...state.query, data: { habitsById: state.habits }, refetch: state.refetch }),
  useLogHabit: () => ({ mutate: state.mutate }),
  useHabitMetrics: () => ({ ...state.query, refetch: state.refetch }),
}))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ ...state.query, data: { goalsById: state.goals }, refetch: state.refetch }) }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ ...state.query, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ ...state.query, data: state.disconnected ? { status: 'not-connected', events: [] } : undefined, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [{ id: 'one' }, { id: 'two' }] }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({
  streakQuery: { ...state.query, refetch: state.refetch },
  streakInfo: { currentStreak: 3, longestStreak: 9, lastActiveDate: '2026-10-17', isFrozenToday: false, recentFreezeDates: [] },
  streakFreezesAccumulated: 2, maxStreakFreezesAccumulated: 3, freezesUsedThisMonth: 1, daysUntilNextFreeze: 4,
}) }))
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
  it('shows twenty rows, reports all rows and locks a double tap until the log settles', () => {
    const view = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    const log = screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' })
    expect(screen.getAllByRole('button', { name: /chat.habitList.open/ })).toHaveLength(20)
    expect(screen.queryByRole('button', { name: /Habit 21/ })).not.toBeInTheDocument()
    expect(screen.getByText('chat.daySummary.rowCount:{"shown":20,"total":25}')).toBeInTheDocument()
    fireEvent.click(log); fireEvent.click(log)
    expect(state.mutate).toHaveBeenCalledTimes(1)
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'habit-1', intent: 'log' }), expect.any(Object))
    expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'acting')
    state.habits.set('habit-1', createMockHabit({ id: 'habit-1', title: 'Habit 1', isLoggedInRange: true }))
    view.rerender(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    expect(screen.getByRole('button', { name: 'chat.habitList.unlog:{"name":"Habit 1"}' })).toBeInTheDocument()
  })

  it('updates a row after a log on Hoje without changing the reply', () => {
    const view = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    state.habits.set('habit-1', createMockHabit({ id: 'habit-1', title: 'Habit 1', isLoggedInRange: true }))
    view.rerender(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    expect(screen.getByRole('button', { name: 'chat.habitList.unlog:{"name":"Habit 1"}' })).toBeInTheDocument()
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('shows an event source and opens the calendar sheet with its encoded identity', () => {
    render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
    expect(screen.getByRole('group', { name: /Walk with the team, Work/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.makeHabit:{"title":"Walk with the team"}' }))
    expect(state.push).toHaveBeenCalledWith('/calendar?import=1&event=event%20%2Fone')
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('withholds calendar content for a free account', () => {
    state.pro = false
    const view = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
    expect(view.container).toBeEmptyDOMElement()
  })

  it('exposes live goal progress and names its linked source', () => {
    state.goals.set('goal-1', createMockGoal({ id: 'goal-1', title: 'Move', currentValue: 6, targetValue: 10, isProgressDerived: true, linkedHabits: [{ id: 'habit-1', title: 'Walk' }] }))
    render(<GoalListCard goalList={{ items: [{ id: 'goal-1', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    expect(screen.getByRole('button', { name: 'goals.linkedHabits: Walk' })).toBeInTheDocument()
  })
})

it.each([
  [{ isPending: true, isError: false, isRefetchError: false }, 'loading'],
  [{ isPending: false, isError: true, isRefetchError: false }, 'partiallyFailed'],
  [{ isPending: false, isError: true, isRefetchError: true }, 'stale'],
] as const)('shares query states across all five blocks: %s', (query, expected) => {
  state.query = { ...query }
  state.goals.set('goal-1', createMockGoal({ id: 'goal-1' }))
  const view = render(<>
    <DaySummaryCard daySummary={inPlaceDayFixture} />
    <CalendarCard calendarCard={inPlaceCalendarFixture} />
    <GoalListCard goalList={{ items: [{ id: 'goal-1', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />
    <StreakCard streakCard={{ currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />
    <MetricsCard metricsCard={{ period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} />
  </>)
  expect(view.container.querySelectorAll(`section[data-state="${expected}"]`)).toHaveLength(5)
  if (expected === 'partiallyFailed') expect(screen.getAllByRole('alert')).toHaveLength(5)
})

it('keeps the freeze bank read-only with one route to Sequencia', () => {
  const view = render(<StreakCard streakCard={{ currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />)
  const bank = view.container.querySelector('[data-component="freeze-bank"]')!
  expect(bank).toHaveTextContent('2')
  expect(bank.querySelectorAll('button')).toHaveLength(1)
  expect(bank.querySelector('button')).toHaveAttribute('aria-label', 'progressScreen.streak.legend')
  fireEvent.click(screen.getByRole('button', { name: 'chat.streakCard.open' }))
  expect(state.push).toHaveBeenCalledWith('/progress/streak')
})

it('puts at most three numerical figures beside the chart', () => {
  const view = render(<MetricsCard metricsCard={{ period: 'habit', habitId: 'habit-1', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} />)
  expect(view.container.querySelectorAll('[data-state="default"], [data-state="empty"]')).toHaveLength(3)
})

it('keeps cached habits loggable after an offline refetch error', () => {
  state.query = { isPending: false, isError: true, isRefetchError: true }
  render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
  const log = screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' })
  expect(log).toBeEnabled()
  fireEvent.click(log)
  expect(state.mutate).toHaveBeenCalledTimes(1)
})

it('offers calendar reconnection and disables import after disconnection', () => {
  state.disconnected = true
  const view = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
  expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'partiallyFailed')
  expect(screen.getByRole('alert')).toHaveTextContent('chat.calendarCard.syncState.ReconnectRequired')
  expect(screen.getByRole('button', { name: /chat.calendarCard.makeHabit/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.open' }))
  expect(state.push).toHaveBeenCalledWith('/calendar?import=1')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('puts a payload sync error in the calendar actions area', () => {
  const view = render(<CalendarCard calendarCard={{ ...inPlaceCalendarFixture, sync: { enabled: true, status: 'TransientError', lastSyncedAt: null } }} />)
  expect(screen.getByRole('alert')).toHaveTextContent('chat.calendarCard.syncState.TransientError')
  expect(view.container.querySelector('[data-action-row]')).toContainElement(screen.getByRole('alert'))
})

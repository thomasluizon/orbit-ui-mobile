import { fireEvent, render, screen } from '@testing-library/react'
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
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ ...state.query, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [{ id: 'one' }, { id: 'two' }] }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({
  streakQuery: { ...state.query, refetch: state.refetch },
  streakInfo: { currentStreak: 3, longestStreak: 9, lastActiveDate: '2026-10-17', isFrozenToday: false, recentFreezeDates: [] },
  streakFreezesAccumulated: 2, maxStreakFreezesAccumulated: 3, freezesUsedThisMonth: 1, daysUntilNextFreeze: 4,
}) }))
beforeEach(() => {
  vi.clearAllMocks()
  state.pro = true
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
    expect(screen.getByRole('img', { name: /Walk with the team, Work/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.makeHabit:{"title":"Walk with the team"}' }))
    expect(state.push).toHaveBeenCalledWith('/calendar?import=1&event=event%20%2Fone')
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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const {
  useHabitsMock,
  computeDayProgressMock,
  emptyHabitsById,
  useProfileMock,
  useGamificationProfileMock,
} = vi.hoisted(() => ({
  useHabitsMock: vi.fn(),
  computeDayProgressMock: vi.fn(),
  emptyHabitsById: new Map<string, unknown>(),
  useProfileMock: vi.fn(),
  useGamificationProfileMock: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@orbit/shared/utils', () => ({
  computeDayProgress: computeDayProgressMock,
  formatAPIDate: () => '2026-06-28',
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: useHabitsMock,
  EMPTY_HABITS_BY_ID: emptyHabitsById,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: useProfileMock,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: useGamificationProfileMock,
}))

import { TodayRail } from '@/components/shell/today-rail'

const pendingQuery = () => ({
  data: undefined,
  isPending: true,
  isError: false,
  isSuccess: false,
  refetch: vi.fn(),
})

const loadedHabits = (done: number, total: number) => {
  const habitsById = new Map()
  useHabitsMock.mockReturnValue({
    data: { habitsById },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  })
  computeDayProgressMock.mockReturnValue({ done, total })
  return habitsById
}

describe('TodayRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHabitsMock.mockReturnValue(pendingQuery())
    computeDayProgressMock.mockReturnValue({ done: 0, total: 0 })
    useProfileMock.mockReturnValue({ profile: { canViewGamification: false } })
    useGamificationProfileMock.mockReturnValue({ profile: null, xpProgress: 0 })
  })

  it('renders the progress orbit with the computed done and total', () => {
    loadedHabits(3, 7)

    render(<TodayRail />)

    expect(
      screen.getByRole('img', { name: 'rail.progressLabel({"done":3,"total":7})' }),
    ).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('/7')).toBeInTheDocument()
    expect(screen.getByText('rail.todayProgress')).toBeInTheDocument()
  })

  it('computes progress from the day-query habits and the current date', () => {
    const habitsById = loadedHabits(0, 0)

    render(<TodayRail />)

    expect(computeDayProgressMock).toHaveBeenCalledWith(habitsById, '2026-06-28')
  })

  it('falls back to the empty habit map when the query has no data', () => {
    useHabitsMock.mockReturnValue(pendingQuery())

    render(<TodayRail />)

    expect(computeDayProgressMock).toHaveBeenCalledWith(emptyHabitsById, '2026-06-28')
  })

  it('shows no orbit numerals while the habits query is pending', () => {
    useHabitsMock.mockReturnValue(pendingQuery())

    render(<TodayRail />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('rail.todayProgress')).not.toBeInTheDocument()
  })

  it('shows the load-failed line with a retry action when the query errors', () => {
    const refetch = vi.fn()
    useHabitsMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isSuccess: false,
      refetch,
    })

    render(<TodayRail />)

    expect(screen.getByText('rail.loadFailed')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows the satellite empty state and hides the stat stack when the loaded day has no habits', () => {
    loadedHabits(0, 0)

    render(<TodayRail />)

    expect(screen.getByText('rail.empty')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('rail.remaining')).not.toBeInTheDocument()
  })

  it('requests the current day habits including overdue', () => {
    render(<TodayRail />)

    expect(useHabitsMock).toHaveBeenCalledWith({
      dateFrom: '2026-06-28',
      dateTo: '2026-06-28',
      includeOverdue: true,
    })
  })

  it('shows remaining-today from the day progress once the query has loaded', () => {
    loadedHabits(2, 7)

    render(<TodayRail />)

    expect(screen.getByText('rail.remaining')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('does not render the stat stack before the habits query resolves', () => {
    useHabitsMock.mockReturnValue(pendingQuery())

    render(<TodayRail />)

    expect(screen.queryByText('rail.remaining')).not.toBeInTheDocument()
  })

  it('omits gamification stats when the user cannot view gamification', () => {
    loadedHabits(1, 4)
    useProfileMock.mockReturnValue({ profile: { canViewGamification: false } })
    useGamificationProfileMock.mockReturnValue({ profile: null, xpProgress: 0 })

    render(<TodayRail />)

    expect(screen.getByText('rail.remaining')).toBeInTheDocument()
    expect(screen.queryByText('streakDisplay.title')).not.toBeInTheDocument()
    expect(screen.queryByText('gamification.profileCard.tileLabel')).not.toBeInTheDocument()
  })

  it('renders streak, level with XP, and achievements when gamification is loaded', () => {
    loadedHabits(1, 4)
    useProfileMock.mockReturnValue({ profile: { canViewGamification: true } })
    useGamificationProfileMock.mockReturnValue({
      profile: { currentStreak: 26, level: 19, achievementsEarned: 12 },
      xpProgress: 64,
    })

    render(<TodayRail />)

    expect(screen.getByText('26 streakDisplay.daysSuffix')).toBeInTheDocument()
    expect(screen.getByText('gamification.profileCard.level({"level":19})')).toBeInTheDocument()
    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'gamification.profileCard.level({"level":19})' }),
    ).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByText('gamification.profileCard.tileLabel')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})

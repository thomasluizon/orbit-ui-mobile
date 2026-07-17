import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useTodayMock, useHabitTrendsMock, useProfileMock, useGamificationProfileMock } = vi.hoisted(
  () => ({
    useTodayMock: vi.fn(),
    useHabitTrendsMock: vi.fn(),
    useProfileMock: vi.fn(),
    useGamificationProfileMock: vi.fn(),
  }),
)

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/app/(app)/today-provider', () => ({
  useToday: useTodayMock,
}))

vi.mock('@/hooks/use-habit-trends', () => ({
  useHabitTrends: useHabitTrendsMock,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: useProfileMock,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: useGamificationProfileMock,
}))

import { RailConsistency } from '@/components/shell/rail-consistency'
import { RailNextAchievement } from '@/components/shell/rail-next-achievement'
import { RailAstraPill } from '@/components/shell/rail-astra-pill'

describe('RailConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTodayMock.mockReturnValue('2026-06-28')
  })

  it('renders one bar per day of the last seven days with each day rate', () => {
    useHabitTrendsMock.mockReturnValue({
      isSuccess: true,
      data: {
        activeHabitCount: 3,
        points: [
          { date: '2026-06-24', completedCount: 2, completionRate: 80 },
          { date: '2026-06-28', completedCount: 3, completionRate: 100 },
        ],
      },
    })

    const { container } = render(<RailConsistency />)

    expect(screen.getByText('rail.consistency')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'rail.consistencyAria' })).toBeInTheDocument()

    const bars = container.querySelectorAll('[data-consistency-bar]')
    expect(bars).toHaveLength(7)
    expect(bars[2]).toHaveAttribute('data-rate', '80')
    expect(bars[6]).toHaveAttribute('data-rate', '100')
    expect(bars[0]).toHaveAttribute('data-rate', '0')
  })

  it('renders nothing when there are no active habits', () => {
    useHabitTrendsMock.mockReturnValue({
      isSuccess: true,
      data: { activeHabitCount: 0, points: [] },
    })

    const { container } = render(<RailConsistency />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the trends query has not succeeded', () => {
    useHabitTrendsMock.mockReturnValue({ isSuccess: false, data: undefined })

    const { container } = render(<RailConsistency />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('RailNextAchievement', () => {
  const lockedAchievement = {
    id: 'first_habit',
    iconKey: 'first_habit',
    name: 'First',
    isEarned: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useProfileMock.mockReturnValue({ profile: { canViewGamification: true } })
  })

  it('renders the next locked achievement name, overall progress, and the count', () => {
    useGamificationProfileMock.mockReturnValue({
      profile: { achievementsEarned: 3, achievementsTotal: 10 },
      lockedAchievements: [lockedAchievement],
    })

    render(<RailNextAchievement />)

    expect(screen.getByText('rail.nextAchievement')).toBeInTheDocument()
    expect(screen.getByText('gamification.achievements.first_habit.name')).toBeInTheDocument()
    expect(screen.getByText('3/10')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'rail.nextAchievement' }),
    ).toHaveAttribute('aria-valuenow', '30')
  })

  it('renders nothing when gamification is not viewable', () => {
    useProfileMock.mockReturnValue({ profile: { canViewGamification: false } })
    useGamificationProfileMock.mockReturnValue({
      profile: { achievementsEarned: 3, achievementsTotal: 10 },
      lockedAchievements: [lockedAchievement],
    })

    const { container } = render(<RailNextAchievement />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when every achievement is already earned', () => {
    useGamificationProfileMock.mockReturnValue({
      profile: { achievementsEarned: 10, achievementsTotal: 10 },
      lockedAchievements: [],
    })

    const { container } = render(<RailNextAchievement />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('RailAstraPill', () => {
  it('links to the Astra chat route with a calm accessible label', () => {
    render(<RailAstraPill />)

    const link = screen.getByRole('link', { name: 'rail.askAstra' })
    expect(link).toHaveAttribute('href', '/chat')
  })
})

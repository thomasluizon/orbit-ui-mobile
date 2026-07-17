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
  const withProgress = (
    id: string,
    progressCurrent: number,
    progressTarget: number,
  ) => ({ id, iconKey: id, name: id, isEarned: false, progressCurrent, progressTarget })

  const oneShot = (id: string) => ({
    id,
    iconKey: id,
    name: id,
    isEarned: false,
    progressCurrent: null,
    progressTarget: null,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useProfileMock.mockReturnValue({ profile: { canViewGamification: true } })
  })

  it('picks the locked achievement closest to unlocking and shows its own progress', () => {
    useGamificationProfileMock.mockReturnValue({
      profile: {},
      lockedAchievements: [
        withProgress('squad_goals', 1, 5),
        withProgress('week_warrior', 5, 7),
        withProgress('cheerleader', 4, 25),
      ],
    })

    render(<RailNextAchievement />)

    expect(screen.getByText('rail.nextAchievement')).toBeInTheDocument()
    expect(screen.getByText('gamification.achievements.week_warrior.name')).toBeInTheDocument()
    expect(screen.getByText('5/7')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'rail.nextAchievement' }),
    ).toHaveAttribute('aria-valuenow', '71')
  })

  it('falls back to the first locked achievement with its description and no bar when none has progress', () => {
    useGamificationProfileMock.mockReturnValue({
      profile: {},
      lockedAchievements: [oneShot('perfect_day'), oneShot('show_off')],
    })

    render(<RailNextAchievement />)

    expect(screen.getByText('gamification.achievements.perfect_day.name')).toBeInTheDocument()
    expect(screen.getByText('gamification.achievements.perfect_day.description')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders nothing when gamification is not viewable', () => {
    useProfileMock.mockReturnValue({ profile: { canViewGamification: false } })
    useGamificationProfileMock.mockReturnValue({
      profile: {},
      lockedAchievements: [withProgress('week_warrior', 5, 7)],
    })

    const { container } = render(<RailNextAchievement />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when every achievement is already earned', () => {
    useGamificationProfileMock.mockReturnValue({
      profile: {},
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

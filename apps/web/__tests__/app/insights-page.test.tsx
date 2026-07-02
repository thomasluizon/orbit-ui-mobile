import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

let mockHasProAccess = true
let mockProfileLoading = false

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfileLoading ? undefined : { hasProAccess: mockHasProAccess },
    isLoading: mockProfileLoading,
  }),
}))

vi.mock('@/hooks/use-habit-trends', () => ({
  useHabitTrends: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-xp-history', () => ({
  useXpHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-streak-history', () => ({
  useStreakHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({ data: { allGoals: [] }, isLoading: false }),
}))
vi.mock('@/hooks/use-goal-progress-history', () => ({
  useGoalProgressHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarRange: () => ({
    dayMap: new Map(),
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    profile: null,
    earnedAchievements: [],
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: undefined, isLoading: false, isError: false }),
}))

import InsightsPage from '@/app/(app)/insights/page'

describe('InsightsPage', () => {
  beforeEach(() => {
    mockHasProAccess = true
    mockProfileLoading = false
  })

  it('renders the title and the four range presets', () => {
    render(<InsightsPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'insights.title' }),
    ).toBeInTheDocument()

    for (const label of [
      'insights.rangeWeek',
      'insights.rangeMonth',
      'insights.rangeQuarter',
      'insights.rangeYear',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('renders all seven section headings', () => {
    render(<InsightsPage />)

    const headings = [
      'insights.sections.completionTrends',
      'insights.sections.xpOverTime',
      'insights.sections.streakHistory',
      'insights.sections.goalProgress',
      'insights.sections.monthlyHeatmap',
      'insights.sections.achievementsTimeline',
      'insights.sections.multiHabitComparison',
    ]

    for (const heading of headings) {
      expect(
        screen.getByRole('heading', { level: 2, name: heading }),
      ).toBeInTheDocument()
    }
  })

  it('marks the default preset as the active one', () => {
    render(<InsightsPage />)

    expect(screen.getByRole('button', { name: 'insights.rangeMonth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'insights.rangeWeek' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows the upgrade paywall instead of the sections for non-Pro users', () => {
    mockHasProAccess = false
    render(<InsightsPage />)

    const cta = screen.getByRole('link', { name: 'upgrade.title' })
    expect(cta).toHaveAttribute('href', '/upgrade')

    expect(
      screen.queryByRole('heading', { level: 2, name: 'insights.sections.completionTrends' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'insights.rangeMonth' }),
    ).not.toBeInTheDocument()
  })

  it('renders the sections and no paywall for Pro users', () => {
    mockHasProAccess = true
    render(<InsightsPage />)

    expect(screen.queryByRole('link', { name: 'upgrade.title' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'insights.sections.completionTrends' }),
    ).toBeInTheDocument()
  })

  it('does not flash the paywall while the profile is still loading', () => {
    mockHasProAccess = false
    mockProfileLoading = true
    render(<InsightsPage />)

    expect(screen.queryByRole('link', { name: 'upgrade.title' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'insights.sections.completionTrends' }),
    ).toBeInTheDocument()
  })

  it('renders a labeled back control above the dashboard', () => {
    render(<InsightsPage />)

    expect(screen.getByRole('button', { name: 'common.goBack' })).toBeInTheDocument()
  })

  it('keeps the back control on the upgrade paywall', () => {
    mockHasProAccess = false
    render(<InsightsPage />)

    expect(screen.getByRole('button', { name: 'common.goBack' })).toBeInTheDocument()
  })
})

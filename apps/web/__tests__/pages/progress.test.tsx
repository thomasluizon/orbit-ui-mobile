import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  repair: { mutate: vi.fn(), isPending: false, isError: false },
  reorder: { mutate: vi.fn() },
  updateStatus: { mutate: vi.fn(), isPending: false },
  account: {
    profile: { canViewGamification: true, hasProAccess: true, currentStreak: 4, longestStreak: 9 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  goals: {
    data: { allGoals: [] as Record<string, unknown>[] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  gamification: {
    profile: {
      totalXp: 150,
      level: 2,
      levelTitle: 'Explorer',
      xpForCurrentLevel: 100,
      xpForNextLevel: 200,
      xpToNextLevel: 50,
      achievementsEarned: 0,
      achievementsTotal: 0,
      achievements: [] as Record<string, unknown>[],
      userAchievements: [],
      currentStreak: 4,
      longestStreak: 9,
      lastActiveDate: null,
      isPro: true,
      achievementsLocked: false,
      nextReward: {
        nextLevel: 3,
        nextLevelTitle: 'Navigator',
        xpToNextLevel: 50,
        proTeaser: null,
      },
    },
    xpProgress: 50,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  retrospective: {
    data: {
      period: 'month',
      metrics: {
        completionRate: 75,
        totalCompletions: 18,
        totalScheduled: 24,
        activeDays: 12,
        periodDays: 30,
        currentStreak: 4,
        bestStreak: 9,
        badHabitSlips: 0,
        weeklyConsistency: [],
        topHabits: [{ name: 'Read', emoji: null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false }],
        needsAttention: [],
      },
      narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
      fromCache: false,
    },
    isLoading: false,
    isError: false,
    error: null as { data: { errorCode: string } } | null,
    refetch: vi.fn(),
  },
  freeze: {
    streakInfo: {
      currentStreak: 4,
      longestStreak: 9,
      lastActiveDate: null as string | null,
      freezesUsedThisMonth: 1,
      freezesAvailable: 2,
      maxFreezesPerMonth: 3,
      isFrozenToday: false,
      recentFreezeDates: [] as string[],
      streakFreezesAccumulated: 2,
      maxStreakFreezesAccumulated: 3,
      daysUntilNextFreeze: 3,
      freezesAvailableToUse: 2,
      canEarnMore: true,
      isRepairAvailable: false,
      repairDate: null as string | null,
    },
    streakQuery: { isError: false, refetch: vi.fn() },
    isFrozenToday: false,
    freezesAvailable: 2,
    streakFreezesAccumulated: 2,
    maxStreakFreezesAccumulated: 3,
    freezesUsedThisMonth: 1,
    maxFreezesPerMonth: 3,
    daysUntilNextFreeze: 3,
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => <span>PRO</span> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => mocks.account }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => mocks.goals,
  useReorderGoals: () => mocks.reorder,
  useUpdateGoalStatus: () => mocks.updateStatus,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => mocks.gamification,
  useRepairStreak: () => mocks.repair,
  useStreakFreeze: () => mocks.freeze,
}))
vi.mock('@/hooks/use-retrospective', () => ({
  useProgressRetrospective: () => mocks.retrospective,
}))

import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'

describe('ProgressContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = true
    mocks.goals.data.allGoals = []
    mocks.gamification.profile.achievements = []
    mocks.freeze.streakInfo.lastActiveDate = null
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakQuery.isError = false
    mocks.freeze.freezesAvailable = 2
    mocks.retrospective.isLoading = false
    mocks.retrospective.isError = false
    mocks.retrospective.error = null
  })

  it('renders the four sections in the decided descending order and the API figures', () => {
    render(<ProgressContent />)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'progressScreen.sections.streak',
      'progressScreen.sections.goals',
      'progressScreen.sections.window',
      'progressScreen.sections.achievements',
    ])
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('12 / 30')).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })

  it('renders routed boundaries instead of blank gated regions', () => {
    mocks.account.profile.canViewGamification = false
    mocks.account.profile.hasProAccess = false
    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.achievements.lockedBody')).toBeInTheDocument()
    expect(screen.getAllByText('progressScreen.streak.lockedAction').length).toBeGreaterThan(0)
  })

  it('keeps free gamification cohorts open while locking only the Pro figures', () => {
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = false

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.currentLabel')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.lockedBody')).not.toBeInTheDocument()
    expect(screen.queryByText('progressScreen.achievements.lockedBody')).not.toBeInTheDocument()
  })

  it('offers the one day repair and the explicit finish write', () => {
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-08-27'
    mocks.goals.data.allGoals = [{
      id: 'goal-1',
      title: 'Read 10 books',
      description: null,
      targetValue: 10,
      currentValue: 10,
      unit: 'books',
      status: 'Active',
      deadline: null,
      position: 0,
      createdAtUtc: '2026-08-01T00:00:00Z',
      completedAtUtc: null,
      progressPercentage: 100,
      linkedHabits: [],
    }]
    render(<ProgressContent />)

    fireEvent.click(screen.getByText('progressScreen.streak.repairAction'))
    fireEvent.click(screen.getByText('progressScreen.goals.finish'))
    expect(mocks.repair.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.updateStatus.mutate).toHaveBeenCalledWith({
      goalId: 'goal-1',
      goalName: 'Read 10 books',
      data: { status: 'Completed' },
    })
  })

  it('keeps the page open when the Pro figures report no habits', () => {
    const retrospectiveData = mocks.retrospective.data
    mocks.retrospective.data = null as unknown as typeof mocks.retrospective.data
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    render(<ProgressContent />)

    expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()

    mocks.retrospective.data = retrospectiveData
  })

  it('shows streak loading and failure without a false upgrade boundary', () => {
    const streakInfo = mocks.freeze.streakInfo
    mocks.freeze.streakInfo = null as unknown as typeof mocks.freeze.streakInfo

    const { rerender } = render(<ProgressContent />)
    expect(screen.getByLabelText('progressScreen.loading')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.lockedBody')).not.toBeInTheDocument()

    mocks.freeze.streakQuery.isError = true
    rerender(<ProgressContent />)
    expect(screen.getByText('progressScreen.error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('progressScreen.retry'))
    expect(mocks.freeze.streakQuery.refetch).toHaveBeenCalledTimes(1)

    mocks.freeze.streakInfo = streakInfo
  })
})

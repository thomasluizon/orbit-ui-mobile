import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  repair: { mutate: vi.fn(), isPending: false, isError: false },
  reorder: { mutate: vi.fn() },
  updateStatus: { mutate: vi.fn(), isPending: false },
  account: {
    profile: { canViewGamification: true, currentStreak: 4, longestStreak: 9 },
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
    },
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

function localDateOffset(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

describe('ProgressContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.account.profile.canViewGamification = true
    mocks.goals.data.allGoals = []
    mocks.gamification.profile.achievements = []
    mocks.freeze.streakInfo.lastActiveDate = null
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.freezesAvailable = 2
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
    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.achievements.lockedBody')).toBeInTheDocument()
    expect(screen.getAllByText('progressScreen.streak.lockedAction').length).toBeGreaterThan(0)
  })

  it('offers the one day repair and the explicit finish write', () => {
    mocks.freeze.streakInfo.lastActiveDate = localDateOffset(-2)
    mocks.freeze.streakInfo.isRepairAvailable = true
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
})

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProgressContent } from '@/components/progress/progress-content'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

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
      nextReward: { nextLevel: 3, nextLevelTitle: 'Navigator', xpToNextLevel: 50, proTeaser: null },
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => mocks.router }))
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
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => mocks.retrospective }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const tokens = new Proxy({}, { get: () => '#111111' })
  return { ...actual, createTokensV2: () => tokens }
})
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => React.createElement('ProBadge'),
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: (props: Record<string, unknown>) => React.createElement('PillButton', props, props.children as React.ReactNode),
}))
vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: (props: Record<string, unknown>) => React.createElement('StatTile', props),
}))

async function renderProgress(): Promise<{ root: TestNode }> {
  let tree: { root: TestNode } | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<ProgressContent />)
    await Promise.resolve()
  })
  return tree!
}

function findPill(root: TestNode, label: string): TestNode {
  return root.findAll((node) => node.type === 'PillButton' && node.props.children === label)[0]!
}

describe('mobile ProgressContent', () => {
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
    mocks.retrospective.isLoading = false
    mocks.retrospective.isError = false
    mocks.retrospective.error = null
  })

  it('renders the API window figures and all four section labels', async () => {
    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.sections.streak',
      'progressScreen.sections.goals',
      'progressScreen.sections.window',
      'progressScreen.sections.achievements',
    ]))
    const figures = tree.root.findAll((node) => node.type === 'StatTile').map((node) => node.props.value)
    expect(figures).toEqual(expect.arrayContaining(['75%', '12 / 30', 'Read', 18]))
  })

  it('renders the three routed plan boundaries', async () => {
    mocks.account.profile.canViewGamification = false
    mocks.account.profile.hasProAccess = false
    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.streak.lockedBody',
      'progressScreen.window.lockedBody',
      'progressScreen.achievements.lockedBody',
    ]))
    expect(tree.root.findAll((node) => node.type === 'ProBadge')).toHaveLength(3)
  })

  it('keeps free gamification cohorts open while locking only the Pro figures', async () => {
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = false

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.streak.currentLabel',
      'progressScreen.sections.goals',
      'progressScreen.window.lockedBody',
    ]))
    expect(text).not.toContain('progressScreen.streak.lockedBody')
    expect(text).not.toContain('progressScreen.achievements.lockedBody')
  })

  it('dispatches the explicit repair and finish writes', async () => {
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-08-27'
    mocks.goals.data.allGoals = [{
      id: 'goal-1', title: 'Read 10 books', description: null, targetValue: 10,
      currentValue: 10, unit: 'books', status: 'Active', deadline: null, position: 0,
      createdAtUtc: '2026-08-01T00:00:00Z', completedAtUtc: null,
      progressPercentage: 100, linkedHabits: [],
    }]
    const tree = await renderProgress()

    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.streak.repairAction').props.onClick as () => void)()
      ;(findPill(tree.root, 'progressScreen.goals.finish').props.onClick as () => void)()
    })
    expect(mocks.repair.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.updateStatus.mutate).toHaveBeenCalledWith({
      goalId: 'goal-1', goalName: 'Read 10 books', data: { status: 'Completed' },
    })
  })

  it('keeps the other sections open when the Pro figures report no habits', async () => {
    const retrospectiveData = mocks.retrospective.data
    mocks.retrospective.data = null as unknown as typeof mocks.retrospective.data
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.sections.streak',
      'progressScreen.sections.goals',
    ]))
    const figures = tree.root.findAll((node) => node.type === 'StatTile').map((node) => node.props.value)
    expect(figures).toEqual(expect.arrayContaining(['0%', 0]))

    mocks.retrospective.data = retrospectiveData
  })

  it('shows streak loading and failure without a false upgrade boundary', async () => {
    const streakInfo = mocks.freeze.streakInfo
    mocks.freeze.streakInfo = null as unknown as typeof mocks.freeze.streakInfo

    let tree = await renderProgress()
    expect(tree.root.findAll((node) => node.props.label === 'progressScreen.loading').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.streak.lockedBody')).toHaveLength(0)

    mocks.freeze.streakQuery.isError = true
    tree = await renderProgress()
    const retry = findPill(tree.root, 'progressScreen.retry')
    await TestRenderer.act(() => {
      ;(retry.props.onClick as () => void)()
    })
    expect(mocks.freeze.streakQuery.refetch).toHaveBeenCalledTimes(1)

    mocks.freeze.streakInfo = streakInfo
  })

  it('keeps long-press drag and accessibility goal reordering', async () => {
    const goalOne = {
      id: 'goal-1', title: 'Goal one', description: null, targetValue: 10,
      currentValue: 2, unit: 'days', status: 'Active', deadline: null, position: 0,
      createdAtUtc: '2026-08-01T00:00:00Z', completedAtUtc: null,
      progressPercentage: 20, linkedHabits: [],
    }
    const goalTwo = { ...goalOne, id: 'goal-2', title: 'Goal two', position: 1 }
    mocks.goals.data.allGoals = [goalOne, goalTwo]

    const tree = await renderProgress()
    const list = tree.root.findAll((node) => node.type === 'DraggableFlatList')[0]!
    const firstGoal = tree.root.findAll((node) => node.props.accessibilityLabel === 'Goal one')[0]!

    expect(list.props.activationDistance).toBe(5)
    expect(firstGoal.props.delayLongPress).toBe(300)
    expect(firstGoal.props.onLongPress).toEqual(expect.any(Function))
    expect(firstGoal.props.accessibilityActions).toHaveLength(2)

    await TestRenderer.act(() => {
      ;(list.props.onDragEnd as (params: unknown) => void)({ from: 0, to: 1, data: [goalTwo, goalOne] })
    })
    expect(mocks.reorder.mutate).toHaveBeenCalledWith([
      { id: 'goal-2', position: 0 },
      { id: 'goal-1', position: 1 },
    ])
  })
})

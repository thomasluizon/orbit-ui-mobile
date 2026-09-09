import React from 'react'
import * as ReactNative from 'react-native'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockGoal } from '@orbit/shared/__tests__/factories'

import ProgressScreen from '@/app/(tabs)/progress'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  parent: TestNode | null
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  repair: { mutate: vi.fn(), isPending: false, isError: false },
  reorder: { mutate: vi.fn() },
  drag: vi.fn(),
  updateStatus: { mutate: vi.fn(), isPending: false },
  account: {
    profile: { timeZone: 'America/Sao_Paulo', canViewGamification: true, hasProAccess: true, currentStreak: 4, longestStreak: 9, totalXp: 150 },
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
        weeklyConsistency: [10, 20, 30, 80, 50, 60, 70],
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
  streakSnapshotZones: null as Set<string> | null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    i18n: { language: 'en' },
  }),
}))
vi.mock('expo-router', () => ({ useRouter: () => mocks.router }))
vi.mock('react-native-draggable-flatlist', () => ({
  NestableScrollContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NestableDraggableFlatList: ({ data, renderItem, ...props }: {
    data: ReturnType<typeof createMockGoal>[]
    renderItem: (params: { item: ReturnType<typeof createMockGoal>; getIndex: () => number; drag: () => void; isActive: boolean }) => React.ReactNode
  }) => React.createElement('DraggableFlatList', props, data.map((item, index) => <React.Fragment key={item.id}>{renderItem({ item, getIndex: () => index, drag: mocks.drag, isActive: false })}</React.Fragment>)),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => mocks.account }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => mocks.goals,
  useReorderGoals: () => mocks.reorder,
  useUpdateGoalStatus: () => mocks.updateStatus,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => mocks.gamification,
  useRepairStreak: () => mocks.repair,
  useStreakFreeze: (_profile: unknown, timeZone: unknown) => {
    if (!mocks.streakSnapshotZones || typeof timeZone !== 'string') return mocks.freeze
    if (mocks.streakSnapshotZones.has(timeZone)) return mocks.freeze
    return {
      ...mocks.freeze,
      streakInfo: null,
      isFrozenToday: false,
      streakQuery: { ...mocks.freeze.streakQuery, isError: false },
    }
  },
}))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => mocks.retrospective }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: theme.mode }),
}))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: (props: { goalId: string; inline?: boolean; onClose: () => void }) => React.createElement('GoalDetail', props) }))
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
    tree = TestRenderer.create(<ProgressScreen />)
    await Promise.resolve()
  })
  return tree!
}

function findPill(root: TestNode, label: string): TestNode {
  return root.findAll((node) => node.type === 'PillButton' && node.props.children === label)[0]!
}

function isAccessibilityHidden(node: TestNode): boolean {
  for (let ancestor: TestNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (ancestor.props.importantForAccessibility === 'no-hide-descendants') return true
    const style = ancestor.props.style as ViewStyle | undefined
    if (style && StyleSheet.flatten(style).display === 'none') return true
  }
  return false
}

describe('mobile ProgressContent', () => {
  it.each(['dark', 'light'] as const)('keeps goal metadata legible in resting and pressed states in %s', async (mode) => {
    theme.mode = mode
    mocks.goals.data.allGoals = [createMockGoal()]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Read 12 Books')[0]!
    const metadata = card.findAll((node) => node.type === 'Text' && typeof node.props.children === 'string' && node.props.children.startsWith('progressScreen.goals.progress'))[0]!
    const foreground = StyleSheet.flatten(metadata.props.style as TextStyle).color as string
    const tokens = createTokensV2('purple', mode)
    const cardStyle = card.props.style as (state: { pressed: boolean }) => ViewStyle

    for (const pressed of [false, true]) {
      const surface = StyleSheet.flatten(cardStyle({ pressed })).backgroundColor as string
      expect(contrastOnSurface(foreground, [tokens.bg, surface]), pressed ? 'pressed' : 'resting')
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['on_track', 'at_risk', 'behind', 'no_deadline'])('renders one neutral tracking badge for %s without status or deadline', async (trackingStatus) => {
    mocks.goals.data.allGoals = [createMockGoal({ trackingStatus, deadline: '2026-08-01' })]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Read 12 Books')[0]!
    expect(card.findAll((node) => node.props.children === 'goals.status.active')).toHaveLength(0)
    expect(card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'badge-solid')).toHaveLength(1)
    expect(card.findAll((node) => typeof node.props.children === 'string' && node.props.children.startsWith('progressScreen.goals.daysOverdue'))).toHaveLength(0)
  })

  it('renders a reached target as a done disc with one badge and no finish entry', async () => {
    mocks.goals.data.allGoals = [createMockGoal({ progressPercentage: 100, currentValue: 12, trackingStatus: 'no_deadline' })]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Read 12 Books')[0]!
    expect(card.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    expect(card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'status-ring')).toHaveLength(1)
    expect(card.findAll((node) => node.props.children === 'progressScreen.goals.targetReached').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.finish')).toHaveLength(0)
    expect(mocks.updateStatus.mutate).not.toHaveBeenCalled()
  })

  it('renders abandoned goals with an outline badge and a distinct clearable empty filter', async () => {
    mocks.goals.data.allGoals = [createMockGoal({ status: 'Abandoned', progressPercentage: 100, trackingStatus: 'behind' })]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Read 12 Books')[0]!
    expect(card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'badge-outline')).toHaveLength(1)
    expect(card.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    const tab = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'segment-completed-unselected-enabled')[0]!
    await TestRenderer.act(() => (tab.props.onPress as () => void)())
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.filterEmpty').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.empty')).toHaveLength(0)
    await TestRenderer.act(() => (findPill(tree.root, 'progressScreen.goals.clearFilter').props.onClick as () => void)())
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Read 12 Books').length).toBeGreaterThan(0)
  })

  it('cancels touch movement beyond 5px before the 300ms hold and never writes while filtered', async () => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Read 12 Books')[0]!
    const touch = (name: string, pageX: number) => (card.props[name] as ((event: unknown) => void) | undefined)?.({ nativeEvent: { pageX, pageY: 0, touches: [{ pageX, pageY: 0 }] } })
    await TestRenderer.act(() => { touch('onTouchStart', 0); touch('onTouchMove', 6); vi.advanceTimersByTime(300); touch('onLongPress', 6) })
    expect(mocks.drag).not.toHaveBeenCalled()
    await TestRenderer.act(() => { touch('onTouchStart', 0); touch('onTouchMove', 5); vi.advanceTimersByTime(299) })
    expect(mocks.drag).not.toHaveBeenCalled()
    await TestRenderer.act(() => vi.advanceTimersByTime(1))
    expect(mocks.drag).toHaveBeenCalledTimes(1)
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
    const tab = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'segment-active-unselected-enabled')[0]!
    await TestRenderer.act(() => (tab.props.onPress as () => void)())
    expect(tree.root.findAll((node) => node.type === 'DraggableFlatList')).toHaveLength(0)
  })

  it.each([
    ['touch', 'onTouchEnd', false],
    ['touch', 'onTouchCancel', false],
    ['mouse', 'onPointerUp', false],
    ['mouse', 'onPointerCancel', false],
    ['touch', 'onTouchCancel', true],
  ] as const)('opens detail on the first non-pointer activation after %s %s with early drift %s', async (pointerType, stopEvent, earlyDrift) => {
    vi.useFakeTimers()
    const goal = createMockGoal()
    mocks.goals.data.allGoals = [goal, createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === goal.title)[0]!
    const details = () => tree.root.findAll((node) => node.type === GoalDetailDrawer && node.props.open === true)
    const dispatch = (name: string, pageX = 0) => (card.props[name] as (event: unknown) => void)({ nativeEvent: { pointerType, pageX, pageY: 0 } })
    await TestRenderer.act(() => {
      dispatch(pointerType === 'touch' ? 'onTouchStart' : 'onPointerDown')
      if (earlyDrift || pointerType === 'mouse') dispatch(pointerType === 'touch' ? 'onTouchMove' : 'onPointerMove', 6)
      if (pointerType === 'touch') vi.advanceTimersByTime(300)
      dispatch(stopEvent)
    })
    expect(mocks.drag).toHaveBeenCalledTimes(earlyDrift ? 0 : 1)
    if (stopEvent === 'onTouchEnd' || stopEvent === 'onPointerUp') {
      await TestRenderer.act(() => (card.props.onPress as () => void)())
      expect(details(), 'the drag release must not open goal detail').toHaveLength(0)
    }
    await TestRenderer.act(() => (card.props.onPress as () => void)())
    expect(details(), 'the first non-pointer activation must open goal detail').toHaveLength(1)
    expect(details()[0]!.props.goalId).toBe(goal.id)
  })

  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    theme.mode = 'dark'
    mocks.account.profile.timeZone = 'America/Sao_Paulo'
    vi.clearAllMocks()
    for (const query of [mocks.account, mocks.goals, mocks.gamification]) {
      query.isLoading = false
      query.isError = false
    }
    Object.assign(mocks.account.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150 })
    Object.assign(mocks.gamification.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150, achievementsEarned: 0 })
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = true
    mocks.goals.data.allGoals = []
    mocks.gamification.profile.achievements = []
    mocks.freeze.isFrozenToday = false
    mocks.freeze.streakInfo.recentFreezeDates = []
    mocks.freeze.streakInfo.lastActiveDate = null
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakQuery.isError = false
    mocks.streakSnapshotZones = null
    mocks.retrospective.isLoading = false
    mocks.retrospective.isError = false
    mocks.retrospective.error = null
    mocks.retrospective.data.metrics.weeklyConsistency = [10, 20, 30, 80, 50, 60, 70]
    mocks.retrospective.data.metrics.topHabits = [{ name: 'Read', emoji: null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false }]
  })

  it.each(['account', 'goals', 'gamification'] as const)('renders the complete global skeleton while %s loads', async (query) => {
    mocks[query].isLoading = true
    const tree = await renderProgress()
    const announcements = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar' && !isAccessibilityHidden(node))
    expect(announcements).toHaveLength(1)
    expect(announcements[0]?.props).toMatchObject({ accessible: true, accessibilityLabel: 'progressScreen.loading', accessibilityState: { busy: true } })
    const units = tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.testID === 'string' && node.props.testID.startsWith('skeleton-unit-'))
    expect(units.map((unit) => unit.props.testID)).toEqual([
      'skeleton-unit-settings', 'skeleton-unit-settings',
      'skeleton-unit-stat-tile', 'skeleton-unit-stat-tile', 'skeleton-unit-stat-tile', 'skeleton-unit-stat-tile',
      'skeleton-unit-habit-row', 'skeleton-unit-habit-row', 'skeleton-unit-habit-row',
    ])
    expect(tree.root.findAll((node) => node.type === 'PillButton')).toHaveLength(0)
  })

  it.each(['loading', 'error', 'empty', 'populated'])('exposes one screen heading in the %s state', async (state) => {
    mocks.account.isLoading = state === 'loading'
    mocks.account.isError = state === 'error'
    if (state === 'empty') {
      Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
      Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    }
    const tree = await renderProgress()
    const headings = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.accessible === true && node.props.children === 'progressScreen.title' && !isAccessibilityHidden(node))
    expect(headings).toHaveLength(1)
  })

  it.each(['account', 'goals', 'gamification'] as const)('retries a global %s error with one action', async (query) => {
    mocks[query].isError = true
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'error-state')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'PillButton')).toHaveLength(1)
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.retry').props.onClick as () => void)()
    })
    for (const request of [mocks.account, mocks.goals, mocks.gamification]) expect(request.refetch).toHaveBeenCalledTimes(1)
    mocks[query].isError = false
    const recovered = await renderProgress()
    expect(recovered.root.findAll((node) => node.props.testID === 'error-state')).toHaveLength(0)
    expect(recovered.root.findAll((node) => node.props.children === 'progressScreen.sections.streak').length).toBeGreaterThan(0)
  })

  it('shows a retryable error even while another resource is loading', async () => {
    mocks.account.isError = true
    mocks.goals.isLoading = true
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'error-state')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
  })

  it('does not retry a disabled gamification query', async () => {
    mocks.account.profile.canViewGamification = false
    mocks.goals.isError = true
    const tree = await renderProgress()
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.retry').props.onClick as () => void)()
    })
    expect(mocks.account.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.goals.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.gamification.refetch).not.toHaveBeenCalled()
  })

  it.each([false, true])('renders one orbital empty invitation for Pro access %s', async (hasProAccess) => {
    mocks.account.profile.hasProAccess = hasProAccess
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.empty').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'empty-state-mark-orbit')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'PillButton')).toHaveLength(1)
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.emptyAction').props.onClick as () => void)()
    })
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/')
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.sections.streak')).toHaveLength(0)
  })

  it.each(['goal', 'longestStreak', 'xp', 'achievement'] as const)('keeps existing %s records visible after the current streak resets', async (record) => {
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    if (record === 'goal') mocks.goals.data.allGoals = [createMockGoal()]
    if (record === 'longestStreak') mocks.account.profile.longestStreak = 9
    if (record === 'xp') mocks.account.profile.totalXp = 150
    if (record === 'achievement') mocks.gamification.profile.achievementsEarned = 1
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.empty')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.sections.streak').length).toBeGreaterThan(0)
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
    const figures = tree.root.findAll((node) => node.type === 'StatTile' && String(node.props.label).startsWith('progressScreen.window.'))
      .map((node) => ({ label: node.props.label, value: node.props.value }))
    expect(figures).toEqual([
      { label: 'progressScreen.window.completionRate', value: '75%' },
      { label: 'progressScreen.window.activeDays', value: 12 },
      { label: 'progressScreen.window.bestWeekday', value: 'dates.daysLong.thursday' },
      { label: 'progressScreen.window.topHabit', value: 'Read' },
    ])
  })

  it('renders the remaining routed plan boundaries', async () => {
    mocks.account.profile.canViewGamification = false
    mocks.account.profile.hasProAccess = false
    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.streak.lockedBody',
      'progressScreen.window.lockedBody',
    ]))
    expect(text).not.toContain('progressScreen.achievements.lockedBody')
    expect(tree.root.findAll((node) => node.type === 'ProBadge')).toHaveLength(2)
    const labels = tree.root.findAll((node) => node.type === 'StatTile').map((node) => node.props.label)
    expect(labels).toContain('progressScreen.streak.longest')
    expect(labels).toContain('streakDisplay.detail.tierTileLabel')
  })

  it('keeps free gamification cohorts open while locking only the Pro figures', async () => {
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = false

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.streak.currentLabel:{"count":4}',
      'progressScreen.sections.goals',
      'progressScreen.window.lockedBody',
    ]))
    expect(text).not.toContain('progressScreen.streak.lockedBody')
    expect(text).not.toContain('progressScreen.achievements.lockedBody')
    const routes = tree.root.findAll((node) => node.type === 'PillButton' && node.props.children === 'progressScreen.window.lockedAction')
    expect(routes).toHaveLength(1)
    await TestRenderer.act(() => {
      ;(routes[0]!.props.onClick as () => void)()
    })
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/upgrade', params: { from: '/progress' } })
  })

  it('renders empty weekly and habit figures without substituting unrelated totals', async () => {
    mocks.retrospective.data.metrics.weeklyConsistency = []
    mocks.retrospective.data.metrics.topHabits = []

    const tree = await renderProgress()
    const emptyFigures = tree.root.findAll((node) => node.type === 'StatTile' && node.props.state === 'empty')
    expect(emptyFigures).toHaveLength(2)
    expect(tree.root.findAll((node) => node.type === 'StatTile' && node.props.value === 18)).toHaveLength(0)
  })

  it.each([[412, 2], [768, 4]] as const)('at %ipx lays out the figures in %i columns', async (width, columns) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 892, scale: 1, fontScale: 1 })
    const tree = await renderProgress()
    const rows = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'progress-window-row')
    expect(rows).toHaveLength(4 / columns)
    for (const row of rows) {
      expect(row.findAll((node) => node.type === 'StatTile')).toHaveLength(columns)
    }
    dimensions.mockRestore()
  })

  it('draws the XP row before grouped achievements and distinguishes earned shapes from progress', async () => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 800, height: 892, scale: 1, fontScale: 1 })
    mocks.gamification.profile.achievements = [
      {
        id: 'first_orbit', name: 'First orbit', description: 'Started', category: 'GettingStarted',
        rarity: 'Common', xpReward: 10, iconKey: 'first_orbit', isEarned: true,
        earnedAtUtc: '2026-08-01T00:00:00Z', progressCurrent: null, progressTarget: null,
      },
      {
        id: 'week_warrior', name: 'Week warrior', description: 'Seven days', category: 'GettingStarted',
        rarity: 'Common', xpReward: 20, iconKey: 'week_warrior', isEarned: false,
        earnedAtUtc: null, progressCurrent: 4, progressTarget: 7,
      },
      {
        id: 'dedicated', name: 'Dedicated', description: 'Keep going', category: 'Consistency',
        rarity: 'Rare', xpReward: 30, iconKey: 'dedicated', isEarned: true,
        earnedAtUtc: '2026-08-02T00:00:00Z', progressCurrent: 30, progressTarget: 30,
      },
      {
        id: 'first_friend', name: 'First friend', description: 'Social', category: 'Social',
        rarity: 'Common', xpReward: 10, iconKey: 'first_friend', isEarned: false,
        earnedAtUtc: null, progressCurrent: 0, progressTarget: 1,
      },
    ]

    const tree = await renderProgress()
    const hosts = tree.root.findAll((node) => typeof node.type === 'string')
    const xpSummary = hosts.findIndex((node) => node.props.testID === 'progress-xp-summary')
    const achievementsHeading = hosts.findIndex((node) => node.props.accessibilityRole === 'header' && node.props.children === 'progressScreen.sections.achievements')
    expect(xpSummary).toBeGreaterThanOrEqual(0)
    expect(xpSummary).toBeLessThan(achievementsHeading)
    expect(tree.root.findAll((node) => typeof node.props.children === 'string' && node.props.children.startsWith('progressScreen.achievements.next'))).toHaveLength(0)
    const categoryHeadings = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'achievement-category')
    expect(categoryHeadings.map((node) => node.props.children)).toEqual([
      'gamification.categories.GettingStarted',
      'gamification.categories.Consistency',
    ])
    expect(categoryHeadings.every((node) => node.props.accessibilityRole === 'header')).toBe(true)

    const earned = tree.root.findAll((node) => node.props.testID === 'achievement-tile-first_orbit')[0]!
    const progressive = tree.root.findAll((node) => node.props.testID === 'achievement-tile-week_warrior')[0]!
    const completedProgress = tree.root.findAll((node) => node.props.testID === 'achievement-tile-dedicated')[0]!
    expect(StyleSheet.flatten(earned.props.style as ViewStyle).width).toBe('48%')
    expect(earned.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    expect(progressive.findAll((node) => node.props.accessibilityRole === 'progressbar').length).toBeGreaterThan(0)
    const completedProgressBar = completedProgress.findAll((node) => node.props.accessibilityRole === 'progressbar')[0]!
    expect(completedProgressBar.props.accessibilityValue).toEqual({ min: 0, max: 30, now: 30 })
    expect(completedProgressBar.props.testID).toBe('progress-bar-complete')
    const earnedMark = earned.findAll((node) => node.props.testID === 'achievement-mark-earned')[0]!
    const unearnedMark = progressive.findAll((node) => node.props.testID === 'achievement-mark-unearned')[0]!
    expect(earnedMark.props.accessibilityLabel).toBe('progressScreen.achievements.earnedState:{"name":"gamification.achievements.first_orbit.name"}')
    expect(unearnedMark.props.accessibilityLabel).toBe('progressScreen.achievements.unearnedState:{"name":"gamification.achievements.week_warrior.name"}')
    expect(StyleSheet.flatten(earnedMark.props.style as ViewStyle).backgroundColor).toBe(createTokensV2('purple', 'dark').statusDone)
    expect(earned.findAll((node) => node.props.children === 'progressScreen.achievements.earnedLabel').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'gamification.achievements.first_friend.name')).toHaveLength(0)

    dimensions.mockReturnValue({ width: 412, height: 892, scale: 1, fontScale: 1 })
    const compactTree = await renderProgress()
    const compactTile = compactTree.root.findAll((node) => node.props.testID === 'achievement-tile-first_orbit')[0]!
    expect(StyleSheet.flatten(compactTile.props.style as ViewStyle).width).toBe('100%')
    dimensions.mockRestore()
  })

  it('dispatches the explicit repair write', async () => {
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
    })
    expect(mocks.repair.mutate).toHaveBeenCalledTimes(1)
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
    expect(firstGoal.props.accessibilityActions).toHaveLength(2)

    await TestRenderer.act(() => {
      ;(list.props.onDragEnd as (params: unknown) => void)({ from: 0, to: 1, data: [goalTwo, goalOne] })
    })
    expect(mocks.reorder.mutate).toHaveBeenCalledWith([
      { id: 'goal-2', position: 0 },
      { id: 'goal-1', position: 1 },
    ])
  })

  it('renders fourteen account days and exposes the bank on the owning screen', async () => {
    const tree = await renderProgress()
    const strip = tree.root.findAll((node) => node.props.testID === 'day-strip-account')[0]!
    const cells = strip.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'image')
    expect(cells).toHaveLength(14)
    expect(cells.at(-1)?.props.testID).toBe('day-strip-cell-today')
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.streak.banked').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.type === 'StatTile' && node.props.label === 'streakDisplay.detail.tierTileLabel')).toHaveLength(1)
  })

  it.each([320, 412, 1440])('keeps today inside the full visible account row at %ipx', async (width) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 892, scale: 1, fontScale: 1 })
    const tree = await renderProgress()
    const strip = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'day-strip-account')[0]!
    const cells = strip.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'image')
    const rowStyle = StyleSheet.flatten(strip.props.style as ViewStyle)
    const visibleWidth = Math.min(width - 32, 560)
    const row = Yoga.Node.create()
    row.setWidth(visibleWidth)
    row.setFlexDirection(rowStyle.flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN)
    row.setGap(Yoga.GUTTER_ALL, Number(rowStyle.gap ?? 0))
    row.setJustifyContent(rowStyle.justifyContent === 'space-between' ? Yoga.JUSTIFY_SPACE_BETWEEN : Yoga.JUSTIFY_FLEX_START)
    const dayNodes = cells.map((cell, index) => {
      const style = StyleSheet.flatten(cell.props.style as ViewStyle)
      const day = Yoga.Node.create()
      day.setWidth(Number(style.width))
      day.setHeight(Number(style.height))
      day.setFlexShrink(style.flexShrink)
      day.setMinWidth(typeof style.minWidth === 'number' ? style.minWidth : undefined)
      row.insertChild(day, index)
      return day
    })
    try {
      row.calculateLayout(undefined, undefined)
      expect(cells).toHaveLength(14)
      expect(cells[13]?.props.testID).toBe('day-strip-cell-today')
      const today = dayNodes[13]!
      const right = today.getComputedLeft() + today.getComputedWidth()
      expect(right, 'today must fit inside the visible row').toBeLessThanOrEqual(visibleWidth)
      expect(right, 'the fourteen days must occupy the full row').toBe(visibleWidth)
      for (const day of dayNodes) expect(day.getComputedWidth()).toBeGreaterThanOrEqual(16)
      for (let ancestor = strip.parent; ancestor; ancestor = ancestor.parent) expect(ancestor.props.horizontal).not.toBe(true)
    } finally {
      row.freeRecursive()
      dimensions.mockRestore()
    }
  })

  it.each([false, true])('stages a stable frozen live region when initially frozen is %s', async (initiallyFrozen) => {
    mocks.freeze.isFrozenToday = initiallyFrozen
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-07']
    let tree: { root: TestNode; update: (element: React.ReactNode) => void; unmount: () => void } | undefined
    TestRenderer.act(() => { tree = TestRenderer.create(<ProgressScreen />) })
    const regions = tree!.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')
    expect(regions, 'the empty polite region must already be mounted').toHaveLength(1)
    const region = regions[0]!
    expect(region.props.accessibilityLabel ?? '').toBe('')
    expect(region.findAll((node) => node.props.children === 'progressScreen.streak.frozenToday')).toHaveLength(0)
    mocks.freeze.isFrozenToday = true
    await TestRenderer.act(async () => {
      tree!.update(<ProgressScreen />)
      await Promise.resolve()
    })
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')[0]).toBe(region)
    expect(region.props.accessibilityLabel).toBe('progressScreen.streak.frozenToday')
    expect(region.findAll((node) => node.props.children === 'progressScreen.streak.frozenToday').length).toBeGreaterThan(0)
    mocks.freeze.isFrozenToday = false
    TestRenderer.act(() => { tree!.update(<ProgressScreen />) })
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')[0]).toBe(region)
    expect(region.props.accessibilityLabel ?? '').toBe('')
    TestRenderer.act(() => { tree!.unmount() })
  })

  it.each([
    ['2026-09-09', '2026-09-08'],
    ['2026-09-08', '2026-09-07'],
  ])('labels the exact account day in history %j after timezone changes', async (...dates) => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = dates
    const tree = await renderProgress()
    const todayLabel = tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'progressScreen.streak.protectedToday')[0]!
    expect.soft(todayLabel.parent!.parent!.findAll((node) => node.props.children === 'Sep 8').length).toBeGreaterThan(0)
    mocks.account.profile.timeZone = 'Pacific/Kiritimati'
    const changed = await renderProgress()
    const changedLabels = changed.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'progressScreen.streak.protectedToday')
    if (dates.includes('2026-09-09')) {
      expect(changedLabels[0]!.parent!.parent!.findAll((node) => node.props.children === 'Sep 9').length).toBeGreaterThan(0)
    } else {
      expect(changedLabels).toHaveLength(0)
    }
    expect(changed.root.findAll((node) => node.props.children === 'Sep 8').length).toBeGreaterThan(0)
  })

  it('announces frozen today above the strip and includes its protected date', async () => {
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-07']
    const tree = await renderProgress()
    const hosts = tree.root.findAll((node) => typeof node.type === 'string')
    const banner = hosts.findIndex((node) => node.props.accessibilityLiveRegion === 'polite' && node.props.accessibilityLabel === 'progressScreen.streak.frozenToday')
    expect(banner).toBeGreaterThanOrEqual(0)
    expect(banner).toBeLessThan(hosts.findIndex((node) => node.props.testID === 'day-strip-account'))
    expect(tree.root.findAll((node) => node.props.testID === 'day-strip-cell-frozen').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.streak.protectedToday').length).toBeGreaterThan(0)
    mocks.freeze.isFrozenToday = false
    const open = await renderProgress()
    expect(open.root.findAll((node) => node.props.children === 'progressScreen.streak.frozenToday')).toHaveLength(0)
  })

  it('stage 5 opens inline detail and returns to its goal list', async () => {
    mocks.goals.data.allGoals = [createMockGoal()]
    const tree = await renderProgress()
    const card = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Read 12 Books')[0]
    if (!card) throw new Error('Goal card missing')
    TestRenderer.act(() => (card.props.onPress as () => void)())
    const detail = tree.root.findAll((node) => node.type === 'GoalDetail')[0]
    if (!detail) throw new Error('Goal detail missing')
    expect(detail.props.inline).toBe(true)
    TestRenderer.act(() => (detail.props.onClose as () => void)())
    expect(tree.root.findAll((node) => node.type === 'GoalDetail')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Read 12 Books')).toHaveLength(1)
  })

  it('keeps the frozen banner, strip and protected-today marker on one timezone snapshot', async () => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-08']
    mocks.streakSnapshotZones = new Set(['America/Sao_Paulo'])
    const initial = await renderProgress()

    expect(initial.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'progressScreen.streak.frozenToday')).toHaveLength(1)
    expect(initial.root.findAll((node) => node.props.testID === 'day-strip-cell-frozen').at(-1)?.props.testID).toBe('day-strip-cell-frozen')
    expect(initial.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'progressScreen.streak.protectedToday')).toHaveLength(1)

    mocks.account.profile.timeZone = 'Pacific/Kiritimati'
    const changing = await renderProgress()

    expect(changing.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'progressScreen.streak.frozenToday')).toHaveLength(0)
    expect(changing.root.findAll((node) => node.props.testID === 'day-strip-account')).toHaveLength(0)
    expect(changing.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'progressScreen.streak.protectedToday')).toHaveLength(0)

    mocks.freeze.isFrozenToday = false
    mocks.freeze.streakInfo.recentFreezeDates = []
    mocks.streakSnapshotZones.add('Pacific/Kiritimati')
    const refreshed = await renderProgress()

    expect(refreshed.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'progressScreen.streak.frozenToday')).toHaveLength(0)
    expect(refreshed.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'day-strip-cell-today')).toHaveLength(1)
    expect(refreshed.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'progressScreen.streak.protectedToday')).toHaveLength(0)
  })

})

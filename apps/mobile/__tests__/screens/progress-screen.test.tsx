import React from 'react'
import * as ReactNative from 'react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'

import ProgressScreen from '@/app/(tabs)/progress'

const TestRenderer = require('react-test-renderer')

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
  streakSnapshotZones: null as Set<string> | null,
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
  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
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

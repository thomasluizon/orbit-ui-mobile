import React from 'react'
import { RootScrollProvider } from '@/components/shell/root-scroll-context'
import { DestinationTabBar } from '@/components/navigation/destination-tab-bar'
import { __setScrollToImpl } from '../../test-mocks/react-native'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import * as ReactNative from 'react-native'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

import ProgressScreen from '@/app/(tabs)/progress'
import { PillButton } from '@/components/ui/pill-button'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))
const accessibilityMocks = vi.hoisted(() => ({ sendAccessibilityEvent: vi.fn() }))

vi.mock('react-native', async () => {
  const native = await vi.importActual<typeof import('react-native')>('react-native')
  return {
    ...native,
    AccessibilityInfo: {
      ...native.AccessibilityInfo,
      sendAccessibilityEvent: accessibilityMocks.sendAccessibilityEvent,
    },
  }
})

type TestNode = {
  type: unknown
  instance: unknown
  props: Record<string, unknown>
  parent: TestNode | null
  children: (TestNode | string | number)[]
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

type HabitRowHost = Parameters<typeof measureProfileRow>[0]

type TestTree = {
  toJSON: () => HabitRowHost | HabitRowHost[] | null
  root: TestNode
  update: (element: React.ReactElement) => void
}

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  retrospectiveHook: vi.fn(),
  gamificationEnabled: vi.fn(),
  repair: { mutate: vi.fn(), isPending: false, isError: false, error: null as { status: number } | null },
  reorder: { mutate: vi.fn(), isPending: false, isError: false },
  drag: vi.fn(),
  dragActive: false,
  usePortugueseCatalog: false,
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
    error: { status: 500, data: { error: 'Server error', errorCode: 'INTERNAL_SERVER_ERROR' } },
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
        topHabits: [{ name: 'Read', emoji: null as string | null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false, habitId: undefined as string | null | undefined }],
        needsAttention: [],
      },
      narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
      fromCache: false,
    },
    isLoading: false,
    isError: false,
    error: null as { status?: number; data: { errorCode: string } } | null,
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
      repairableGapDates: undefined as string[] | undefined,
      lastFreezeCoveredDate: null as string | null,
      freezeBankRemaining: null as number | null,
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

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')

  return {
    ...actual,
    useTranslation: () => ({
      t: mocks.usePortugueseCatalog
        ? i18n.t.bind(i18n)
        : (key: string, values?: Record<string, unknown>) =>
          values ? `${key}:${JSON.stringify(values)}` : key,
      i18n: { language: mocks.usePortugueseCatalog ? i18n.language : 'en' },
    }),
  }
})
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))

vi.mock('expo-router', () => ({
  usePathname: () => '/progress', useRouter: () => mocks.router }))
vi.mock('react-native-draggable-flatlist', () => ({
  NestableScrollContainer: React.forwardRef((props: React.ComponentProps<typeof ReactNative.ScrollView>, ref: React.ForwardedRef<ReactNative.ScrollView>) => <ReactNative.ScrollView ref={ref} {...props} />),
  NestableDraggableFlatList: ({ data, renderItem, ...props }: {
    data: ReturnType<typeof createMockGoal>[]
    renderItem: (params: { item: ReturnType<typeof createMockGoal>; getIndex: () => number; drag: () => void; isActive: boolean }) => React.ReactNode
  }) => React.createElement('DraggableFlatList', props, data.map((item, index) => <React.Fragment key={item.id}>{renderItem({ item, getIndex: () => index, drag: mocks.drag, isActive: mocks.dragActive })}</React.Fragment>)),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => mocks.account }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => mocks.goals,
  useReorderGoals: () => mocks.reorder,
  useUpdateGoalStatus: () => mocks.updateStatus,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: (enabled?: boolean) => {
    mocks.gamificationEnabled(enabled)
    return mocks.gamification
  },
  useRepairStreak: () => mocks.repair,
  useStreakFreeze: (profile: { streakFreezesAvailable?: number }, timeZone: unknown, enabled = true) => {
    if (!enabled) return { ...mocks.freeze, streakInfo: null, streakFreezesAccumulated: profile.streakFreezesAvailable ?? 0 }
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
vi.mock('@/hooks/use-retrospective', () => ({
  useProgressRetrospective: () => {
    mocks.retrospectiveHook()
    return mocks.retrospective
  },
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: theme.mode }),
}))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: (props: { goalId: string; inline?: boolean; onClose: () => void }) => React.createElement('GoalDetail', props) }))
vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => React.createElement('ProBadge'),
}))
vi.mock('@/components/ui/stat-tile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/stat-tile')>()),
  StatTile: (props: Record<string, unknown>) => React.createElement('StatTile', props),
}))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, title, confirmLabel, onConfirm }: { open: boolean; title: string; confirmLabel: string; onConfirm: () => void }) => open
    ? React.createElement('ConfirmSheet', { title, confirmLabel, onConfirm })
    : null,
}))

async function renderProgress(createNodeMock?: (element: { props: Record<string, unknown> }) => unknown): Promise<TestTree> {
  let tree: TestTree | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<ProgressScreen />, { createNodeMock })
    await Promise.resolve()
  })
  return tree!
}

function captureGoalCardRendering(card: TestNode) {
  const structure = (node: TestNode | string | number): unknown[] => {
    if (typeof node !== 'object') return [node]
    if (typeof node.type !== 'string') return node.children.flatMap(structure)
    return [{
      type: node.type,
      props: Object.fromEntries(Object.entries(node.props).filter(([key, value]) =>
        key !== 'children' && key !== 'style' && typeof value !== 'function')),
      children: node.children.flatMap(structure),
    }]
  }
  const styles = card.findAll((node) => typeof node.type === 'string').map((node) => {
    const rawStyle = node.props.style
    if (!rawStyle) return undefined
    const resolve = (pressed: boolean) => StyleSheet.flatten(typeof rawStyle === 'function'
      ? (rawStyle as (state: { pressed: boolean }) => ViewStyle)({ pressed })
      : rawStyle)
    return { resting: resolve(false), pressed: resolve(true) }
  })
  return { structure: structure(card)[0], styles }
}

function findProgressHabitHost(host: HabitRowHost): HabitRowHost | undefined {
  if ('testID' in host.props && host.props.testID === 'progress-top-habit') return host
  return (host.children ?? []).filter((child): child is HabitRowHost => typeof child !== 'string').map(findProgressHabitHost).find(Boolean)
}

function findPill(root: TestNode, label: string): TestNode {
  return pillButtons(root).find((button) => button.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === label).length > 0)!
}

function pillButtons(root: TestNode): TestNode[] {
  return root.findAll((node) => node.type === 'Pressable'
    && typeof node.props.testID === 'string'
    && node.props.testID.startsWith('button-'))
}

function isAccessibilityHidden(node: TestNode): boolean {
  for (let ancestor: TestNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (ancestor.props.importantForAccessibility === 'no-hide-descendants') return true
    const style = ancestor.props.style as ViewStyle | undefined
    if (style && StyleSheet.flatten(style).display === 'none') return true
  }
  return false
}

function findGoalCard(root: TestNode, title: string): TestNode {
  return root.findAll((node) => node.type === 'Pressable'
    && String(node.props.accessibilityLabel).includes(`\"title\":\"${title}\"`))[0]!
}

function findGoalsSection(root: TestNode) {
  return root.findAll((node) =>
    typeof node.props.onRegisterGoal === 'function',
  )[0]!
}

function setGoalCardFocusTarget(root: TestNode, goalId: string) {
  const goalsSection = findGoalsSection(root)
  const card = { destination: `goal card ${goalId}` }
  const registerGoal = goalsSection.props.onRegisterGoal as (id: string, instance: unknown) => void
  registerGoal(goalId, card)
  return card
}

function findProgressHeadingFocusTarget(root: TestNode) {
  const heading = root.findAll((node) => typeof node.props.focusRef === 'object')[0]
  const target = (heading?.props.focusRef as { current?: unknown } | undefined)?.current
  if (!target) throw new Error('Progress heading focus target missing')
  return target
}

function findGoalEmptyWell(line: TestNode): TestNode {
  let ancestor = line.parent!
  while (ancestor.type !== 'View') ancestor = ancestor.parent!
  return ancestor
}

async function selectGoalFilter(tree: TestTree, view: string) {
  const entry = tree.root.findAll((node) => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('progressScreen.goals.filter:'))[0]!
  await TestRenderer.act(() => { (entry.props.onPress as () => void)() })
  const option = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox'
    && node.findAll((child) => child.type === 'Text' && child.props.children === `progressScreen.goals.${view}`).length > 0)[0]!
  await TestRenderer.act(async () => { (option.props.onPress as () => void)(); await Promise.resolve() })
}

describe('mobile ProgressContent', () => {
  it.each([320, 412, 840])('uses 16 between streak children and window tiles at %ipx', async (width) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale: 1 })
    mocks.freeze.streakInfo.repairableGapDates = ['2026-09-02']
    try {
      const tree = await renderProgress()
      const bank = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'freeze-bank')[0]!
      let streak = bank.parent!
      while (streak.type !== 'View') streak = streak.parent!
      expect(StyleSheet.flatten(streak.props.style as ViewStyle).gap).toBe(16)
      expect(streak.findAll((node) => node.type === 'Text' && String(node.props.children).startsWith('progressScreen.streak.gapBody'))).toHaveLength(1)
      const grids = tree.root.findAll((node) => node.type === 'View' && String(node.props.testID).startsWith('progress-window-grid-'))
      expect(grids).toHaveLength(1)
      expect(StyleSheet.flatten(grids[0]!.props.style as ViewStyle).gap).toBe(16)
      const rows = grids[0]!.findAll((node) => node.type === 'View' && node.props.testID === 'progress-window-row')
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(StyleSheet.flatten(row.props.style as ViewStyle).gap).toBe(16)
    } finally {
      dimensions.mockRestore()
    }
  })

  it.each([false, true])('scrolls Progresso on reselect and preserves goal detail at open=%s', async (detailOpen) => {
    const goal = createMockGoal()
    mocks.goals.data.allGoals = [goal]
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<RootScrollProvider><ProgressScreen /><DestinationTabBar pathname="/progress" /></RootScrollProvider>) })
    if (detailOpen) await TestRenderer.act(() => { (findGoalCard(tree!.root, goal.title).props.onPress as () => void)() })
    scrollTo.mockClear()
    await TestRenderer.act(() => { tree!.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; accessibilityState?: { selected?: boolean }; onPress: () => void } }) => node.type === 'Pressable' && node.props.accessibilityRole === 'tab' && node.props.accessibilityState?.selected)[0]!.props.onPress() })
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 0, animated: false })
    const details = tree!.root.findAll((node: TestNode) => node.type === GoalDetailDrawer && node.props.open === true)
    expect(details).toHaveLength(detailOpen ? 1 : 0)
    if (detailOpen) expect(details[0]!.props.goalId).toBe(goal.id)
    await TestRenderer.act(() => tree!.unmount())
    __setScrollToImpl(() => {})
  })
  it.each(['Ler os livros que escolhi para aprender uma nova habilidade', 'AprenderUmaNovaHabilidade'.repeat(5)])('clamps a long goal title and keeps its detail one tap away: %s', async (title) => {
    mocks.goals.data.allGoals = [createMockGoal({ title })]
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, title)
    const headline = card.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === title)[0]!
    expect(headline.props.numberOfLines).toBe(1)
    expect(headline.props.ellipsizeMode).toBe('tail')
    expect(card.props.accessibilityLabel).toContain(title)
    const metadata = card.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && String(node.props.children).startsWith('progressScreen.goals.progress'))[0]!
    const texts = card.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants')
    expect(texts.indexOf(headline)).toBeLessThan(texts.indexOf(metadata))
    await TestRenderer.act(() => (card.props.onPress as () => void)())
    expect(tree.root.findAll((node) => node.type === GoalDetailDrawer)[0]!.props.goalId).toBe('goal-1')
  })
  it.each([1352, 1100, 840, 412])('aligns the screen and content gutter to Hoje at %ipx', async (width) => {
    const tree = await renderProgress()
    const root = tree.root.findAll((node) => node.type === 'View')[0]!
    const rootStyle = StyleSheet.flatten(root.props.style as ViewStyle)
    const viewport = Yoga.Node.create()
    const screen = Yoga.Node.create()
    viewport.setWidth(width)
    viewport.setHeight(900)
    if (rootStyle.width === '100%') screen.setWidthPercent(100)
    if (rootStyle.maxWidth !== undefined) screen.setMaxWidth(rootStyle.maxWidth as number)
    if (rootStyle.alignSelf === 'center') screen.setAlignSelf(Yoga.ALIGN_CENTER)
    viewport.insertChild(screen, 0)
    try {
      viewport.calculateLayout(width, 900, Yoga.DIRECTION_LTR)
      const sections = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'progress-sections')[0]!
      const content = StyleSheet.flatten(sections.props.style as ViewStyle)
      expect(screen.getComputedLeft() + Number(content.paddingHorizontal)).toBe((width - Math.min(width, 740)) / 2 + 16)
      expect(screen.getComputedWidth()).toBe(Math.min(width, 740))
    } finally {
      viewport.freeRecursive()
    }
  })

  it('uses the display family for the streak and the complete freeze bank figure', async () => {
    const tree = await renderProgress()
    const streak = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === '4')[0]!
    expect(StyleSheet.flatten(streak.props.style as TextStyle).fontFamily).toBe('SpaceGrotesk_600SemiBold')
    const bank = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'freeze-bank')[0]!
    const denominator = bank.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && Array.isArray(node.props.children) && node.props.children[0] === '/ ')[0]!
    expect(StyleSheet.flatten(denominator.props.style as TextStyle).fontFamily).toBe('SpaceGrotesk_500Medium')
    expect(StyleSheet.flatten(denominator.parent!.props.style as TextStyle).fontFamily).toBe('SpaceGrotesk_500Medium')
  })

  it('opens Progresso with its drawn sections and no Wrapped entry', async () => {
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'profile.wrappedTitle')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.children === 'profile.wrappedHint')).toHaveLength(0)
    const headings = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.accessibilityRole === 'header')
    expect(headings[0]?.props.children).toBe('progressScreen.title')
    expect(headings[1]?.props.children).toBe('progressScreen.sections.streak')
  })

  it.each(['dark', 'light'] as const)('keeps goal metadata legible in resting and pressed states in %s', async (mode) => {
    theme.mode = mode
    mocks.goals.data.allGoals = [createMockGoal()]
    const tree = await renderProgress()
    const findCard = () => findGoalCard(tree.root, 'Read 12 Books')
    let card = findCard()
    const metadata = card.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && typeof node.props.children === 'string' && node.props.children.startsWith('progressScreen.goals.progress'))[0]!
    const foreground = StyleSheet.flatten(metadata.props.style as TextStyle).color as string
    const tokens = createTokensV2('purple', mode)
    const restingSurface = StyleSheet.flatten(card.props.style as ViewStyle).backgroundColor as string
    expect(contrastOnSurface(foreground, [tokens.bg, restingSurface]), 'resting').toBeGreaterThanOrEqual(4.5)
    await TestRenderer.act(() => (card.props.onPressIn as (event: unknown) => void)({}))
    card = findCard()
    const pressedSurface = StyleSheet.flatten(card.props.style as ViewStyle).backgroundColor as string
    expect(contrastOnSurface(foreground, [tokens.bg, pressedSurface]), 'pressed').toBeGreaterThanOrEqual(4.5)
  })

  it('shows canonical press feedback and the granted lifted drag state', async () => {
    const goal = createMockGoal()
    mocks.goals.data.allGoals = [goal]
    const tree = await renderProgress()
    const findCard = () => findGoalCard(tree.root, goal.title)
    const tokens = createTokensV2('purple', theme.mode)

    let card = findCard()
    const resting = StyleSheet.flatten(card.props.style as ViewStyle) as ViewStyle & { transition?: string }
    expect(resting).toMatchObject({ backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost, transform: [{ scale: 1 }] })
    expect(resting.transition).toContain('transform 150ms cubic-bezier(0.16, 1, 0.3, 1)')
    await TestRenderer.act(() => (card.props.onPressIn as (event: unknown) => void)({}))
    card = findCard()
    expect(StyleSheet.flatten(card.props.style as ViewStyle)).toMatchObject({ backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] })

    mocks.dragActive = true
    await TestRenderer.act(async () => { tree.update(<ProgressScreen />); await Promise.resolve() })
    card = findCard()
    expect(StyleSheet.flatten(card.props.style as ViewStyle)).toMatchObject({
      borderColor: tokens.hairlineStrong,
      elevation: 4,
      opacity: 0.5,
      transform: [{ scale: 0.96 }],
      zIndex: 2,
    })

    mocks.dragActive = false
    await TestRenderer.act(async () => { tree.update(<ProgressScreen />); await Promise.resolve() })
    expect(StyleSheet.flatten(findCard().props.style as ViewStyle)).not.toMatchObject({ opacity: 0.5, zIndex: 2 })
  })

  it.each(['on_track', 'at_risk', 'behind', 'no_deadline'])('renders one neutral tracking badge for %s without status or deadline', async (trackingStatus) => {
    mocks.goals.data.allGoals = [createMockGoal({ trackingStatus, deadline: '2026-08-01' })]
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, 'Read 12 Books')
    expect(card.findAll((node) => node.props.children === 'goals.status.active')).toHaveLength(0)
    expect(card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'badge-solid')).toHaveLength(1)
    expect(card.findAll((node) => typeof node.props.children === 'string' && node.props.children.startsWith('progressScreen.goals.daysOverdue'))).toHaveLength(0)
  })

  it('describes each goal state, progress and reorder position', async () => {
    mocks.goals.data.allGoals = [
      createMockGoal({ id: 'active', title: 'Active goal', trackingStatus: 'on_track', position: 0 }),
      createMockGoal({ id: 'completed', title: 'Completed goal', status: 'Completed', currentValue: 8, targetValue: 10, progressPercentage: 80, position: 1 }),
      createMockGoal({ id: 'abandoned', title: 'Abandoned goal', status: 'Abandoned', position: 2 }),
      createMockGoal({ id: 'reached', title: 'Reached goal', currentValue: 10, targetValue: 10, progressPercentage: 100, position: 3 }),
    ]
    const tree = await renderProgress()
    const labels = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')
      .map((node) => node.props.accessibilityLabel)

    expect(labels).toEqual(expect.arrayContaining([
      'progressScreen.goals.accessibleLabel:{"title":"Active goal","state":"goals.metrics.onTrack","progress":"progressScreen.goals.progress:{\\"current\\":3,\\"target\\":12,\\"unit\\":\\"books\\"}","position":"progressScreen.goals.position:{\\"position\\":1,\\"total\\":4}"}',
      'progressScreen.goals.accessibleLabel:{"title":"Completed goal","state":"goals.status.completed","progress":"progressScreen.goals.progress:{\\"current\\":8,\\"target\\":10,\\"unit\\":\\"books\\"}","position":"progressScreen.goals.position:{\\"position\\":2,\\"total\\":4}"}',
      'progressScreen.goals.accessibleLabelWithoutProgress:{"title":"Abandoned goal","state":"goals.status.abandoned","position":"progressScreen.goals.position:{\\"position\\":3,\\"total\\":4}"}',
      'progressScreen.goals.accessibleLabel:{"title":"Reached goal","state":"progressScreen.goals.targetReached","progress":"progressScreen.goals.progress:{\\"current\\":10,\\"target\\":10,\\"unit\\":\\"books\\"}","position":"progressScreen.goals.position:{\\"position\\":4,\\"total\\":4}"}',
    ]))
  })

  it('retargets an already-mounted goal card ring when progress changes', async () => {
    const goal = createMockGoal({ progressPercentage: 25 })
    mocks.goals.data.allGoals = [goal]
    const timing = vi.spyOn(ReactNative.Animated, 'timing')
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, goal.title)
    const ring = card.findAll((node) => node.props.accessibilityRole === 'progressbar')[0]!
    const svg = ring.findAll((node) => node.type === 'Svg')[0]!
    await TestRenderer.act(() => (svg.props.onLayout as () => void)())

    mocks.goals.data.allGoals = [{ ...goal, currentValue: 6, progressPercentage: 50 }]
    await TestRenderer.act(() => tree.update(<ProgressScreen />))

    const updatedCard = findGoalCard(tree.root, goal.title)
    const updatedRing = updatedCard.findAll((node) => node.props.accessibilityRole === 'progressbar')[0]!
    expect(updatedRing).toBe(ring)
    expect(updatedRing.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 })
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toValue: Math.PI * 20.625,
        duration: 220,
        useNativeDriver: false,
      }),
    )
  })

  it('filters the same goal list through all four views', async () => {
    mocks.goals.data.allGoals = [
      createMockGoal({ id: 'active', title: 'Active goal', status: 'Active', position: 0 }),
      createMockGoal({ id: 'completed', title: 'Completed goal', status: 'Completed', position: 1 }),
      createMockGoal({ id: 'abandoned', title: 'Abandoned goal', status: 'Abandoned', position: 2 }),
    ]
    const tree = await renderProgress()
    const cards = () => tree.root.findAll((node) => node.type === 'Pressable'
      && ['Active goal', 'Completed goal', 'Abandoned goal'].some((title) => String(node.props.accessibilityLabel).includes(`\"title\":\"${title}\"`)))

    expect(cards()).toHaveLength(3)
    for (const [view, visible] of [
      ['active', 'Active goal'],
      ['completed', 'Completed goal'],
      ['abandoned', 'Abandoned goal'],
    ] as const) {
      await selectGoalFilter(tree, view)
      expect(cards()).toHaveLength(1)
      expect(cards()[0]!.props.accessibilityLabel).toContain(`\"title\":\"${visible}\"`)
    }
    await selectGoalFilter(tree, 'all')
    expect(cards()).toHaveLength(3)
  })

  it('ignores goal colour, icon and emoji adornments from an oversized response', async () => {
    const goal = createMockGoal()
    mocks.goals.data.allGoals = [goal]
    const tree = await renderProgress()
    const findCard = () => findGoalCard(tree.root, goal.title)
    const unadorned = captureGoalCardRendering(findCard())
    mocks.goals.data.allGoals = [{ ...goal, color: 'blue', emoji: '🎯', icon: 'target' }]
    await TestRenderer.act(async () => {
      tree.update(<ProgressScreen />)
      await Promise.resolve()
    })
    const oversized = captureGoalCardRendering(findCard())

    expect.soft(oversized.structure).toEqual(unadorned.structure)
    expect.soft(oversized.styles).toEqual(unadorned.styles)
  })

  it('renders a reached target as a done disc with one badge and no finish entry', async () => {
    mocks.goals.data.allGoals = [createMockGoal({ progressPercentage: 100, currentValue: 12, trackingStatus: 'no_deadline' })]
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, 'Read 12 Books')
    expect(card.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    expect(card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'status-ring')).toHaveLength(1)
    expect(card.findAll((node) => node.props.children === 'progressScreen.goals.targetReached').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.finish')).toHaveLength(0)
    expect(mocks.updateStatus.mutate).not.toHaveBeenCalled()
  })

  it('renders abandoned goals with an outline badge and a distinct clearable empty filter', async () => {
    mocks.goals.data.allGoals = [createMockGoal({ status: 'Abandoned', progressPercentage: 100, trackingStatus: 'behind' })]
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, 'Read 12 Books')
    expect(card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'badge-outline')).toHaveLength(1)
    expect(card.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    await selectGoalFilter(tree, 'completed')
    const line = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'progressScreen.goals.filterEmpty')[0]!
    expect(StyleSheet.flatten(findGoalEmptyWell(line).props.style as ViewStyle)).toMatchObject({ backgroundColor: createTokensV2('purple', theme.mode).bgWell, borderRadius: 12, padding: 16, gap: 8, alignItems: 'flex-start' })
    expect(StyleSheet.flatten(line.props.style as TextStyle)).toMatchObject({ color: createTokensV2('purple', theme.mode).fg2, fontSize: 14 })
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.empty')).toHaveLength(0)
    await TestRenderer.act(() => (findPill(tree.root, 'progressScreen.goals.clearFilter').props.onPress as () => void)())
    expect(findGoalCard(tree.root, 'Read 12 Books')).toBeDefined()
  })

  it('cancels touch movement beyond 5px before the 300ms hold and never writes while filtered', async () => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, 'Read 12 Books')
    const touch = (name: string, pageX: number) => (card.props[name] as ((event: unknown) => void) | undefined)?.({ nativeEvent: { pageX, pageY: 0, touches: [{ pageX, pageY: 0 }] } })
    await TestRenderer.act(() => { touch('onTouchStart', 0); touch('onTouchMove', 6); vi.advanceTimersByTime(300); touch('onLongPress', 6) })
    expect(mocks.drag).not.toHaveBeenCalled()
    await TestRenderer.act(() => { touch('onTouchStart', 0); touch('onTouchMove', 5); vi.advanceTimersByTime(299) })
    expect(mocks.drag).not.toHaveBeenCalled()
    await TestRenderer.act(() => vi.advanceTimersByTime(1))
    expect(mocks.drag).toHaveBeenCalledTimes(1)
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
    await selectGoalFilter(tree, 'active')
    expect(tree.root.findAll((node) => node.type === 'DraggableFlatList')).toHaveLength(0)
    expect(findGoalCard(tree.root, 'Read 12 Books').props.accessibilityActions).toBeUndefined()
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
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
    const card = findGoalCard(tree.root, goal.title)
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
    useChatStore.setState({ draft: '', contextualSuggestion: null })
    useUIStore.getState().setAstraConversationOpen(false)
    theme.mode = 'dark'
    mocks.dragActive = false
    mocks.account.profile.timeZone = 'America/Sao_Paulo'
    vi.clearAllMocks()
    for (const query of [mocks.account, mocks.goals, mocks.gamification]) {
      query.isLoading = false
      query.isError = false
    }
    mocks.gamification.error = {
      status: 500,
      data: { error: 'Server error', errorCode: 'INTERNAL_SERVER_ERROR' },
    }
    Object.assign(mocks.account.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150 })
    Object.assign(mocks.gamification.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150, achievementsEarned: 0 })
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = true
    mocks.goals.data.allGoals = []
    mocks.gamification.profile.achievements = []
    mocks.freeze.isFrozenToday = false
    Object.assign(mocks.freeze.streakInfo, {
      currentStreak: 4,
      recentFreezeDates: [],
      lastActiveDate: null,
      isRepairAvailable: false,
      repairDate: null,
      repairableGapDates: undefined,
      lastFreezeCoveredDate: null,
      freezeBankRemaining: null,
      streakFreezesAccumulated: 2,
      maxStreakFreezesAccumulated: 3,
      daysUntilNextFreeze: 3,
    })
    delete (mocks.freeze.streakInfo as typeof mocks.freeze.streakInfo & { lastFreezeCoveredOrigin?: string | null }).lastFreezeCoveredOrigin
    mocks.freeze.streakQuery.isError = false
    mocks.freeze.freezesAvailable = 2
    mocks.freeze.streakFreezesAccumulated = 2
    mocks.freeze.maxStreakFreezesAccumulated = 3
    mocks.freeze.daysUntilNextFreeze = 3
    mocks.repair.isError = false
    mocks.repair.error = null
    mocks.reorder.isPending = false
    mocks.reorder.isError = false
    mocks.streakSnapshotZones = null
    mocks.retrospective.isLoading = false
    mocks.retrospective.isError = false
    mocks.retrospective.error = null
    mocks.retrospective.data.metrics.weeklyConsistency = [10, 20, 30, 80, 50, 60, 70]
    mocks.retrospective.data.metrics.topHabits = [{ name: 'Read', emoji: null as string | null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false, habitId: undefined }]
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
    expect(pillButtons(tree.root)).toHaveLength(0)
    let tileRow = units[2]!.parent!
    while (StyleSheet.flatten<ViewStyle>(tileRow.props.style ?? {}).flexDirection !== 'row') tileRow = tileRow.parent!
    expect(StyleSheet.flatten(tileRow.props.style as ViewStyle).gap).toBe(16)
    let tileGrid = tileRow.parent!
    while (tileGrid.type !== 'View') tileGrid = tileGrid.parent!
    expect(StyleSheet.flatten(tileGrid.props.style as ViewStyle).gap).toBe(16)
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
    expect(pillButtons(tree.root)).toHaveLength(1)
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.retry').props.onPress as () => void)()
    })
    for (const request of [mocks.account, mocks.goals, mocks.gamification]) expect(request.refetch).toHaveBeenCalledTimes(1)
    mocks[query].isError = false
    const recovered = await renderProgress()
    expect(recovered.root.findAll((node) => node.props.testID === 'error-state')).toHaveLength(0)
    expect(recovered.root.findAll((node) => node.props.children === 'progressScreen.sections.streak').length).toBeGreaterThan(0)
  })

  it.each([[412, 'primary'], [768, 'secondary']] as const)('renders the global retry as a %ipx %s button', async (width, variant) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 892, scale: 1, fontScale: 1 })
    mocks.account.isError = true
    const tree = await renderProgress()

    expect(findPill(tree.root, 'progressScreen.retry').props.testID).toBe(`button-${variant}-sm`)
    dimensions.mockRestore()
  })

  it('shows a retryable error even while another resource is loading', async () => {
    mocks.account.isError = true
    mocks.goals.isLoading = true
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'error-state')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
  })

  it('leaves retry when gamification access is revoked after an error', async () => {
    mocks.gamification.isError = true
    const initial = await renderProgress()
    expect(initial.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'error-state')).toHaveLength(1)

    mocks.account.profile.canViewGamification = false
    mocks.account.profile.hasProAccess = false
    const changed = await renderProgress()
    const text = changed.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(changed.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'error-state')).toHaveLength(0)
    expect(text).toContain('progressScreen.streak.lockedBody')
  })

  it('retries gamification when the account capability hint is false', async () => {
    mocks.account.profile.canViewGamification = false
    mocks.goals.isError = true
    const tree = await renderProgress()
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.retry').props.onPress as () => void)()
    })
    expect(mocks.account.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.goals.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.gamification.refetch).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('renders one orbital empty invitation for Pro access %s', async (hasProAccess) => {
    mocks.account.profile.hasProAccess = hasProAccess
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.empty').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'empty-state-mark-orbit')).toHaveLength(1)
    expect(pillButtons(tree.root)).toHaveLength(1)
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.goals.createAction').props.onPress as () => void)()
    })
    expect(useChatStore.getState().draft).toBe('progressScreen.goals.request')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.sections.streak')).toHaveLength(0)
  })

  it.each([[412, 'button-primary-sm'], [768, 'button-secondary-sm']] as const)('renders the global goal action at %ipx as %s', async (width, testID) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 892, scale: 1, fontScale: 1 })
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    const tree = await renderProgress()

    expect(findPill(tree.root, 'progressScreen.goals.createAction').props.testID).toBe(testID)
    dimensions.mockRestore()
  })

  it('starts a goal request from the in-section goals-empty action', async () => {
    const tree = await renderProgress()

    const action = findPill(tree.root, 'progressScreen.goals.createAction')
    expect(action.props.testID).toBe('button-primary-sm')
    expect(findGoalsSection(tree.root).findAll((node) => typeof node.type === 'string' && node.props.testID === 'empty-state-mark-orbit')).toHaveLength(0)
    const line = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'progressScreen.goals.empty')[0]!
    expect(StyleSheet.flatten(findGoalEmptyWell(line).props.style as ViewStyle)).toMatchObject({ backgroundColor: createTokensV2('purple', theme.mode).bgWell, borderRadius: 12, padding: 16, gap: 8, alignItems: 'flex-start' })
    expect(StyleSheet.flatten(line.props.style as TextStyle)).toMatchObject({ color: createTokensV2('purple', theme.mode).fg2, fontSize: 14 })
    const style = action.props.style as (state: { pressed: boolean }) => ViewStyle[]
    expect(StyleSheet.flatten(style({ pressed: false })).minHeight).toBe(48)
    ;(action.props.onPress as () => void)()
    expect(useChatStore.getState().draft).toBe('progressScreen.goals.request')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('keeps an unsent Astra draft when starting a goal', async () => {
    useChatStore.getState().setDraft('Unsent note')
    const tree = await renderProgress()

    ;(findPill(tree.root, 'progressScreen.goals.createAction').props.onPress as () => void)()
    expect(useChatStore.getState().draft).toBe('Unsent note')
    expect(useChatStore.getState().contextualSuggestion).toEqual({
      id: 'progress-create-goal',
      label: 'progressScreen.goals.createAction',
      prompt: 'progressScreen.goals.request',
    })
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    mocks.goals.data.allGoals = [createMockGoal()]
    await TestRenderer.act(async () => {
      tree.update(<ProgressScreen />)
      await Promise.resolve()
    })
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
  })

  it.each(['goal', 'longestStreak', 'xp', 'achievement'] as const)('keeps existing %s records visible after the current streak resets', async (record) => {
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    if (record === 'goal') mocks.goals.data.allGoals = [createMockGoal()]
    if (record === 'longestStreak') mocks.account.profile.longestStreak = 9
    if (record === 'xp') mocks.account.profile.totalXp = 150
    if (record === 'achievement') mocks.gamification.profile.achievementsEarned = 1
    const tree = await renderProgress()
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.empty').length > 0).toBe(record !== 'goal')
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.sections.streak').length).toBeGreaterThan(0)
  })

  it('renders the API figures and names every region from its heading once', async () => {
    const tree = await renderProgress()
    const labels = [
      'progressScreen.sections.streak',
      'progressScreen.sections.goals',
      'progressScreen.sections.window',
      'progressScreen.sections.achievements',
    ]
    for (const label of labels) {

      const headings = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.accessibilityRole === 'header' && node.props.children === label)
      expect(headings, label).toHaveLength(1)
      const heading = headings[0]!

      /** No ancestor re-names the section, which is the "named twice" half of the defect. */
      for (let ancestor = heading.parent; ancestor; ancestor = ancestor.parent) {
        expect(ancestor.props.accessibilityLabel, label).not.toBe(label)
        expect(ancestor.props.accessibilityLabelledBy, label).toBeUndefined()
      }
    }
    const sectionHeadings = labels.map((label) => tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants'
      && node.props.accessibilityRole === 'header' && node.props.children === label)[0]!)
    expect(StyleSheet.flatten(sectionHeadings[3]!.props.style as TextStyle)).toEqual(
      StyleSheet.flatten(sectionHeadings[1]!.props.style as TextStyle),
    )
    const figures = tree.root.findAll((node) => node.type === 'StatTile' && String(node.props.label).startsWith('progressScreen.window.'))
      .map((node) => ({ label: node.props.label, value: node.props.value }))
    expect(figures).toEqual([
      { label: 'progressScreen.window.completionRate', value: '75%' },
      { label: 'progressScreen.window.activeDays', value: 12 },
      { label: 'progressScreen.window.bestWeekday', value: 'dates.daysAbbreviated.thursday' },
    ])
  })

  it('gives a long emoji habit the full static row and accessible title', async () => {
    const name = 'Read a long chapter title before the morning conversation '.repeat(5)
    mocks.retrospective.data.metrics.topHabits[0]!.name = name
    mocks.retrospective.data.metrics.topHabits[0]!.emoji = '📚'
    const tree = await renderProgress()
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'progress-top-habit')[0]!
    const title = row.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.accessibilityLabel === name)[0]!
    expect(title.props.children).toBe(name)
    expect(row.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === '📚')).toHaveLength(1)
    expect(title.props.numberOfLines).toBe(1)
    expect(title.props.selectable).toBe(true)
    expect(row.props.accessibilityRole).toBe('button')
  })

  it.each([320, 412].flatMap((width) => ['en', 'pt-BR'].flatMap((language) =>
    [undefined, 'a08892c2-9a7c-4dc9-b70f-388be528420e'].map((habitId) => ({ width, language, habitId })),
  )))('keeps the top habit label whole and title full width at $width pt ($language, $habitId)', async ({ width, language, habitId }) => {
    await i18n.changeLanguage(language)
    mocks.usePortugueseCatalog = true
    try {
      const name = 'Read a long chapter before discussing it with the reading group '.repeat(5)
      Object.assign(mocks.retrospective.data.metrics.topHabits[0]!, { name, habitId })
      const tree = await renderProgress()
      const hosts = tree.toJSON()
      const row = (Array.isArray(hosts) ? hosts : hosts ? [hosts] : []).map(findProgressHabitHost).find(Boolean)!
      for (const scale of [1, 2]) {
        const geometry = measureProfileRow(row, width - 32, scale)
        const label = geometry.texts.find((text) => text.label === i18n.t('progressScreen.window.topHabit'))!
        const title = geometry.texts.find((text) => text.label === name)!
        expect(label.lines).toBe(1)
        expect(label.clipped).toBe(false)
        expect(label.right).toBeLessThanOrEqual(width - 48 - (habitId ? 36 : 0))
        expect(title.left).toBe(16)
        expect(title.right).toBe(width - 48)
        expect(title.lines).toBeLessThanOrEqual(2)
        expect(title.clipped).toBe(true)
        expect(geometry.height).toBeGreaterThanOrEqual(68)
      }
    } finally { mocks.usePortugueseCatalog = false; await i18n.changeLanguage('en') }
  })

  it('opens the top habit using the response id when ranked habits share a title', async () => {
    const habitId = 'a08892c2-9a7c-4dc9-b70f-388be528420e'
    const topHabit = mocks.retrospective.data.metrics.topHabits[0]!
    const response = retrospectiveResponseSchema.parse({ ...mocks.retrospective.data,
      metrics: { ...mocks.retrospective.data.metrics, topHabits: [
        { ...topHabit, habitId },
        { ...topHabit, habitId: 'c61da295-ea54-409c-84ec-5e0dca97a73f' },
      ] },
    })
    Object.assign(topHabit, response.metrics.topHabits[0])
    const tree = await renderProgress()
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'progress-top-habit')[0]
    expect(row).toBeDefined()
    expect(row!.props.accessibilityRole).toBe('link')
    expect(row!.props.accessibilityLabel).toContain('Read')
    await TestRenderer.act(() => { (row!.props.onPress as () => void)() })
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/habits/[id]', params: { id: habitId } })
  })

  it.each([undefined, null])('keeps a top habit without an id static (%s)', async (habitId) => {
    mocks.retrospective.data.metrics.topHabits[0]!.habitId = habitId
    const tree = await renderProgress()
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'progress-top-habit')[0]!
    expect(row.props.accessibilityRole).toBe('button')
    await TestRenderer.act(() => { (row.props.onPress as () => void)() })
    expect(row.props.accessibilityState).toMatchObject({ expanded: true })
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('discloses the streak legend and keeps the top habit outside the figures', async () => {
    const tree = await renderProgress()
    const figures = tree.root.findAll((node) => node.type === 'StatTile' && String(node.props.label).startsWith('progressScreen.window.'))
    expect(figures).toHaveLength(3)
    expect(figures[2]!.props.value).toBe('dates.daysAbbreviated.thursday')
    const habit = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'progress-top-habit')[0]!
    expect(habit.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === 'Read')).toHaveLength(1)
    expect(habit.props.accessibilityRole).toBe('button')
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === 'progressScreen.streak.active')).toHaveLength(0)
    const entry = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'progressScreen.streak.legend')[0]!
    const pill = tree.root.findAll((node) => node.type === PillButton && node.props.label === 'progressScreen.streak.legend')[0]!
    expect(pill.props).toMatchObject({ variant: 'ghost', size: 'sm', iconOnly: true })
    const tokens = createTokensV2('purple', theme.mode)
    const entryStyle = (pressed = false) => StyleSheet.flatten((entry.props.style as (state: { pressed: boolean }) => ViewStyle[])({ pressed }))
    expect(entryStyle()).toMatchObject({ width: 48, height: 48, borderWidth: 1.5, borderColor: tokens.hairlineStrong, backgroundColor: 'transparent' })
    expect(entryStyle().borderRadius).toBeGreaterThanOrEqual(24)
    expect(entryStyle(true).backgroundColor).toBe(tokens.bgHover)
    expect(entry.props.onHoverIn).toBeTypeOf('function')
    await TestRenderer.act(() => { (entry.props.onHoverIn as () => void)() })
    expect(entryStyle().backgroundColor).toBe(tokens.bgHover)
    expect(entryStyle().transform).toBeUndefined()
    await TestRenderer.act(() => { (entry.props.onHoverOut as () => void)() })
    expect(entryStyle().backgroundColor).toBe('transparent')
    expect(entry.props.accessibilityState).toMatchObject({ expanded: false })
    await TestRenderer.act(() => { (entry.props.onPress as () => void)() })
    expect(entry.props.accessibilityState).toMatchObject({ expanded: true })
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === 'progressScreen.streak.active')).toHaveLength(1)
  })

  it('renders pay-gate refusals as the three locked sections', async () => {
    mocks.account.profile.hasProAccess = false
    Object.assign(mocks.account.profile, { streakFreezesAvailable: 3 })
    mocks.gamification.isError = true
    mocks.gamification.error = {
      status: 403,
      data: { error: 'Gamification is a Pro feature. Upgrade to unlock!', errorCode: 'PAY_GATE' },
    }
    mocks.retrospective.isError = true
    mocks.retrospective.error = { status: 403, data: { errorCode: 'PAY_GATE' } }
    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.streak.lockedBody',
      'progressScreen.window.lockedBody',
      'progressScreen.achievements.lockedBody',
    ]))
    expect(text).not.toContain('progressScreen.streak.bankFull:{"count":3}')
    expect(text).not.toContain('progressScreen.streak.gapTitle')
    const lockedCards = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'progress-locked-card')
    expect(lockedCards).toHaveLength(3)
    expect(lockedCards.map((card) => StyleSheet.flatten(card.props.style as ViewStyle).padding)).toEqual([16, 16, 16])
    expect(lockedCards.map((card) => StyleSheet.flatten(card.props.style as ViewStyle).borderColor)).toEqual([
      createTokensV2('purple', 'dark').hairlineGhost,
      createTokensV2('purple', 'dark').hairlineGhost,
      createTokensV2('purple', 'dark').hairlineGhost,
    ])
    for (const card of lockedCards) {
      expect(pillButtons(card)).toHaveLength(1)
      expect(pillButtons(card)[0]?.props.testID).toBe('button-ghost-sm')
    }
    expect(tree.root.findAll((node) => node.type === 'ProBadge')).toHaveLength(3)
    const labels = tree.root.findAll((node) => node.type === 'StatTile').map((node) => node.props.label)
    expect(labels).toContain('progressScreen.streak.longest')
    expect(labels).toContain('streakDisplay.detail.tierTileLabel')
    const route = findPill(tree.root, 'progressScreen.window.lockedAction')
    const routeProps = route.props as Readonly<{ onPress?: unknown; disabled?: boolean; accessibilityState?: { disabled?: boolean } }>
    expect(routeProps.onPress).toEqual(expect.any(Function))
    expect(routeProps.disabled).not.toBe(true)
    expect(routeProps.accessibilityState?.disabled).not.toBe(true)
    await TestRenderer.act(() => {
      ;(routeProps.onPress as () => void)()
    })
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/upgrade', params: { from: '/progress' } })
  })

  it('keeps the Pro window locked when free gamification succeeds but retrospective returns PAY_GATE', async () => {
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = false
    mocks.retrospective.isError = true
    mocks.retrospective.error = {
      status: 403,
      data: { errorCode: 'PAY_GATE' },
    }

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toEqual(expect.arrayContaining([
      'progressScreen.streak.currentLabel:{"count":4}',
      'progressScreen.sections.goals',
    ]))
    expect(text).not.toContain('progressScreen.streak.lockedBody')
    expect(text).not.toContain('progressScreen.achievements.lockedBody')
    expect(text).toContain('progressScreen.window.lockedBody')
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'progress-xp-summary')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'StatTile' && node.props.value === '75%')).toHaveLength(0)
    expect(mocks.gamificationEnabled).toHaveBeenCalledWith(true)
  })

  it('renders a server-authorized window for a free account', async () => {
    mocks.account.profile.hasProAccess = false

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(tree.root.findAll((node) => node.type === 'StatTile' && node.props.value === '75%')).toHaveLength(1)
    expect(text).not.toContain('progressScreen.window.lockedBody')
  })

  it('renders a retryable window error when a free retrospective request fails', async () => {
    mocks.account.profile.hasProAccess = false
    mocks.retrospective.isError = true
    mocks.retrospective.error = { status: 500, data: { errorCode: 'INTERNAL_SERVER_ERROR' } }

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'error-state')).toHaveLength(1)
    expect(text).not.toContain('progressScreen.window.lockedBody')
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.retry').props.onPress as () => void)()
    })
    expect(mocks.retrospective.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders empty weekly and habit figures without substituting unrelated totals', async () => {
    mocks.retrospective.data.metrics.weeklyConsistency = []
    mocks.retrospective.data.metrics.topHabits = []

    const tree = await renderProgress()
    const emptyFigures = tree.root.findAll((node) => node.type === 'StatTile' && node.props.state === 'empty')
    expect(emptyFigures).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'StatTile' && node.props.value === 18)).toHaveLength(0)
  })

  it.each([[320, 1, 1], [360, 1, 2], [384, 1, 2], [412, 1, 2], [768, 1, 3], [320, 2, 1], [360, 2, 1], [384, 2, 1], [412, 2, 1]] as const)('at %ipx and text scale %i lays out the figures in %i columns', async (width, fontScale, columns) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 892, scale: 1, fontScale })
    const tree = await renderProgress()
    const rows = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'progress-window-row')
    expect(rows).toHaveLength(Math.ceil(3 / columns))
    for (const row of rows) {
      expect(row.findAll((node) => node.type === 'StatTile')).toHaveLength(Math.min(columns, 3 - rows.indexOf(row) * columns))
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
    const earnedHost = earned.findAll((node) => typeof node.type === 'string' && node.props.testID === 'achievement-tile-first_orbit')[0]!
    let achievementGrid = earnedHost.parent!
    while (typeof achievementGrid.type !== 'string') achievementGrid = achievementGrid.parent!
    const onLayout = achievementGrid.props.onLayout
    if (typeof onLayout === 'function') await TestRenderer.act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 708, height: 0 } } }))
    const row = Yoga.Node.create()
    row.setWidth(708)
    row.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
    row.setGap(Yoga.GUTTER_ALL, Number(StyleSheet.flatten(achievementGrid.props.style as ViewStyle).gap))
    const tileNodes = [earned, progressive].map((tile, index) => {
      const node = Yoga.Node.create()
      const tileWidth = StyleSheet.flatten(tile.props.style as ViewStyle).width
      if (typeof tileWidth === 'number') node.setWidth(tileWidth)
      else if (typeof tileWidth === 'string' && tileWidth.endsWith('%')) node.setWidthPercent(Number.parseFloat(tileWidth))
      row.insertChild(node, index)
      return node
    })
    try {
      row.calculateLayout(undefined, undefined)
      expect(Math.abs(tileNodes[1]!.getComputedLeft() + tileNodes[1]!.getComputedWidth() - 708)).toBeLessThanOrEqual(0.5)
    } finally { row.freeRecursive() }
    expect(earned.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    expect(progressive.findAll((node) => node.props.accessibilityRole === 'progressbar').length).toBeGreaterThan(0)
    const completedProgressBar = completedProgress.findAll((node) => node.props.accessibilityRole === 'progressbar')[0]!
    expect(completedProgressBar.props.accessibilityValue).toEqual({ min: 0, max: 30, now: 30 })
    expect(completedProgressBar.props.testID).toBe('progress-bar-complete')
    const earnedMark = earned.findAll((node) => node.props.testID === 'achievement-mark-earned')[0]!
    const unearnedMark = progressive.findAll((node) => node.props.testID === 'achievement-mark-unearned')[0]!
    expect(earnedMark.props.accessibilityLabel).toBe('progressScreen.achievements.earnedState:{"name":"gamification.achievements.first_orbit.name"}')
    expect(unearnedMark.props.accessibilityLabel).toBe('progressScreen.achievements.unearnedState:{"name":"gamification.achievements.week_warrior.name"}')
    const earnedStyle = StyleSheet.flatten(earnedMark.props.style as ViewStyle)
    const unearnedStyle = StyleSheet.flatten(unearnedMark.props.style as ViewStyle)
    expect(earnedStyle.backgroundColor).toBe(createTokensV2('purple', 'dark').statusDone)
    expect(earnedStyle.borderWidth).toBeUndefined()
    expect(unearnedStyle.borderWidth).toBe(1.5)
    expect(unearnedStyle.backgroundColor).toBeUndefined()
    expect(earned.findAll((node) => node.props.children === 'progressScreen.achievements.earnedLabel').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'gamification.achievements.first_friend.name')).toHaveLength(0)

    dimensions.mockReturnValue({ width: 412, height: 892, scale: 1, fontScale: 1 })
    const compactTree = await renderProgress()
    const compactTile = compactTree.root.findAll((node) => node.props.testID === 'achievement-tile-first_orbit')[0]!
    expect(StyleSheet.flatten(compactTile.props.style as ViewStyle).width).toBe('100%')
    dimensions.mockRestore()
  })

  it('renders a weekly two-occurrence gap without an action after the streak restarts today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 1
    mocks.freeze.streakInfo.longestStreak = 4
    mocks.freeze.streakInfo.lastActiveDate = '2026-09-10'
    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.gapUnavailable')
    expect(pillButtons(tree.root).filter((button) => button.findAll((node) => typeof node.props.children === 'string' && node.props.children.startsWith('progressScreen.streak.repairAction')).length > 0)).toHaveLength(0)
    expect(mocks.repair.mutate).not.toHaveBeenCalled()
  })

  it('offers the server-confirmed one-day repair as a neutral small button at wide width', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 800, height: 892, scale: 1, fontScale: 1 })
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'

    const tree = await renderProgress()
    const action = findPill(tree.root, 'progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}')

    expect(action.props.testID).toBe('button-secondary-sm')
    await TestRenderer.act(() => (action.props.onPress as () => void)())
    expect(mocks.repair.mutate).not.toHaveBeenCalled()
    const confirm = tree.root.findAll((node) => node.type === 'ConfirmSheet')[0]
    expect(confirm?.props.title).toBe('progressScreen.streak.repairConfirmTitle:{"dates":"Wednesday, Sep 9"}')
    await TestRenderer.act(() => (confirm?.props.onConfirm as () => void)())
    expect(mocks.repair.mutate).toHaveBeenCalledWith(['2026-09-09'])
    dimensions.mockRestore()
  })

  it('keeps the goal action as the only filled action when streak repair is available', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    const tree = await renderProgress()

    expect(findPill(tree.root, 'progressScreen.goals.createAction').props.testID).toBe('button-primary-sm')
    expect(findPill(tree.root, 'progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}').props.testID).toBe('button-secondary-sm')
  })

  it('shows the date and remaining bank after a freeze spend', async () => {
    mocks.freeze.streakInfo.lastFreezeCoveredDate = '2026-09-15'
    mocks.freeze.streakInfo.freezeBankRemaining = 2

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.covered:{"date":"Tuesday, Sep 15","count":2}')
  })

  it('names automatic coverage, then keeps a confirmed manual repair source-neutral', async () => {
    mocks.freeze.streakInfo.lastFreezeCoveredDate = '2026-09-15'
    mocks.freeze.streakInfo.freezeBankRemaining = 2
    Object.assign(mocks.freeze.streakInfo, { lastFreezeCoveredOrigin: 'automatic' })
    const tree = await renderProgress()
    const messages = () => tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(messages()).toContain('progressScreen.streak.automaticCovered:{"date":"Tuesday, Sep 15","count":2}')

    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    mocks.repair.mutate.mockImplementationOnce(() => {
      Object.assign(mocks.freeze.streakInfo, {
        lastFreezeCoveredDate: '2026-09-09',
        freezeBankRemaining: 1,
        lastFreezeCoveredOrigin: 'manual',
        isRepairAvailable: false,
      })
    })
    await TestRenderer.act(() => tree.update(<ProgressScreen />))
    const action = findPill(tree.root, 'progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}')
    await TestRenderer.act(() => (action.props.onPress as () => void)())
    const confirm = tree.root.findAll((node) => node.type === 'ConfirmSheet')[0]
    await TestRenderer.act(() => (confirm!.props.onConfirm as () => void)())
    expect(mocks.repair.mutate).toHaveBeenCalledWith(['2026-09-09'])

    await TestRenderer.act(() => tree.update(<ProgressScreen />))
    expect(messages()).toContain('progressScreen.streak.covered:{"date":"Wednesday, Sep 9","count":1}')
    expect(messages()).not.toContain('progressScreen.streak.automaticCovered:{"date":"Wednesday, Sep 9","count":1}')
  })

  it('makes no automatic claim when a manual repair returns the same lastFreezeCoveredDate', async () => {
    mocks.freeze.streakInfo.lastFreezeCoveredDate = '2026-09-09'
    mocks.freeze.streakInfo.freezeBankRemaining = 1
    mocks.freeze.streakInfo.isRepairAvailable = false
    Object.assign(mocks.freeze.streakInfo, { lastFreezeCoveredOrigin: 'manual' })

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.covered:{"date":"Wednesday, Sep 9","count":1}')
    expect(text.some((entry) => String(entry).includes('automaticCovered'))).toBe(false)
  })

  it.each([null, 'unknown'])('keeps %s freeze origin source-neutral', async (origin) => {
    Object.assign(mocks.freeze.streakInfo, {
      lastFreezeCoveredDate: '2026-09-09',
      freezeBankRemaining: 1,
      lastFreezeCoveredOrigin: origin,
    })

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.covered:{"date":"Wednesday, Sep 9","count":1}')
    expect(text.some((entry) => String(entry).includes('automaticCovered'))).toBe(false)
  })

  it('states coverage without claiming who spent the freeze, in both locales', () => {
    for (const locale of [i18n.getResourceBundle('en', 'translation'), i18n.getResourceBundle('pt-BR', 'translation')]) {
      const covered = locale.progressScreen.streak.covered
      expect(covered).toBeTypeOf('string')
      expect(covered).not.toMatch(/automatic|automátic|automatica|automaticamente/i)
    }
  })

  it('shows the no-freeze gap without an action or blame', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakInfo.repairableGapDates = ['2026-09-09']
    mocks.freeze.streakInfo.streakFreezesAccumulated = 0
    mocks.freeze.freezesAvailable = 0
    mocks.freeze.streakFreezesAccumulated = 0

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.gapBody:{"count":1}')
    expect(text).toContain('progressScreen.streak.repairEmpty')
    expect(pillButtons(tree.root).filter((button) => button.findAll((node) => node.props.children === 'progressScreen.streak.repairAction:{"count":1}').length > 0)).toHaveLength(0)
  })

  it('shows a partly funded gap without offering an unaffordable repair', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakInfo.repairableGapDates = ['2026-09-07', '2026-09-08', '2026-09-09']
    mocks.freeze.streakInfo.streakFreezesAccumulated = 2
    mocks.freeze.freezesAvailable = 2
    mocks.freeze.streakFreezesAccumulated = 2

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.gapBody:{"count":3}')
    expect(text).toContain('progressScreen.streak.repairPartial:{"needed":3,"banked":2}')
    expect(pillButtons(tree.root).filter((button) => button.findAll((node) => node.props.children === 'progressScreen.streak.repairAction:{"count":3}').length > 0)).toHaveLength(0)
  })

  it.each([
    { locale: 'en', banked: 1, expected: 'The gap is still open. It needs 3 freezes, but only 1 is banked. This repair offer ends today.' },
    { locale: 'en', banked: 2, expected: 'The gap is still open. It needs 3 freezes, but only 2 are banked. This repair offer ends today.' },
    { locale: 'pt-BR', banked: 1, expected: 'A lacuna continua em aberto. Ela precisa de 3 congelamentos, mas só há 1 guardado. Esta oferta de reparo termina hoje.' },
    { locale: 'pt-BR', banked: 2, expected: 'A lacuna continua em aberto. Ela precisa de 3 congelamentos, mas só há 2 guardados. Esta oferta de reparo termina hoje.' },
  ])('renders partly funded repair copy through mobile i18n in $locale with $banked banked', async ({ locale, banked, expected }) => {
    await i18n.changeLanguage(locale)
    try {
      expect(i18n.t('progressScreen.streak.repairPartial', { needed: 3, banked })).toBe(expected)
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it.each([
    { locale: 'en', expected: 'The gap is still open, but no freeze is banked to cover it. This repair offer ends today.' },
    { locale: 'pt-BR', expected: 'A lacuna continua em aberto, mas não há congelamento guardado para cobri-la. Esta oferta de reparo termina hoje.' },
  ])('renders empty-bank repair copy through mobile i18n in $locale', async ({ locale, expected }) => {
    await i18n.changeLanguage(locale)
    try {
      expect(i18n.t('progressScreen.streak.repairEmpty')).toBe(expected)
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows an unrepairable capped gap without promising another freeze', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakInfo.repairableGapDates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']
    mocks.freeze.streakInfo.streakFreezesAccumulated = 3
    mocks.freeze.freezesAvailable = 3
    mocks.freeze.streakFreezesAccumulated = 3
    mocks.freeze.maxStreakFreezesAccumulated = 3

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.repairCapped:{"needed":4,"banked":3}')
    expect(text).not.toContain('progressScreen.streak.repairPartial:{"needed":4,"banked":3}')
    expect(pillButtons(tree.root).filter((button) => button.findAll((node) => node.props.children === 'progressScreen.streak.repairAction:{"count":4}').length > 0)).toHaveLength(0)
  })

  it('shows the neutral bank limit and no next-freeze row', async () => {
    mocks.freeze.streakInfo.streakFreezesAccumulated = 3
    mocks.freeze.streakFreezesAccumulated = 3

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.streak.bankFull:{"count":3}')
    expect(text).not.toContain('progressScreen.streak.next')
  })

  it.each([
    [429, 'progressScreen.streak.repairRateLimited'],
    [500, 'progressScreen.streak.repairError'],
  ])('names repair failure status %i honestly', async (status, message) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    mocks.repair.isError = true
    mocks.repair.error = { status }

    const tree = await renderProgress()
    const alerts = tree.root.findAll((node) => node.props.accessibilityRole === 'alert')

    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.some((node) => node.props.children === message)).toBe(true)
  })

  it.each(['dark', 'light'] as const)('keeps the gap repair error legible on its well in %s', async (mode) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    theme.mode = mode
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    mocks.repair.isError = true
    mocks.repair.error = { status: 500 }

    const tree = await renderProgress()
    const alert = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.accessibilityRole === 'alert')[0]!
    const foreground = StyleSheet.flatten(alert.props.style as TextStyle).color as string
    const tokens = createTokensV2('purple', mode)

    expect(contrastOnSurface(foreground, [tokens.bg, tokens.bgWell])).toBeGreaterThanOrEqual(4.5)
  })

  it('does not render a failure after a repair conflict triggers read-back', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.lastActiveDate = '2026-09-07'
    mocks.repair.isError = true
    mocks.repair.error = { status: 409 }

    const tree = await renderProgress()

    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
  })

  it('shows the page invitation without requesting a window for a new account', async () => {
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0, achievementsEarned: 0 })
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    const tree = await renderProgress()
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)

    expect(text).toContain('progressScreen.goals.empty')
    expect(text).not.toContain('progressScreen.window.empty')
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
    expect(mocks.retrospectiveHook).not.toHaveBeenCalled()
    expect(mocks.retrospective.refetch).not.toHaveBeenCalled()
    expect(findPill(tree.root, 'progressScreen.goals.createAction').props.accessibilityRole).toBe('button')
    await TestRenderer.act(() => {
      ;(findPill(tree.root, 'progressScreen.goals.createAction').props.onPress as () => void)()
    })
    expect(useChatStore.getState().draft).toBe('progressScreen.goals.request')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(ptBR.progressScreen.goals.createAction).toBe('Criar meta')
    expect(en.progressScreen.goals.createAction).toBe('Create goal')
  })

  it('shows the window empty state when an account with progress has no habits in the period', async () => {
    const retrospectiveData = mocks.retrospective.data
    mocks.retrospective.data = null as unknown as typeof mocks.retrospective.data
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    try {
      const tree = await renderProgress()
      const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
      expect(text).toEqual(expect.arrayContaining([
        'progressScreen.sections.streak',
        'progressScreen.sections.goals',
      ]))
      expect(text).toContain('progressScreen.window.empty')
      expect(findPill(tree.root, 'progressScreen.window.emptyAction').props.testID).toBe('button-secondary-sm')
      expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
      expect(mocks.retrospectiveHook).toHaveBeenCalledTimes(1)
      const figures = tree.root.findAll((node) => node.type === 'StatTile').map((node) => node.props.value)
      expect(figures).not.toContain('0%')
    } finally {
      mocks.retrospective.data = retrospectiveData
    }
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
      ;(retry.props.onPress as () => void)()
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
    const firstGoal = findGoalCard(tree.root, 'Goal one')

    expect(list.props.activationDistance).toBe(5)
    expect(firstGoal.props.accessibilityActions).toHaveLength(2)
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()

    await TestRenderer.act(() => {
      ;(list.props.onDragEnd as (params: unknown) => void)({ from: 0, to: 1, data: [goalTwo, goalOne] })
    })
    expect(mocks.reorder.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.reorder.mutate).toHaveBeenCalledWith([
      { id: 'goal-2', position: 0 },
      { id: 'goal-1', position: 1 },
    ])
  })

  it('announces accessibility moves, boundaries and preserves errors and filtered state', async () => {
    const announceForAccessibility = vi.spyOn(ReactNative.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined)
    const goalOne = createMockGoal({ id: 'goal-1', title: 'Goal one', position: 0 })
    const goalTwo = createMockGoal({ id: 'goal-2', title: 'Goal two', position: 1 })
    mocks.goals.data.allGoals = [goalOne, goalTwo]
    const tree = await renderProgress()
    const firstGoal = tree.root.findAll((node) => node.type === 'Pressable' && String(node.props.accessibilityLabel).includes('Goal one'))[0]!
    const secondGoal = tree.root.findAll((node) => node.type === 'Pressable' && String(node.props.accessibilityLabel).includes('Goal two'))[0]!

    expect(tree.root.findAll((node) => node.props.testID === 'goal-reorder-status')).toHaveLength(0)
    expect(announceForAccessibility).not.toHaveBeenCalled()
    await TestRenderer.act(() => (firstGoal.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'decrement' } }))
    expect(announceForAccessibility).toHaveBeenNthCalledWith(1, 'progressScreen.goals.reorderBoundary:{"title":"Goal one","position":1,"total":2}')
    await TestRenderer.act(() => (firstGoal.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'decrement' } }))
    expect(announceForAccessibility).toHaveBeenNthCalledWith(2, 'progressScreen.goals.reorderBoundary:{"title":"Goal one","position":1,"total":2}')
    await TestRenderer.act(() => (secondGoal.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'increment' } }))
    expect(announceForAccessibility).toHaveBeenNthCalledWith(3, 'progressScreen.goals.reorderBoundary:{"title":"Goal two","position":2,"total":2}')
    await TestRenderer.act(() => (secondGoal.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'decrement' } }))
    const moveUpOptions = mocks.reorder.mutate.mock.calls.at(-1)?.[1] as { onSuccess: () => void }
    await TestRenderer.act(() => moveUpOptions.onSuccess())
    expect(announceForAccessibility).toHaveBeenNthCalledWith(4, 'progressScreen.goals.reorderMoved:{"title":"Goal two","position":1,"total":2}')
    await TestRenderer.act(() => (firstGoal.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'increment' } }))
    const moveDownOptions = mocks.reorder.mutate.mock.calls.at(-1)?.[1] as { onSuccess: () => void }
    await TestRenderer.act(() => moveDownOptions.onSuccess())
    expect(announceForAccessibility).toHaveBeenNthCalledWith(5, 'progressScreen.goals.reorderMoved:{"title":"Goal one","position":2,"total":2}')
    expect(announceForAccessibility).toHaveBeenCalledTimes(5)

    mocks.reorder.isError = true
    await TestRenderer.act(async () => { tree.update(<ProgressScreen />); await Promise.resolve() })
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.accessibilityRole === 'alert')).toHaveLength(1)
    await selectGoalFilter(tree, 'active')
    expect(tree.root.findAll((node) => node.type === 'DraggableFlatList')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.accessibilityActions !== undefined)).toHaveLength(0)
  })

  it.each([
    { count: 0, label: 'dias seguidos' },
    { count: 1, label: 'dia seguido' },
    { count: 2, label: 'dias seguidos' },
  ])('renders the Portuguese streak figure at $count through mobile i18n', async ({ count, label }) => {
    await i18n.changeLanguage('pt-BR')
    mocks.usePortugueseCatalog = true
    mocks.freeze.streakInfo.currentStreak = count
    try {
      const tree = await renderProgress()
      const streakLabel = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === label)[0]!
      expect(streakLabel).toBeDefined()
      let figure = streakLabel.parent!
      while (figure.type !== 'View') figure = figure.parent!
      expect(figure.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === String(count))).toHaveLength(1)
      expect(tree.root.findAll((node) => node.props.children === (count === 1 ? 'dias seguidos' : 'dia seguido'))).toHaveLength(0)
    } finally {
      mocks.usePortugueseCatalog = false
      await i18n.changeLanguage('en')
    }
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

  it.each([320, 360, 384, 412, 1440])('keeps fourteen square days inside the full visible account row at %ipx', async (width) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 892, scale: 1, fontScale: 1 })
    const tree = await renderProgress()
    const strip = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'day-strip-account')[0]!
    const cells = strip.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'image')
    const rowStyle = StyleSheet.flatten(strip.props.style as ViewStyle)
    const visibleWidth = Math.min(width - 32, 560)
    const config = Yoga.Config.create()
    config.setPointScaleFactor(0)
    const row = Yoga.Node.createWithConfig(config)
    row.setWidth(visibleWidth)
    row.setFlexDirection(rowStyle.flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN)
    row.setGap(Yoga.GUTTER_ALL, Number(rowStyle.gap ?? 0))
    row.setJustifyContent(rowStyle.justifyContent === 'space-between' ? Yoga.JUSTIFY_SPACE_BETWEEN : Yoga.JUSTIFY_FLEX_START)
    const dayNodes = cells.map((cell, index) => {
      const style = StyleSheet.flatten(cell.props.style as ViewStyle)
      const day = Yoga.Node.createWithConfig(config)
      day.setWidth(Number(style.width))
      day.setHeight(typeof style.height === 'number' ? style.height : undefined)
      day.setAspectRatio(typeof style.aspectRatio === 'number' ? style.aspectRatio : undefined)
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
      expect(right, 'today must fit inside the visible row').toBeLessThanOrEqual(visibleWidth + 0.5)
      expect(right, 'the fourteen days must occupy the full row').toBeCloseTo(visibleWidth, 1)
      for (const [index, day] of dayNodes.entries()) {
        expect(day.getComputedWidth()).toBeGreaterThanOrEqual(16)
        expect(Math.abs(day.getComputedWidth() - day.getComputedHeight())).toBeLessThanOrEqual(0.5)
        expect(day.getComputedWidth()).toBeCloseTo(Math.min(width >= 768 ? 24 : 20, (visibleWidth - 13 * 4) / 14), 1)
        expect(StyleSheet.flatten(cells[index]!.props.style as ViewStyle).borderRadius).toBe(8)
        if (index) expect(day.getComputedLeft() - dayNodes[index - 1]!.getComputedLeft() - dayNodes[index - 1]!.getComputedWidth()).toBeCloseTo(Math.max(4, (visibleWidth - 14 * (width >= 768 ? 24 : 20)) / 13), 1)
      }
      for (let ancestor = strip.parent; ancestor; ancestor = ancestor.parent) expect(ancestor.props.horizontal).not.toBe(true)
    } finally {
      row.freeRecursive()
      config.free()
      dimensions.mockRestore()
    }
  })

  it.each([false, true])('stages a stable frozen live region when initially frozen is %s', async (initiallyFrozen) => {
    mocks.freeze.isFrozenToday = initiallyFrozen
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-07']
    let tree: { root: TestNode; update: (element: React.ReactNode) => void; unmount: () => void } | undefined
    TestRenderer.act(() => { tree = TestRenderer.create(<ProgressScreen />) })
    const regions = tree!.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite' && !['goal-reorder-status', 'progress-window-status'].includes(String(node.props.testID)))
    expect(regions, 'the empty polite region must already be mounted').toHaveLength(1)
    const region = regions[0]!
    expect(region.props.accessibilityLabel ?? '').toBe('')
    expect(region.findAll((node) => node.props.children === 'progressScreen.streak.frozenToday')).toHaveLength(0)
    mocks.freeze.isFrozenToday = true
    await TestRenderer.act(async () => {
      tree!.update(<ProgressScreen />)
      await Promise.resolve()
    })
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite' && !['goal-reorder-status', 'progress-window-status'].includes(String(node.props.testID)))[0]).toBe(region)
    expect(region.props.accessibilityLabel).toBe('progressScreen.streak.frozenToday')
    expect(region.findAll((node) => node.props.children === 'progressScreen.streak.frozenToday').length).toBeGreaterThan(0)
    mocks.freeze.isFrozenToday = false
    TestRenderer.act(() => { tree!.update(<ProgressScreen />) })
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite' && !['goal-reorder-status', 'progress-window-status'].includes(String(node.props.testID)))[0]).toBe(region)
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
    accessibilityMocks.sendAccessibilityEvent.mockReset()
    const tree = await renderProgress()
    const card = findGoalCard(tree.root, 'Read 12 Books')
    TestRenderer.act(() => (card.props.onPress as () => void)())
    const cardTarget = setGoalCardFocusTarget(tree.root, String(card.props.testID).replace('goal-card-', ''))
    const detail = tree.root.findAll((node) => node.type === 'GoalDetail')[0]
    if (!detail) throw new Error('Goal detail missing')
    const detailGoalId = String(detail.props.goalId)
    expect(detail.props.inline).toBe(true)
    TestRenderer.act(() => (detail.props.onClose as () => void)())
    expect(tree.root.findAll((node) => node.type === 'GoalDetail')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.type === 'Pressable' && String(node.props.accessibilityLabel).includes('\"title\":\"Read 12 Books\"'))).toHaveLength(1)
    expect(tree.root.findAll((node) => node.props.testID === `goal-card-${detailGoalId}`).length).toBeGreaterThan(0)
    expect(accessibilityMocks.sendAccessibilityEvent).toHaveBeenCalledWith(cardTarget, 'focus')
  })

  it.each([
    ['deletion', (goal: ReturnType<typeof createMockGoal>) => null],
    ['a filtered status transition', (goal: ReturnType<typeof createMockGoal>) => ({ ...goal, status: 'Completed' as const })],
  ])('returns focus to the page heading after %s removes the opening card', async (_path, updateGoal) => {
    const openingGoal = createMockGoal({ id: 'opening', title: 'Opening goal', status: 'Active' })
    const survivingGoal = createMockGoal({ id: 'surviving', title: 'Surviving goal', status: 'Active' })
    mocks.goals.data.allGoals = [openingGoal, survivingGoal]
    accessibilityMocks.sendAccessibilityEvent.mockReset()
    const tree = await renderProgress()
    await selectGoalFilter(tree, 'active')
    TestRenderer.act(() => (findGoalCard(tree.root, openingGoal.title).props.onPress as () => void)())

    const updatedGoal = updateGoal(openingGoal)
    mocks.goals.data.allGoals = updatedGoal ? [updatedGoal, survivingGoal] : [survivingGoal]
    await TestRenderer.act(async () => {
      tree.update(<ProgressScreen />)
      await Promise.resolve()
    })
    const detail = tree.root.findAll((node) => node.type === 'GoalDetail')[0]!
    TestRenderer.act(() => (detail.props.onClose as () => void)())
    const pageHeadingTarget = findProgressHeadingFocusTarget(tree.root)

    expect(accessibilityMocks.sendAccessibilityEvent).toHaveBeenLastCalledWith(pageHeadingTarget, 'focus')
  })

  it('returns focus to the page heading when deleting the sole goal empties progress', async () => {
    const openingGoal = createMockGoal({ id: 'only', title: 'Only goal', status: 'Active' })
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, {
      currentStreak: 0,
      longestStreak: 0,
      totalXp: 0,
      achievementsEarned: 0,
    })
    mocks.goals.data.allGoals = [openingGoal]
    accessibilityMocks.sendAccessibilityEvent.mockReset()
    const tree = await renderProgress()
    TestRenderer.act(() => (findGoalCard(tree.root, openingGoal.title).props.onPress as () => void)())

    mocks.goals.data.allGoals = []
    await TestRenderer.act(async () => {
      tree.update(<ProgressScreen />)
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => node.props.children === 'progressScreen.goals.empty').length).toBeGreaterThan(0)
    const detail = tree.root.findAll((node) => node.type === 'GoalDetail')[0]!
    TestRenderer.act(() => (detail.props.onClose as () => void)())
    const pageHeadingTarget = findProgressHeadingFocusTarget(tree.root)

    expect(accessibilityMocks.sendAccessibilityEvent).toHaveBeenLastCalledWith(pageHeadingTarget, 'focus')
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

it('places the Progresso bell in the scrolling root and opens Avisos', async () => {
  const tree = await renderProgress()
  const row = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'root-notification-header')[0]!
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ minHeight: 48, justifyContent: 'flex-end' })
  const bell = row.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]!
  TestRenderer.act(() => (bell.props.onPress as () => void)())
  expect(mocks.router.push).toHaveBeenCalledWith('/notifications')


})

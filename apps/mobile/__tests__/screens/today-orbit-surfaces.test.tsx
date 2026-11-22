import { createMockHabit, createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import type { ProactiveItem } from '@orbit/shared/types/proactive'
import { View } from 'react-native'
import React from 'react'
import { measureSafeArea, type GeometryTree } from '../support/safe-area-geometry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import TodayScreen from '@/app/(tabs)/index'
import { useUIStore } from '@/stores/ui-store'
import { PADDING, SPACING } from '@orbit/shared/theme'
import { HabitListSkeleton } from '@/components/habit-list/habit-list-skeleton'
import { ErrorState } from '@/components/ui/error-state'
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ requestFirstUsePermission: vi.fn(async () => {}) }) }))

const mocks = vi.hoisted(() => ({
  habit: { id: 'habit-1', parentId: null, title: 'Walk' } as NormalizedHabit,
  habitListProps: null as Record<string, unknown> | null,
  routerPush: vi.fn(),
  lastCompletionDate: undefined as string | null | undefined,
  noHabits: false,
  hasData: true,
  isFetching: false,
  isError: false,
  geometry: false,
  profileReady: true,
  profileError: false,
  hasProAccess: true,
  timeZone: 'UTC',
  today: '2026-08-29',
  selectedDay: null as string | null,
  proactiveItem: null as ProactiveItem | null,
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    React.useEffect(callback, [callback])
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { days: number }) =>
    values ? `${key}:${values.days}` : key }),
}))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/utils')>(),
  parseShowGeneralOnTodayPreference: () => false,
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profileReady ? { timeZone: mocks.timeZone, lastCompletionDate: mocks.lastCompletionDate, hasProAccess: mocks.hasProAccess, aiSummaryEnabled: false, language: 'en' } : undefined, isError: mocks.profileError, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-proactive-item', () => ({
  useProactiveItem: () => ({ item: mocks.proactiveItem, openItem: vi.fn() }),
}))
vi.mock('@/hooks/use-summary', () => ({ useSummary: vi.fn() }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/components/ui/orbit-mascot', () => ({ OrbitMascot: () => null, useStateMascotSize: () => 96 }))
vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map(),
  useHabits: () => ({
    data: mocks.hasData ? { habitsById: mocks.noHabits ? new Map() : new Map([[mocks.habit.id, mocks.habit]]), childrenByParent: new Map() } : undefined,
    isLoading: !mocks.hasData && mocks.isFetching,
    isFetching: mocks.isFetching,
    isError: mocks.isError,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-habit-queries', () => {

return { EMPTY_HABITS_BY_ID: new Map(),
  useHabits: () => ({
    data: mocks.hasData ? { habitsById: mocks.noHabits ? new Map() : new Map([[mocks.habit.id, mocks.habit]]), childrenByParent: new Map() } : undefined,
    isLoading: !mocks.hasData && mocks.isFetching,
    isFetching: mocks.isFetching,
    isError: mocks.isError,
    refetch: vi.fn(),
  }) }
})
vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef((props: Record<string, unknown>, _ref) => {
    mocks.habitListProps = props
    return React.createElement(
      React.Fragment,
      null,
      props.listHeader as React.ReactNode,
      React.createElement('HabitList', { testID: 'today-list-surface', style: { height: 68 } }),
    )
  }),
}))
vi.mock('@/components/habits/selection-tray', () => ({ SelectionTray: () => null }))
vi.mock('@/components/today/today-date-control', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/today/today-date-control')>()
  return { TodayDateControl: (props: React.ComponentProps<typeof original.TodayDateControl>) => mocks.geometry
    ? <original.TodayDateControl {...props} /> : React.createElement(React.Fragment, null, props.beforeDate, React.createElement('TodayDate', { date: mocks.today })) }
})
vi.mock('@/components/shell/shell-header-slot', () => ({ useShellHeaderSlot: () => true }))
vi.mock('@/components/today/today-modals', () => ({ TodayModals: () => null }))
vi.mock('@/components/today/today-orbit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/today/today-orbit')>()
  return {
    TodayOrbit: (props: { today: string; isTodaySelected: boolean; suppressed: boolean }) =>
      React.createElement(React.Fragment, null,
        React.createElement('TodayOrbitMock', { suppressed: props.suppressed, style: { display: 'none' } }),
        React.createElement(original.TodayOrbit, props),
      ),
  }
})
vi.mock('@/app/(tabs)/use-today-motion', () => ({
  useTodayMotion: () => ({
    dayAnimatedStyle: {},
    bulkBarAnimatedStyle: {},
    renderBulkActionBar: false,
  }),
}))
vi.mock('@/components/shell/shell-composer-slot', () => ({ useShellComposerSlot: () => {} }))
vi.mock('@/lib/theme', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/theme')>(),
  createTokensV2: () => ({ bg: '#111111', fg1: '#ffffff', fg2: '#eeeeee', fg3: '#aaaaaa' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))
vi.mock('@/app/(tabs)/use-today-date', () => ({
  useTodayDate: () => ({
    dateStr: mocks.selectedDay ?? mocks.today,
    today: mocks.today,
    selectedDate: new Date('2026-08-29T12:00:00Z'),
    dayName: 'Saturday',
    numericDate: '29',
    nextDisabled: true,
    goToPreviousDay: vi.fn(),
    goToToday: vi.fn(),
    goToNextDay: vi.fn(),
  }),
}))
vi.mock('@/app/(tabs)/use-today-selection', () => ({
  useTodaySelection: () => ({
    selectedCount: 0,
    allSelected: false,
    handleSelectAll: vi.fn(),
    handleDeselectAll: vi.fn(),
    handleOpenBulkLog: vi.fn(),
    handleOpenBulkSkip: vi.fn(),
    handleOpenBulkDelete: vi.fn(),
    clearSelection: vi.fn(),
    handleToggleSelectMode: vi.fn(),
  }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

const mountedTrees: { unmount: () => void }[] = []
function createTestTree(node: React.ReactElement) {
  const tree = TestRenderer.create(node)
  mountedTrees.push(tree)
  return tree
}
afterEach(async () => {
  await TestRenderer.act(() => { for (const tree of mountedTrees.splice(0)) tree.unmount() })
})

function isSuppressed(tree: ReturnType<typeof TestRenderer.create>): boolean {
  const orbit = tree.root.findAll((node) => String(node.type) === 'TodayOrbitMock')[0]
  if (!orbit) throw new Error('Today Orbit did not render')
  return orbit.props.suppressed === true
}

describe('mobile Today Orbit owned surfaces', () => {
  it('stands Orbit in Parado over the whole of Hoje when the profile fails to load', async () => {
    mocks.profileReady = false
    mocks.profileError = true
    let tree!: ReturnType<typeof TestRenderer.create>
    try {
      await TestRenderer.act(() => { tree = createTestTree(<TodayScreen />) })
      expect(tree.root.findAllByType(ErrorState)[0]?.props).toMatchObject({ fullSurface: true, message: 'common.error' })
    } finally {
      mocks.profileReady = true
      mocks.profileError = false
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it('gives the unread check-in the only insight slot ahead of the free summary', async () => {
    mocks.hasProAccess = false
    mocks.proactiveItem = createMockProactiveItem({ text: 'Check in' })
    let tree!: GeometryTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<TodayScreen />) as GeometryTree })
    try {
      const upgrade = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'summary.freePrompt')
      expect(upgrade).toHaveLength(0)
      expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Check in').length).toBeGreaterThan(0)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each([320, 412, 840, 1352].flatMap((width) => [1, 2].flatMap((fontScale) => [
    { date: '2026-08-22', boundary: 'lastLoggable' },
    { date: '2026-08-21', boundary: 'readOnly' },
    { date: '2026-08-30', boundary: 'future' },
    { date: '2026-08-28', boundary: null },
    { date: '2026-08-29', boundary: null },
  ].map((day) => ({ width, fontScale, ...day })))))(
    'keeps the date notice and list gaps fixed for $date at $width and $fontScale text scale', async ({ width, fontScale, date, boundary }) => {
      const native = await import('react-native')
      const dimensions = vi.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale })
      mocks.geometry = true
      let tree!: GeometryTree
      await TestRenderer.act(() => { tree = TestRenderer.create(<TodayScreen />) as GeometryTree })
      try {
        await TestRenderer.act(() => {
          mocks.selectedDay = date
          tree.update(<TodayScreen />)
        })
        const notices = tree.root.findAll((node) => node.type === View && node.props.testID === 'capacity-notice')
        expect(notices).toHaveLength(boundary ? 1 : 0)
        const geometry = measureSafeArea(tree.toJSON(), (host) => host.props.testID === 'today-date-row'
          ? 'date' : host.props.testID === 'capacity-notice' ? 'notice'
            : host.props.testID === 'today-list-surface' ? 'list' : undefined,
        { width, height: 915 })
        if (boundary) {
          expect(notices[0]!.findAll((node) => node.type === native.Text).map((node) => node.props.children)).toEqual([`habits.todayBoundary.${boundary}`])
          expect(geometry.get('notice')!.top - geometry.get('date')!.bottom).toBe(24)
          expect(geometry.get('list')!.top - geometry.get('notice')!.bottom).toBe(24)
        } else {
          expect(geometry.get('list')!.top - geometry.get('date')!.bottom).toBe(24)
        }
      } finally { await TestRenderer.act(() => tree.unmount()); dimensions.mockRestore() }
    },
  )

  beforeEach(() => {
    mocks.habitListProps = null
    mocks.routerPush.mockReset()
    mocks.lastCompletionDate = undefined
    mocks.noHabits = false
    mocks.habit = createMockHabit({ id: 'habit-1', title: 'Walk', scheduledDates: ['2026-08-29'] })
    mocks.hasData = true
    mocks.isFetching = false
    mocks.isError = false
    mocks.geometry = false
    mocks.hasProAccess = true
    mocks.profileReady = true
    mocks.timeZone = 'UTC'
    mocks.today = '2026-08-29'
    mocks.selectedDay = null
    mocks.proactiveItem = null
    useUIStore.setState({
      showCreateModal: false,
      isSelectMode: false,
      selectedHabitIds: new Set(),
    })
  })

  it('clears the line when current returns no item after the owning Today date rolls over', async () => {
    mocks.timeZone = 'America/Sao_Paulo'
    mocks.proactiveItem = createMockProactiveItem({ text: 'Check in', localDate: '2026-08-29' })
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = createTestTree(<TodayScreen />)
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button').length).toBeGreaterThan(0)

    mocks.today = '2026-08-30'
    mocks.proactiveItem = null
    await TestRenderer.act(() => { tree.update(<TodayScreen />) })

    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0)
    expect(tree.root.findAll((node) => String(node.type) === 'TodayDate')[0]?.props.date).toBe('2026-08-30')
  })

  it.each([
    ['create', (props: Record<string, unknown>) => (props.onCreatePress as () => void)()],
    ['edit', (props: Record<string, unknown>) => (props.onEditHabit as (habit: NormalizedHabit) => void)(mocks.habit)],
  ])('stands down while the %s surface is open', async (_surface, openSurface) => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = createTestTree(<TodayScreen />)
      await Promise.resolve()
    })
    expect(isSuppressed(tree)).toBe(false)

    await TestRenderer.act(async () => {
      openSurface(mocks.habitListProps ?? {})
      await Promise.resolve()
    })

    expect(isSuppressed(tree)).toBe(true)
  })

  it('keeps the same proactive line and header geometry throughout a habits refetch', async () => {
    mocks.geometry = true
    mocks.proactiveItem = createMockProactiveItem({ text: 'Check in' })
    let tree!: GeometryTree
    await TestRenderer.act(() => { tree = createTestTree(<TodayScreen />) as GeometryTree })
    const findLine = () => tree.root.findAll((node) => node.props.accessibilityLabel === 'Check in')[0]
    const measure = () => measureSafeArea(tree.toJSON(), (host) => host.props.testID === 'today-date-row'
      ? 'date' : host.props.accessibilityLabel === 'Check in' ? 'line' : undefined)
    const line = findLine()
    expect(line).toBeDefined()
    const resting = measure()
    try {
      mocks.isFetching = true
      await TestRenderer.act(() => { tree.update(<TodayScreen />) })

      expect(findLine()).toBe(line)
      expect(measure()).toEqual(resting)

      mocks.isFetching = false
      await TestRenderer.act(() => { tree.update(<TodayScreen />) })

      expect(findLine()).toBe(line)
      expect(measure()).toEqual(resting)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('keeps the FAB available through refetch failure with retained habits', async () => {
    let tree!: GeometryTree
    await TestRenderer.act(() => { tree = createTestTree(<TodayScreen />) as GeometryTree })
    try {
      expect(useUIStore.getState().todayFabHidden).toBe(false)
      mocks.isFetching = true
      await TestRenderer.act(() => { tree.update(<TodayScreen />) })
      expect(useUIStore.getState().todayFabHidden).toBe(false)
      mocks.isFetching = false
      mocks.isError = true
      await TestRenderer.act(() => { tree.update(<TodayScreen />) })
      expect(useUIStore.getState().todayFabHidden).toBe(false)
      mocks.hasData = false
      await TestRenderer.act(() => { tree.update(<TodayScreen />) })
      expect(useUIStore.getState().todayFabHidden).toBe(true)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('commits the FAB hidden by the end of the first layout phase when Today returns over a list cached empty', async () => {
    mocks.noHabits = true
    const atLayoutEnd: boolean[] = []
    function AfterToday() {
      React.useLayoutEffect(() => { atLayoutEnd.push(useUIStore.getState().todayFabHidden) })
      return null
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = createTestTree(<><TodayScreen /><AfterToday /></>) })
    await TestRenderer.act(() => tree.unmount())
    expect(useUIStore.getState().todayFabHidden).toBe(false)
    atLayoutEnd.length = 0
    await TestRenderer.act(() => { tree = createTestTree(<><TodayScreen /><AfterToday /></>) })
    expect(atLayoutEnd).toEqual([true])
    expect(useUIStore.getState().todayFabHidden).toBe(true)
  })

  it.each(['first load', 'load error', 'select mode', 'list surface'])(
    'withholds the proactive line during %s', async (state) => {
      mocks.proactiveItem = createMockProactiveItem({ text: 'Check in' })
      mocks.hasData = state !== 'first load' && state !== 'load error'
      mocks.isFetching = state === 'first load'
      mocks.isError = state === 'load error'
      useUIStore.setState({ isSelectMode: state === 'select mode' })
      let tree!: GeometryTree
      await TestRenderer.act(() => { tree = createTestTree(<TodayScreen />) as GeometryTree })
      try {
        if (state === 'list surface') {
          await TestRenderer.act(() => {
            (mocks.habitListProps?.onSurfaceOpenChange as (open: boolean) => void)(true)
          })
        }
        expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Check in')).toHaveLength(0)
      } finally { await TestRenderer.act(() => tree.unmount()) }
    },
  )

  it('routes detail into the habit flow instead of opening a Today surface', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = createTestTree(<TodayScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      const openDetail = (mocks.habitListProps?.onDetailHabit as (habit: NormalizedHabit) => void)
      openDetail(mocks.habit)
      await Promise.resolve()
    })

    expect(mocks.routerPush).toHaveBeenCalledWith({
      pathname: '/habits/[id]',
      params: { id: 'habit-1', date: '2026-08-29', from: 'today' },
    })
    expect(isSuppressed(tree)).toBe(false)
  })
  it('keeps 24 between the proactive line and date control and clears the absent line', async () => {
    mocks.geometry = true
    mocks.proactiveItem = createMockProactiveItem({ text: 'Check in' })
    let tree!: GeometryTree
    await TestRenderer.act(() => { tree = createTestTree(<View><TodayScreen /></View>) as GeometryTree })
    const measure = () => measureSafeArea(tree.toJSON(), (host) => host.props.testID === 'today-date-row'
      ? 'date' : host.props.testID === 'habit-view-switch' ? 'views' : host.props.accessibilityLabel === 'Check in' ? 'line'
        : host.children?.some((child) => typeof child !== 'string' && child.props.testID === 'today-date-row') ? 'header' : undefined)
    try {
      const visible = measure()
      expect(visible.get('date')!.top - visible.get('line')!.bottom).toBe(24)
      mocks.proactiveItem = null
      await TestRenderer.act(() => { tree.update(<TodayScreen />) })
      expect(measure().has('line')).toBe(false)
      const absent = measure()
      expect(absent.get('date')!.top - absent.get('views')!.bottom).toBe(24)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('draws one skeleton per region while the profile is pending: the date header and the habit list skeleton', async () => {
    mocks.profileReady = false
    mocks.habitListProps = null
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = createTestTree(<TodayScreen />) })
    try {
      const units = (variant: string) => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === `skeleton-unit-${variant}`)
      expect(units('settings')).toHaveLength(1)
      expect(tree.root.findAllByType(HabitListSkeleton)).toHaveLength(1)
      expect(units('habit-row')).toHaveLength(5)
      expect(mocks.habitListProps).toBeNull()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('announces the pending Today region once, with no progressbar nested inside it', async () => {
    mocks.profileReady = false
    let tree!: ReturnType<typeof createTestTree>
    await TestRenderer.act(() => { tree = createTestTree(<TodayScreen />) })
    try {
      const progressbars = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar')
      expect(progressbars).toHaveLength(1)
      expect(progressbars[0]!.props.accessibilityLabel).toBe('profile.loading')
      expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-habit-row' && node.props.accessible === false)).toHaveLength(5)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('separates the profile date placeholder from the habit skeleton by the gap the loaded header leaves above the list skeleton', async () => {
    mocks.profileReady = false
    let tree!: GeometryTree
    await TestRenderer.act(() => { tree = createTestTree(<View><TodayScreen /></View>) as GeometryTree })
    try {
      let firstHabitFound = false
      const firstLayout = measureSafeArea(tree.toJSON(), (host) => {
        if (host.props.testID === 'skeleton-unit-settings') return 'date'
        if (host.props.testID === 'skeleton-unit-habit-row' && !firstHabitFound) { firstHabitFound = true; return 'habit' }
        return undefined
      })
      expect(firstLayout.get('habit')!.top - firstLayout.get('date')!.bottom).toBe(PADDING.sectionGap + SPACING.s12)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

})

import React from 'react'
import { Animated, StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import {
  canNavigateToNextDay,
  formatAPIDate,
  getTodayBoundary,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import TodayScreen from '@/app/(tabs)/index'
import { useUIStore } from '@/stores/ui-store'
import { setAccountId } from '@/lib/account-scope'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  logHabitMutateAsync: vi.fn(),
  routerPush: vi.fn(),
  focusCallback: null as null | (() => void | (() => void)),
  clearSelection: vi.fn(),
  composerEnabled: [] as boolean[],
  astraOwnership: [] as boolean[],
  profileReady: true,
  habitFilters: [] as { includeGeneral?: boolean }[],
  date: {
    today: '2026-04-08',
    selectedDate: new Date('2026-04-08T00:00:00'),
    dateStr: '2026-04-08',
    dayName: 'Wednesday',
    numericDate: '08/04/2026',
    nextDisabled: false,
    goToPreviousDay: vi.fn(),
    goToToday: vi.fn(),
    goToNextDay: vi.fn(),
  },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profileReady ? { timeZone: 'UTC' } : undefined }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    mocks.focusCallback = callback
  },
}))

const asyncStorageState = vi.hoisted(() => ({
  values: new Map<string, string>(),
}))

const pendingHabit = createMockHabit({
  id: 'habit-pending',
  title: 'Exercise',
  isCompleted: false,
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(asyncStorageState.values.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      asyncStorageState.values.set(key, value)
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      asyncStorageState.values.delete(key)
      return Promise.resolve()
    }),
  },
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('react-i18next', async () => {
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  const translate = (key: string) => {
    let value: unknown = messages
    for (const segment of key.split('.')) {
      if (typeof value !== 'object' || value === null || !(segment in value)) return key
      value = (value as Record<string, unknown>)[segment]
    }
    return typeof value === 'string' ? value : key
  }

  return {
    useTranslation: () => ({ t: translate, i18n: { language: 'en' } }),
  }
})


vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map<string, NormalizedHabit>(),
  useHabits: (filters: { includeGeneral?: boolean }) => {
    mocks.habitFilters.push(filters)
    return {
      data: { habitsById: new Map([[pendingHabit.id, pendingHabit]]) },
    }
  },
}))

vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(
    props: Record<string, unknown>,
    ref: React.ForwardedRef<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      markRecentlyCompleted: vi.fn(),
      checkAndPromptParentLog: vi.fn(),
    }))

    const pressPendingRing = () => {
      const onLogHabit = props.onLogHabit as ((habit: NormalizedHabit) => void) | undefined
      if (onLogHabit) {
        onLogHabit(pendingHabit)
        return
      }

      const selectedDate = props.selectedDate as Date
      void mocks.logHabitMutateAsync({
        habitId: pendingHabit.id,
        date: formatAPIDate(selectedDate),
      })
    }

    return React.createElement(
      React.Fragment,
      null,
      props.listHeader as React.ReactNode,
      React.createElement('HabitListProps', { showCompleted: props.showCompleted }),
      React.createElement('PendingRing', { onPress: pressPendingRing }),
      props.onSeeUpcoming
        ? React.createElement('UpcomingAction', { onPress: props.onSeeUpcoming })
        : null,
    )
  }),
}))

vi.mock('@/components/habits/selection-tray', () => ({
  SelectionTray: () => null,
}))

vi.mock('@/components/today/today-date-control', () => ({
  TodayDateControl: () => null,
}))

vi.mock('@/components/today/today-astra', () => ({
  TodayAstra: () => {
    React.useEffect(() => {
      mocks.astraOwnership.push(true)
      return () => {
        mocks.astraOwnership.push(false)
      }
    }, [])
    return React.createElement('TodayAstraOwner')
  },
}))

vi.mock('@/components/ui/trial-banner', () => ({
  TrialBanner: () => React.createElement('TrialBanner'),
}))

vi.mock('@/app/(tabs)/use-today-motion', () => ({
  useTodayMotion: () => ({
    dayAnimatedStyle: { transform: [{ translateY: 0 }] },
    refetchAnimatedStyle: { transform: [{ translateY: 0 }] },
    bulkBarAnimatedStyle: {},
    renderBulkActionBar: true,
  }),
}))

vi.mock('@/components/today/today-modals', () => ({
  TodayModals: () => null,
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => ({ bg: '#000000' }),
  }
})

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))

vi.mock('@/app/(tabs)/use-today-date', () => ({
  useTodayDate: () => mocks.date,
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
    clearSelection: mocks.clearSelection,
    showBulkDeleteConfirm: false,
    setShowBulkDeleteConfirm: vi.fn(),
    confirmBulkDelete: vi.fn(),
  }),
}))

vi.mock('@/components/shell/shell-composer-slot', () => ({
  useShellComposerSlot: (enabled: boolean) => {
    mocks.composerEnabled.push(enabled)
  },
}))

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'children' in node) {
    return flattenText((node as { children?: unknown }).children)
  }
  if (typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

describe('Hoje date boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.focusCallback = null
    mocks.composerEnabled.length = 0
    mocks.astraOwnership.length = 0
    mocks.profileReady = true
    mocks.habitFilters.length = 0
    setAccountId(null)
    asyncStorageState.values.clear()
    useUIStore.setState({
      isSelectMode: false,
      selectedHabitIds: new Set<string>(),
      showCreateModal: false,
    })
    mocks.date.selectedDate = new Date('2026-04-08T00:00:00')
    mocks.date.dateStr = '2026-04-08'
    mocks.date.nextDisabled = false
  })

  it('withholds Today actions until the account day is known', async () => {
    mocks.profileReady = false
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<TodayScreen />) })
    expect(tree.root.findAll((node) => String(node.type) === 'PendingRing')).toHaveLength(0)
    mocks.profileReady = true
    await TestRenderer.act(() => { tree.update(<TodayScreen />) })
    expect(tree.root.findAll((node) => String(node.type) === 'PendingRing')).toHaveLength(1)
  })

  it('loads the account preference when Today gains focus', async () => {
    setAccountId('account-a')
    asyncStorageState.values.set('orbit_show_general_on_today:account-a', 'true')
    asyncStorageState.values.set('orbit_show_general_on_today:account-b', 'false')
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    let blur: void | (() => void)
    await TestRenderer.act(async () => {
      blur = mocks.focusCallback?.()
      await Promise.resolve()
    })

    expect(mocks.habitFilters.at(-1)?.includeGeneral).toBe(true)

    await TestRenderer.act(async () => {
      blur?.()
      setAccountId('account-b')
      tree.update(<TodayScreen />)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      mocks.focusCallback?.()
      await Promise.resolve()
    })

    expect(mocks.habitFilters.at(-1)?.includeGeneral).toBeUndefined()
  })

  it('keeps seven days back loggable and marks the next day read only', () => {
    expect(getTodayBoundary('2026-04-01', '2026-04-08')).toBe('last-loggable')
    expect(getTodayBoundary('2026-03-31', '2026-04-08')).toBe('read-only')
  })

  it('composes day and refetch motion without flattening either transform', async () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    const motionViews = tree.root.findAll((node) => node.type === Animated.View).filter((node) => {
      const styles = Array.isArray(node.props.style) ? node.props.style : [node.props.style]
      return styles.some((style: unknown) => (
        typeof style === 'object' && style !== null && 'transform' in style
      ))
    })

    expect(motionViews).toHaveLength(2)
  })

  it('registers the selection tray only while Today is focused', async () => {
    useUIStore.setState({
      isSelectMode: true,
      selectedHabitIds: new Set(['habit-pending']),
    })

    await TestRenderer.act(async () => {
      TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    expect(mocks.composerEnabled.at(-1)).toBe(false)
    let blur: void | (() => void)
    await TestRenderer.act(async () => {
      blur = mocks.focusCallback?.()
      await Promise.resolve()
    })
    expect(mocks.composerEnabled.at(-1)).toBe(true)

    await TestRenderer.act(async () => {
      blur?.()
      await Promise.resolve()
    })
    expect(mocks.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.composerEnabled.at(-1)).toBe(false)
  })

  it('keeps the Today list within the large-screen content column', async () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })
    const contentColumn = tree.root.findAll(
      (node) => node.props.testID === 'today-content-column',
    )[0]
    expect(contentColumn).toBeDefined()
    expect(StyleSheet.flatten(contentColumn?.props.style)).toMatchObject({
      alignSelf: 'center',
      maxWidth: 740,
      width: '100%',
    })
  })

  it('releases the Astra composer and conversation owner when Today blurs', async () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => String(node.type) === 'TodayAstraOwner')).toHaveLength(0)
    let blur: void | (() => void)
    await TestRenderer.act(async () => {
      blur = mocks.focusCallback?.()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => String(node.type) === 'TodayAstraOwner')).toHaveLength(1)
    expect(mocks.astraOwnership).toEqual([true])

    await TestRenderer.act(async () => {
      blur?.()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => String(node.type) === 'TodayAstraOwner')).toHaveLength(0)
    expect(mocks.astraOwnership).toEqual([true, false])
  })

  it('marks future days without blocking navigation', () => {
    expect(getTodayBoundary('2026-04-09', '2026-04-08')).toBe('future')
  })

  it('stops the forward control at the API horizon', () => {
    expect(canNavigateToNextDay('2026-07-06', '2026-04-08')).toBe(true)
    expect(canNavigateToNextDay('2026-07-07', '2026-04-08')).toBe(false)
  })

  it('renders the resolved read-only boundary notice', async () => {
    mocks.date.selectedDate = new Date('2026-03-31T00:00:00')
    mocks.date.dateStr = '2026-03-31'
    let tree: import('react-test-renderer').ReactTestRenderer

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    expect(flattenText(tree!.root)).toContain(en.habits.todayBoundary.readOnly)
    expect(en.habits.todayBoundary.readOnly).toBe('Logging stops 7 days back. You can still edit, move and delete here.')
  })

  it('ignores an upgraded showCompleted true payload when rendering Today', async () => {
    asyncStorageState.values.set(
      'orbit-ui-store',
      JSON.stringify({
        state: { activeFilters: {}, activeView: 'today', showCompleted: true },
        version: 4,
      }),
    )
    await useUIStore.persist.rehydrate()
    let tree: import('react-test-renderer').ReactTestRenderer

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    const habitListProps = tree!.root.findAll(
      (node) => String(node.type) === 'HabitListProps',
    )[0]
    expect(habitListProps?.props.showCompleted).toBe(false)
    expect(useUIStore.getState()).not.toHaveProperty('showCompleted')
  })

  it('persists a pending ring log with the selected date', async () => {
    let tree: import('react-test-renderer').ReactTestRenderer

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      const pendingRing = tree!.root.findAll((node) => String(node.type) === 'PendingRing')[0]
      const onPress = pendingRing?.props.onPress
      if (typeof onPress !== 'function') throw new Error('Pending ring press handler is missing')
      onPress()
      await Promise.resolve()
    })

    expect(mocks.logHabitMutateAsync).toHaveBeenCalledOnce()
    expect(mocks.logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-pending',
      date: '2026-04-08',
    })
  })

  it('omits the all-done upcoming action at the instance horizon', async () => {
    mocks.date.selectedDate = new Date('2026-07-07T00:00:00')
    mocks.date.dateStr = '2026-07-07'
    mocks.date.nextDisabled = true
    let tree: import('react-test-renderer').ReactTestRenderer

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    expect(tree!.root.findAll((node) => String(node.type) === 'UpcomingAction')).toHaveLength(0)
    expect(mocks.date.goToNextDay).not.toHaveBeenCalled()
  })

  it('keeps the all-done upcoming action active below the instance horizon', async () => {
    mocks.date.selectedDate = new Date('2026-07-06T00:00:00')
    mocks.date.dateStr = '2026-07-06'
    let tree: import('react-test-renderer').ReactTestRenderer

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(() => {
      const upcomingAction = tree!.root.findAll(
        (node) => String(node.type) === 'UpcomingAction',
      )[0]
      const onPress = upcomingAction?.props.onPress
      if (typeof onPress !== 'function') throw new Error('Upcoming action is missing')
      onPress()
    })

    expect(mocks.date.goToNextDay).toHaveBeenCalledOnce()
  })
})

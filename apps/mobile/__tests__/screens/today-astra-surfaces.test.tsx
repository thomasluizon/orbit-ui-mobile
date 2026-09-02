import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import TodayScreen from '@/app/(tabs)/index'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  habit: { id: 'habit-1', parentId: null, title: 'Walk' } as NormalizedHabit,
  habitListProps: null as Record<string, unknown> | null,
  routerPush: vi.fn(),
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
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/utils')>(),
  getTodayBoundary: () => null,
  parseShowGeneralOnTodayPreference: () => false,
}))
vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({ showInterstitialIfDue: vi.fn() }),
}))
vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map(),
  useHabits: () => ({
    data: { habitsById: new Map([[mocks.habit.id, mocks.habit]]) },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef((props: Record<string, unknown>, _ref) => {
    mocks.habitListProps = props
    return React.createElement(
      React.Fragment,
      null,
      props.listHeader as React.ReactNode,
      React.createElement('HabitList'),
    )
  }),
}))
vi.mock('@/components/habits/selection-tray', () => ({ SelectionTray: () => null }))
vi.mock('@/components/ui/capacity-notice', () => ({ CapacityNotice: () => null }))
vi.mock('@/components/today/today-date-control', () => ({ TodayDateControl: () => null }))
vi.mock('@/components/today/today-modals', () => ({ TodayModals: () => null }))
vi.mock('@/components/today/today-astra', () => ({
  TodayAstra: (props: { suppressed: boolean }) =>
    React.createElement('TodayAstraMock', { suppressed: props.suppressed }),
}))
vi.mock('@/components/shell/shell-composer-slot', () => ({ useShellComposerSlot: () => {} }))
vi.mock('@/lib/theme', () => ({ createTokensV2: () => ({ bg: '#111111' }) }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))
vi.mock('@/app/(tabs)/use-today-date', () => ({
  useTodayDate: () => ({
    dateStr: '2026-08-29',
    today: '2026-08-29',
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

function isSuppressed(tree: ReturnType<typeof TestRenderer.create>): boolean {
  const astra = tree.root.findAll((node) => String(node.type) === 'TodayAstraMock')[0]
  if (!astra) throw new Error('Today Astra did not render')
  return astra.props.suppressed === true
}

describe('mobile Today Astra owned surfaces', () => {
  beforeEach(() => {
    mocks.habitListProps = null
    mocks.routerPush.mockReset()
    useUIStore.setState({
      showCreateModal: false,
      isSelectMode: false,
      selectedHabitIds: new Set(),
    })
  })

  it.each([
    ['create', (props: Record<string, unknown>) => (props.onCreatePress as () => void)()],
    ['edit', (props: Record<string, unknown>) => (props.onEditHabit as (habit: NormalizedHabit) => void)(mocks.habit)],
  ])('stands down while the %s surface is open', async (_surface, openSurface) => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })
    expect(isSuppressed(tree)).toBe(false)

    await TestRenderer.act(async () => {
      openSurface(mocks.habitListProps ?? {})
      await Promise.resolve()
    })

    expect(isSuppressed(tree)).toBe(true)
  })

  it('routes detail into the habit flow instead of opening a Today surface', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
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
})

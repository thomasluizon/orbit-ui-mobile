import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

const uiState = {
  selectedDate: '2026-04-07',
  setSelectedDate: vi.fn(),
  activeView: 'today',
  setActiveView: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  selectedFrequency: null,
  setSelectedFrequency: vi.fn(),
  selectedTagIds: [],
  setSelectedTagIds: vi.fn(),
  showCompleted: false,
  setShowCompleted: vi.fn(),
  isSelectMode: false,
  selectedHabitIds: new Set<string>(),
  toggleSelectMode: vi.fn(),
  selectAllHabits: vi.fn(),
  clearSelection: vi.fn(),
  setFilters: vi.fn(),
  showCreateModal: false,
  setShowCreateModal: vi.fn(),
  showCreateGoalModal: false,
  setShowCreateGoalModal: vi.fn(),
}
const bulkLogMutateAsync = vi.fn()
const bulkSkipMutateAsync = vi.fn()
const markRecentlyCompleted = vi.fn()
const checkAndPromptParentLog = vi.fn()
const mockHabitsData = {
  habitsById: new Map<string, ReturnType<typeof createMockHabit>>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as ReturnType<typeof createMockHabit>[],
}
const habitListHandle = {
  allCollapsed: false,
  allLoadedIds: new Set<string>(),
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  markRecentlyCompleted,
  checkAndPromptParentLog,
  refetch: vi.fn(),
}

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
  },
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: createMockProfile({ hasProAccess: false, aiSummaryEnabled: false }),
  }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({
    tags: [],
  }),
}))

vi.mock('@/hooks/use-gamification', () => ({
  useStreakInfo: () => ({
    data: { currentStreak: 0 },
  }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({
    data: mockHabitsData,
    getChildren: () => [],
    isFetching: false,
  }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteHabits: () => ({ mutateAsync: vi.fn() }),
  useBulkLogHabits: () => ({ mutateAsync: bulkLogMutateAsync }),
  useBulkSkipHabits: () => ({ mutateAsync: bulkSkipMutateAsync }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof uiState) => unknown) => selector(uiState),
}))

vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(props: Record<string, unknown>, ref) {
    React.useImperativeHandle(ref, () => habitListHandle)
    return React.createElement('HabitList', props)
  }),
}))

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: () => null,
}))

vi.mock('@/components/habits/log-habit-modal', () => ({
  LogHabitModal: () => null,
}))

vi.mock('@/components/habits/habit-detail-drawer', () => ({
  HabitDetailDrawer: () => null,
}))

vi.mock('@/components/habits/edit-habit-modal', () => ({
  EditHabitModal: () => null,
}))

vi.mock('@/components/habits/habit-summary-card', () => ({
  HabitSummaryCard: () => null,
}))

vi.mock('@/components/goals/goals-view', () => ({
  GoalsView: () => React.createElement('GoalsView'),
}))

vi.mock('@/components/goals/create-goal-modal', () => ({
  CreateGoalModal: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => React.createElement('StreakBadge'),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (props: Record<string, unknown>) => React.createElement('ConfirmDialog', props),
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => React.createElement('ThemeToggle'),
}))

vi.mock('@/components/ui/trial-banner', () => ({
  TrialBanner: () => React.createElement('TrialBanner'),
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => React.createElement('NotificationBell'),
}))

vi.mock('@/components/ui/anchored-menu', () => ({
  AnchoredMenu: () => null,
}))

vi.mock('@/hooks/use-horizontal-swipe', () => ({
  useHorizontalSwipe: () => ({
    panHandlers: {},
  }),
}))

vi.mock('@/lib/habit-selection-state', () => ({
  shouldResetSelectionForViewChange: () => false,
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createColors: () => colorProxy,
  }
})

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}))

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
    Check: createIcon('Check'),
    CheckCircle2: createIcon('CheckCircle2'),
    ChevronLeft: createIcon('ChevronLeft'),
    ChevronRight: createIcon('ChevronRight'),
    ChevronsDownUp: createIcon('ChevronsDownUp'),
    ChevronsUpDown: createIcon('ChevronsUpDown'),
    Eye: createIcon('Eye'),
    FastForward: createIcon('FastForward'),
    MinusCircle: createIcon('MinusCircle'),
    MoreVertical: createIcon('MoreVertical'),
    PlusCircle: createIcon('PlusCircle'),
    RefreshCw: createIcon('RefreshCw'),
    Search: createIcon('Search'),
    Trash2: createIcon('Trash2'),
    X: createIcon('X'),
  }
})

import TodayScreen from '@/app/(tabs)/index'

describe('TodayScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bulkLogMutateAsync.mockReset()
    bulkSkipMutateAsync.mockReset()
    mockHabitsData.habitsById = new Map()
    mockHabitsData.childrenByParent = new Map()
    mockHabitsData.topLevelHabits = []
    habitListHandle.allLoadedIds = new Set()
    uiState.activeView = 'today'
    uiState.isSelectMode = false
    uiState.searchQuery = ''
    uiState.selectedFrequency = null
    uiState.selectedTagIds = []
    uiState.showCompleted = false
    uiState.selectedHabitIds = new Set<string>()
    uiState.showCreateModal = false
    uiState.showCreateGoalModal = false
  })

  it('passes the shared habits header through the habit list and removes the nestable scroll container', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    expect(tree.root.findAllByType('NestableScrollContainer')).toHaveLength(0)

    const habitList = tree.root.findByType('HabitList')
    expect(habitList.props.listHeader).toBeTruthy()
  })

  it('dedupes descendant successes before prompting parent logs for bulk actions', async () => {
    const root = createMockHabit({ id: 'root', title: 'Root', hasSubHabits: true })
    const parent = createMockHabit({ id: 'parent', title: 'Parent', parentId: 'root', hasSubHabits: true })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent' })

    mockHabitsData.habitsById = new Map([
      [root.id, root],
      [parent.id, parent],
      [child.id, child],
    ])
    mockHabitsData.childrenByParent = new Map([
      [root.id, [parent.id]],
      [parent.id, [child.id]],
    ])
    mockHabitsData.topLevelHabits = [root]
    uiState.selectedHabitIds = new Set([parent.id, child.id])

    bulkLogMutateAsync.mockResolvedValue({
      results: [
        { habitId: parent.id, status: 'Success' },
        { habitId: child.id, status: 'Success' },
      ],
    })

    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    const bulkLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.bulkLogTitle')

    await TestRenderer.act(async () => {
      await bulkLogDialog.props.onConfirm()
    })

    expect(markRecentlyCompleted).toHaveBeenCalledWith('parent')
    expect(markRecentlyCompleted).toHaveBeenCalledWith('child')
    expect(checkAndPromptParentLog).toHaveBeenCalledTimes(1)
    expect(checkAndPromptParentLog).toHaveBeenCalledWith('parent')
  })
})

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

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
    t: (key: string) => key,
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
    data: { topLevelHabits: [] },
    getChildren: () => [],
    isFetching: false,
  }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteHabits: () => ({ mutateAsync: vi.fn() }),
  useBulkLogHabits: () => ({ mutateAsync: vi.fn() }),
  useBulkSkipHabits: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof uiState) => unknown) => selector(uiState),
}))

vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(props: Record<string, unknown>, _ref) {
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
  ConfirmDialog: () => null,
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

vi.mock('@/lib/theme', () => ({
  createColors: () => colorProxy,
  radius: { full: 9999, lg: 16, md: 12, xl: 20 },
  shadows: { lg: {} },
}))

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
    uiState.activeView = 'today'
    uiState.isSelectMode = false
    uiState.searchQuery = ''
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
})

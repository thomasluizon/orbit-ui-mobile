import React from 'react'
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

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  logHabitMutateAsync: vi.fn(),
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

const pendingHabit = createMockHabit({
  id: 'habit-pending',
  title: 'Exercise',
  isCompleted: false,
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(() => Promise.resolve(null)) },
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

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({ showInterstitialIfDue: vi.fn() }),
}))

vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map<string, NormalizedHabit>(),
  useHabits: () => ({
    data: { habitsById: new Map([[pendingHabit.id, pendingHabit]]) },
  }),
}))

const uiState = {
  showCompleted: false,
  isSelectMode: false,
  selectedHabitIds: new Set<string>(),
  showCreateModal: false,
  setShowCreateModal: vi.fn(),
  showCreateGoalModal: false,
  setShowCreateGoalModal: vi.fn(),
}

vi.mock('@/stores/ui-store', () => ({
  useUIStore: <T,>(selector: (state: typeof uiState) => T) => selector(uiState),
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
      React.createElement('PendingRing', { onPress: pressPendingRing }),
    )
  }),
}))

vi.mock('@/components/habits/bulk-action-bar-v2', () => ({
  BulkActionBarV2: () => null,
}))

vi.mock('@/components/today/today-shell', () => ({
  TodayDateControl: () => null,
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
    clearSelection: vi.fn(),
    showBulkDeleteConfirm: false,
    setShowBulkDeleteConfirm: vi.fn(),
    confirmBulkDelete: vi.fn(),
  }),
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
    mocks.date.selectedDate = new Date('2026-04-08T00:00:00')
    mocks.date.dateStr = '2026-04-08'
  })

  it('keeps seven days back loggable and marks the next day read only', () => {
    expect(getTodayBoundary('2026-04-01', '2026-04-08')).toBe('last-loggable')
    expect(getTodayBoundary('2026-03-31', '2026-04-08')).toBe('read-only')
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

    expect(flattenText(tree!.toJSON())).toContain(en.habits.todayBoundary.readOnly)
  })

  it('persists a pending ring log with the selected date', async () => {
    let tree: import('react-test-renderer').ReactTestRenderer

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      tree!.root.findByType('PendingRing').props.onPress()
      await Promise.resolve()
    })

    expect(mocks.logHabitMutateAsync).toHaveBeenCalledOnce()
    expect(mocks.logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-pending',
      date: '2026-04-08',
    })
  })
})

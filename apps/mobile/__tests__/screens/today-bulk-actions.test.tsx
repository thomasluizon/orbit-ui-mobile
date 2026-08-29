import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import TodayScreen from '@/app/(tabs)/index'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

type RenderedTree = import('react-test-renderer').ReactTestRenderer
type ComponentProps = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  bulkBarProps: null as ComponentProps | null,
  modalProps: null as ComponentProps | null,
  bulkDelete: { mutateAsync: vi.fn() },
  bulkLog: { mutateAsync: vi.fn() },
  bulkSkip: { mutateAsync: vi.fn() },
  clearSelection: vi.fn(),
  settleBulkHabitResolutions: vi.fn(),
  showToast: vi.fn(),
  store: {
    activeView: 'today',
    showCompleted: false,
    isSelectMode: true,
    selectedHabitIds: new Set(['habit-1']),
    showCreateModal: false,
    setShowCreateModal: vi.fn(),
    showCreateGoalModal: false,
    setShowCreateGoalModal: vi.fn(),
    toggleSelectMode: vi.fn(),
    selectAllHabits: vi.fn(),
    clearSelection: vi.fn(),
  },
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(() => Promise.resolve(null)) },
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({ showInterstitialIfDue: vi.fn() }),
}))

vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map<string, NormalizedHabit>(),
  useHabits: () => ({ data: { habitsById: new Map<string, NormalizedHabit>() } }),
  useBulkDeleteHabits: () => mocks.bulkDelete,
  useBulkLogHabits: () => mocks.bulkLog,
  useBulkSkipHabits: () => mocks.bulkSkip,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}))

vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(
    _props: ComponentProps,
    ref: React.ForwardedRef<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      settleBulkHabitResolutions: mocks.settleBulkHabitResolutions,
      markRecentlyCompleted: vi.fn(),
      checkAndPromptParentLog: vi.fn(),
    }))
    return null
  }),
}))

vi.mock('@/components/habits/bulk-action-bar-v2', () => ({
  BulkActionBarV2: (props: ComponentProps) => {
    mocks.bulkBarProps = props
    return null
  },
}))

vi.mock('@/components/today/today-shell', () => ({
  TodayDateControl: () => null,
}))

vi.mock('@/components/today/today-modals', () => ({
  TodayModals: (props: ComponentProps) => {
    mocks.modalProps = props
    return null
  },
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
  useTodayDate: () => ({
    today: '2026-04-08',
    selectedDate: new Date('2026-04-08T00:00:00'),
    dateStr: '2026-04-08',
    dayName: 'Wednesday',
    numericDate: '08/04/2026',
    nextDisabled: false,
    goToPreviousDay: vi.fn(),
    goToToday: vi.fn(),
    goToNextDay: vi.fn(),
  }),
}))

const mountedTrees: RenderedTree[] = []

function successfulResult() {
  return {
    results: [{ habitId: 'habit-1', status: 'Success' as const }],
    offlineFailureIds: [],
  }
}

async function renderToday(): Promise<void> {
  await TestRenderer.act(async () => {
    mountedTrees.push(TestRenderer.create(<TodayScreen />))
    await Promise.resolve()
  })
}

async function press(handler: unknown): Promise<void> {
  if (typeof handler !== 'function') throw new Error('Expected a production action handler')
  await TestRenderer.act(async () => {
    handler()
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  while (mountedTrees.length > 0) {
    void TestRenderer.act(() => mountedTrees.pop()?.unmount())
  }
})

describe('Hoje production bulk action path', () => {
  beforeEach(() => {
    mocks.bulkBarProps = null
    mocks.modalProps = null
    mocks.showToast.mockReset()
    mocks.settleBulkHabitResolutions.mockReset()
    mocks.store.clearSelection = mocks.clearSelection
    mocks.clearSelection.mockReset()
    mocks.store.selectedHabitIds = new Set(['habit-1'])
    mocks.bulkDelete.mutateAsync.mockReset().mockResolvedValue(successfulResult())
    mocks.bulkLog.mutateAsync.mockReset().mockResolvedValue(successfulResult())
    mocks.bulkSkip.mutateAsync.mockReset().mockResolvedValue(successfulResult())
  })

  it('reports offline log and skip refusals without an unhandled rejection', async () => {
    const offlineResult = {
      results: [],
      offlineFailureIds: ['habit-1'],
    }
    mocks.bulkLog.mutateAsync.mockResolvedValueOnce(offlineResult)
    mocks.bulkSkip.mutateAsync.mockResolvedValueOnce(offlineResult)
    await renderToday()

    await press(mocks.bulkBarProps?.onLog)
    await press(mocks.bulkBarProps?.onSkip)

    expect(mocks.showToast).toHaveBeenCalledTimes(2)
    expect(mocks.showToast).toHaveBeenNthCalledWith(1, {
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(mocks.showToast).toHaveBeenNthCalledWith(2, {
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(mocks.clearSelection).not.toHaveBeenCalled()
    expect(mocks.settleBulkHabitResolutions).not.toHaveBeenCalled()
  })

  it('keeps the delete confirmation and selection after an offline refusal, then retries online', async () => {
    mocks.bulkDelete.mutateAsync
      .mockResolvedValueOnce({ results: [], offlineFailureIds: ['habit-1'] })
      .mockResolvedValueOnce(successfulResult())
    await renderToday()

    await press(mocks.bulkBarProps?.onDelete)
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(true)

    await press(mocks.modalProps?.onConfirmBulkDelete)
    expect(mocks.showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(true)
    expect(mocks.modalProps?.selectedCount).toBe(1)
    expect(mocks.clearSelection).not.toHaveBeenCalled()

    await press(mocks.modalProps?.onConfirmBulkDelete)
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(false)
    expect(mocks.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('keeps every online path successful and clears selection after each action', async () => {
    await renderToday()

    await press(mocks.bulkBarProps?.onLog)
    await press(mocks.bulkBarProps?.onSkip)
    await press(mocks.bulkBarProps?.onDelete)
    await press(mocks.modalProps?.onConfirmBulkDelete)

    expect(mocks.settleBulkHabitResolutions).toHaveBeenNthCalledWith(1, [
      { habitId: 'habit-1', mode: 'log' },
    ])
    expect(mocks.settleBulkHabitResolutions).toHaveBeenNthCalledWith(2, [
      { habitId: 'habit-1', mode: 'skip' },
    ])
    expect(mocks.clearSelection).toHaveBeenCalledTimes(3)
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(false)
    expect(mocks.showToast).not.toHaveBeenCalled()
  })
})

import { BackHandler } from 'react-native'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { buildTempGoal } from '@/lib/goal-mutation-helpers'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

const colorProxy: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

const listGoal = createMockGoal({ id: '1', title: 'Read 12 books', currentValue: 3, targetValue: 12, unit: 'books', progressPercentage: 25 })

let detailGoal: GoalDetailWithMetrics['goal'] = { ...listGoal, progressHistory: [] }
let detailLoadError = false
const refetchDetail = vi.fn()
const updateProgressMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockStatusMutateAsync = vi.fn()
const mockPush = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-US' },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({
    showInterstitialIfDue: vi.fn(),
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
    currentScheme: 'purple',
    currentTheme: 'dark',
  }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: any) =>
    React.createElement('BottomSheetAppTextInput', props),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, title, onConfirm, onCancel, onOpenChange }: any) =>
    open
      ? React.createElement(
          'ConfirmDialog',
          { title },
          React.createElement('Pressable', {
            accessibilityLabel: `confirm:${title}`,
            onPress: () => onConfirm?.(),
          }),
          React.createElement('Pressable', {
            accessibilityLabel: `cancel:${title}`,
            onPress: () => onCancel?.(),
          }),
          React.createElement('Pressable', {
            accessibilityLabel: `dismiss:${title}`,
            onPress: () => onOpenChange?.(false),
          }),
        )
      : null,
}))

vi.mock('@/components/goals/goal-detail-drawer/goal-ask-astra-button', () => ({
  GoalAskAstraButton: ({ onPress }: any) =>
    React.createElement('Pressable', { accessibilityLabel: 'ask-astra', onPress }),
}))

vi.mock('@/components/goals/edit-goal-modal', () => ({
  EditGoalModal: () => null,
}))

vi.mock('@/components/goals/goal-metrics-panel', () => ({
  GoalMetricsPanel: () => React.createElement('GoalMetricsPanel'),
}))

vi.mock('@/components/ui/icons', () => {
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
    Minus: createIcon('Minus'),
    Check: createIcon('Check'),
    ChevronLeft: createIcon('ChevronLeft'),
    ArchiveX: createIcon('ArchiveX'),
    CheckCircle2: createIcon('CheckCircle2'),
    ChevronRight: createIcon('ChevronRight'),
    Flame: createIcon('Flame'),
    PencilLine: createIcon('PencilLine'),
    Plus: createIcon('Plus'),
    Repeat: createIcon('Repeat'),
    RotateCw: createIcon('RotateCw'),
    Orbit: createIcon('Orbit'),
    Trash2: createIcon('Trash2'),
  }
})

vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: {
      allGoals: [listGoal],
      goalsById: new Map([['1', listGoal]]),
    },
  }),
  useGoalDetail: (id: string | null) => ({
    data: id ? { goal: detailGoal, metrics: { progressPercentage: detailGoal.progressPercentage, velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline', habitAdherence: [] } } : null,
    isLoading: false,
    isError: detailLoadError,
    refetch: refetchDetail,
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: updateProgressMutateAsync, isPending: false, error: null }),
  useUpdateGoalStatus: () => ({ mutateAsync: mockStatusMutateAsync, isPending: false, error: null }),
  useDeleteGoal: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false, error: null }),
}))

function collectText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(collectText).join('')
  return collectText(node.children ?? [])
}

const historyEntries = [
  {
    createdAtUtc: '2025-01-02T00:00:00Z',
    previousValue: 0,
    value: 2,
    note: null,
  },
]

const linkedHabits = [{ id: 'h1', title: 'Read every night' }]

describe('GoalDetailDrawer', () => {
  beforeEach(() => {
    detailGoal = { ...listGoal, progressHistory: [] }
    detailLoadError = false
    refetchDetail.mockClear()
    mockDeleteMutateAsync.mockReset()
    mockDeleteMutateAsync.mockResolvedValue(undefined)
    mockStatusMutateAsync.mockReset()
    mockStatusMutateAsync.mockResolvedValue(undefined)
    mockPush.mockClear()
    updateProgressMutateAsync.mockReset()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
  })

  function renderDrawer(onClose: () => void = vi.fn()) {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={onClose} goalId="1" />,
      )
    })
    return tree
  }

  function press(tree: any, label: string) {
    const node = tree.root
      .findAll(
        (candidate: any) =>
          candidate.props.accessibilityLabel === label &&
          typeof candidate.props.onPress === 'function',
      )
      .at(0)
    if (!node) throw new Error(`Button not found: ${label}`)
    TestRenderer.act(() => {
      node.props.onPress()
    })
  }

  it('prefers synced detail data over the stale list cache', () => {
    detailGoal = {
      ...listGoal,
      title: 'Read 12 books (synced)',
      currentValue: 6,
      progressPercentage: 50,
      progressHistory: [],
    }

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    const sheet = tree.root.findByType('Sheet')
    const textContent = collectText(tree.toJSON())

    expect(sheet.props.title).toBe('progressScreen.sections.goals')
    expect(textContent).toContain('Read 12 books (synced)')
    expect(textContent).toContain('"current":6')
  })

  it('renders the progress block with percentage', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    const textContent = collectText(tree.toJSON())

    expect(textContent).toContain('goals.progress')
    expect(tree.root.findAll((node: any) => node.props.accessibilityValue?.now === 25).length).toBeGreaterThan(0)
  })



  it('does not offer manual progress editing for a derived goal', () => {
    detailGoal = {
      ...listGoal,
      isProgressDerived: true,
      progressHistory: [],
    }

    const tree = renderDrawer()
    const updateProgressButtons = tree.root.findAll(
      (node: any) =>
        node.props.accessibilityLabel === 'goals.updateProgress' &&
        typeof node.props.onPress === 'function',
    )

    expect(updateProgressButtons).toHaveLength(0)
    expect(tree.root.findAllByType('BottomSheetAppTextInput')).toHaveLength(0)
  })

  it('does not offer manual progress editing for a temporary streak goal', () => {
    detailGoal = {
      ...buildTempGoal({
        title: 'Daily workout',
        targetValue: 30,
        unit: 'days',
        type: 'Streak',
      }, '1', 0),
      progressHistory: [],
    }

    const tree = renderDrawer()
    const updateProgressButtons = tree.root.findAll(
      (node: any) =>
        node.props.accessibilityLabel === 'goals.updateProgress' &&
        typeof node.props.onPress === 'function',
    )

    expect(updateProgressButtons).toHaveLength(0)
    expect(tree.root.findAllByType('BottomSheetAppTextInput')).toHaveLength(0)
  })

  it('renders the action footer (status, edit, delete)', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    const labels = tree.root
      .findAll((node: any) => typeof node.props.accessibilityLabel === 'string')
      .map((node: any) => node.props.accessibilityLabel)

    expect(labels).not.toContain('goals.detail.markCompleted')
    expect(labels).toContain('goals.detail.markAbandoned')
    expect(labels).toContain('goals.detail.edit')
    expect(labels).toContain('goals.detail.delete')
  })

  it('keeps the linked habits section visible at count zero', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    expect(collectText(tree.toJSON())).toContain('goals.noLinkedHabits')
  })

  it('orders linked habits before history for standard goals', () => {
    detailGoal = {
      ...listGoal,
      progressHistory: historyEntries,
      linkedHabits,
    }

    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    const textContent = collectText(tree.toJSON())
    expect(textContent.indexOf('goals.progressHistory')).toBeGreaterThan(-1)
    expect(textContent.indexOf('goals.linkedHabits')).toBeLessThan(
      textContent.indexOf('goals.progressHistory'),
    )
  })

  it('orders linked habits before history for streak goals', () => {
    detailGoal = {
      ...listGoal,
      type: 'Streak',
      progressHistory: historyEntries,
      linkedHabits,
    }

    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    const textContent = collectText(tree.toJSON())
    expect(textContent.indexOf('goals.linkedHabits')).toBeGreaterThan(-1)
    expect(textContent.indexOf('goals.linkedHabits')).toBeLessThan(
      textContent.indexOf('goals.progressHistory'),
    )
  })

  it('offers a retry action when the detail fetch fails', () => {
    detailLoadError = true

    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    const retryButton = tree.root
      .findAll(
        (node: any) =>
          flattenText(node.props.children) === 'common.retry' &&
          typeof node.props.onPress === 'function',
      )
      .at(0)

    expect(retryButton).toBeDefined()

    TestRenderer.act(() => {
      retryButton.props.onPress()
    })

    expect(refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('deletes the goal and closes after confirming the delete dialog', async () => {
    const onClose = vi.fn()
    const tree = renderDrawer(onClose)

    press(tree, 'goals.detail.delete')
    const confirm = tree.root.findAllByProps({ testID: 'button-destructive-md' }).at(0)
    await TestRenderer.act(async () => {
      await confirm.props.onPress()
    })

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the drawer open when the delete request fails', async () => {
    mockDeleteMutateAsync.mockRejectedValue(new Error('offline'))
    const onClose = vi.fn()
    const tree = renderDrawer(onClose)

    press(tree, 'goals.detail.delete')
    const confirm = tree.root.findAllByProps({ testID: 'button-destructive-md' }).at(0)
    await TestRenderer.act(async () => {
      await confirm.props.onPress()
    })

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('1')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('runs status mutations from the active action footer', () => {
    const tree = renderDrawer()
    press(tree, 'goals.detail.markAbandoned')
    expect(mockStatusMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('offers reactivate for a non-active goal', () => {
    detailGoal = { ...listGoal, status: 'Abandoned', progressHistory: [] }
    const tree = renderDrawer()
    press(tree, 'goals.detail.reactivate')
    expect(mockStatusMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('opens the edit modal and requests dismiss without throwing', () => {
    const tree = renderDrawer()
    expect(() => press(tree, 'goals.detail.edit')).not.toThrow()
    expect(() => press(tree, 'attempt-dismiss')).not.toThrow()
  })
  it.each(['Standard', 'Streak'] as const)('stage 5 names derived progress for %s and hides steppers', (type) => {
    detailGoal = { ...listGoal, type, isProgressDerived: true, linkedHabits: [{ id: 'h1', title: 'Read nightly' }], progressHistory: [] }
    const tree = renderDrawer()
    expect(collectText(tree.toJSON())).toContain('goals.detail.derived')
    const label = 'goals.detail.increase'
    expect(tree.root.findAll((node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(0)).toBeFalsy()
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it.each([false, undefined])('stage 5 steps manual progress when derived is %s', (isProgressDerived) => {
    detailGoal = { ...listGoal, type: 'Streak', isProgressDerived, progressHistory: [] }
    const tree = renderDrawer()
    expect(collectText(tree.toJSON())).toContain('goals.detail.manualProgress')
    const label = 'goals.detail.increase'
    press(tree, label)
    expect(updateProgressMutateAsync).toHaveBeenCalledWith({ goalId: '1', data: { currentValue: 4 } })
  })

  it('stage 5 completes only at target with a neutral action and explanation', () => {
    detailGoal = { ...listGoal, currentValue: 12, progressPercentage: 100, progressHistory: [] }
    const tree = renderDrawer()
    expect(collectText(tree.toJSON())).toContain('goals.detail.completeWhy')
    const label = 'goals.detail.markCompleted'
    const complete = tree.root.findAll((node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(0)
    expect(complete).toBeTruthy()
    expect(tree.root.findAll((node: any) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID: 'status-ring' }).length).toBeGreaterThan(0)
    expect(complete.props.testID).toBe("button-secondary-sm")
    press(tree, label)
    expect(mockStatusMutateAsync).toHaveBeenCalledWith({ goalId: '1', data: { status: 'Completed' }, goalName: listGoal.title })
  })

  it.each(['Active', 'Completed'] as const)('stage 5 never reopens a %s goal', (status) => {
    detailGoal = { ...listGoal, status, progressHistory: [] }
    const tree = renderDrawer()
    const label = 'goals.detail.reactivate'
    expect(tree.root.findAll((node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(0)).toBeFalsy()
    expect(collectText(tree.toJSON())).not.toContain('goals.detail.markCompleted')
  })

  it('stage 5 removes the figure and ring from an abandoned goal', () => {
    detailGoal = { ...listGoal, status: 'Abandoned', progressHistory: [] }
    const tree = renderDrawer()
    expect(collectText(tree.toJSON())).not.toContain('"current":3')
    expect(tree.root.findAll((node: any) => node.props.accessibilityRole === "progressbar")).toHaveLength(0)
    const label = 'goals.detail.reactivate'
    expect(tree.root.findAll((node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(0)).toBeTruthy()
  })

  it('stage 5 shows capacity and the newest three history rows before expanding', () => {
    detailGoal = { ...listGoal, linkedHabits: Array.from({ length: 20 }, (_, index) => ({ id: String(index), title: `Habit ${index}` })), progressHistory: [4, 3, 2, 1].map(value => ({ createdAtUtc: `2026-09-0${value}T00:00:00Z`, previousValue: value - 1, value, note: `entry-${value}` })) }
    const tree = renderDrawer()
    expect(collectText(tree.toJSON())).toContain('goals.detail.linkedLimit')
    expect(collectText(tree.toJSON())).toContain('entry-4')
    expect(collectText(tree.toJSON())).not.toContain('entry-1')
    let label = 'goals.detail.showAllHistory:{"count":4}'
    press(tree, label)
    expect(collectText(tree.toJSON())).toContain('entry-1')
    label = 'goals.detail.showLessHistory'
    press(tree, label)
    expect(collectText(tree.toJSON())).not.toContain('entry-1')
  })

  it('stage 5 names the goal in deletion confirmation before any write', () => {
    const tree = renderDrawer()
    const label = 'goals.detail.delete'
    press(tree, label)
    expect(collectText(tree.toJSON())).toContain('goals.detail.deleteNamed:{"title":"Read 12 books"}')
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled()
  })

  it('stage 5 keeps failed progress unchanged and allows retry', async () => {
    updateProgressMutateAsync.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const tree = renderDrawer()
    await TestRenderer.act(async () => { press(tree, 'goals.detail.increase'); await Promise.resolve() })
    const alert = tree.root.findAll((node: any) => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]
    expect(flattenText(alert)).not.toBe('')
    expect(collectText(tree.toJSON())).toContain('"current":3')
    await TestRenderer.act(async () => { press(tree, 'goals.detail.increase'); await Promise.resolve() })
    expect(updateProgressMutateAsync).toHaveBeenCalledTimes(2)
  })

  it('stage 5 bounds the stepper and blocks duplicate pending writes', async () => {
    detailGoal = { ...listGoal, currentValue: 0, progressPercentage: 0, progressHistory: [] }
    let resolve: () => void = () => {}
    updateProgressMutateAsync.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    const tree = renderDrawer()
    const decrease = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'goals.detail.decrease')[0]
    expect(decrease.props.disabled).toBe(true)
    press(tree, 'goals.detail.increase')
    press(tree, 'goals.detail.increase')
    expect(updateProgressMutateAsync).toHaveBeenCalledTimes(1)
    const increase = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'goals.detail.increase')[0]
    expect(increase.props.disabled).toBe(true)
    await TestRenderer.act(async () => { resolve(); await Promise.resolve() })
    expect(increase.props.disabled).toBe(false)
  })

  it('stage 5 returns from inline detail with Android back', () => {
    const onClose = vi.fn()
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<GoalDetailDrawer inline open onClose={onClose} goalId="1" />) })
    TestRenderer.act(() => { (BackHandler as typeof BackHandler & { emitBackPress: () => boolean }).emitBackPress() })
    expect(onClose).toHaveBeenCalledTimes(1)
    TestRenderer.act(() => tree.unmount())
  })

})

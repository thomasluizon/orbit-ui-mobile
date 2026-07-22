import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'

const TestRenderer = require('react-test-renderer')

const colorProxy: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

const listGoal = {
  id: '1',
  title: 'Read 12 books',
  description: null,
  targetValue: 12,
  currentValue: 3,
  unit: 'books',
  status: 'Active',
  deadline: null,
  position: 0,
  createdAtUtc: '2025-01-01T00:00:00Z',
  completedAtUtc: null,
  progressPercentage: 25,
  linkedHabits: [],
}

let detailGoal: Record<string, unknown> = {
  ...listGoal,
  progressHistory: [] as unknown[],
}
let detailLoadError = false
const refetchDetail = vi.fn()
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

/* WHY: like the real wrapper, the mock stays in the tree when `open` is false -
   TrueSheet only fires didDismiss after a close, so modelling close as unmount
   would green-light flows production cannot execute.
   https://sheet.lodev09.com/guides/navigation */
vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children, title, onAttemptDismiss, onDidDismiss }: any) =>
    React.createElement(
      'BottomSheetModal',
      { title, open },
      React.createElement('Pressable', {
        accessibilityLabel: 'attempt-dismiss',
        onPress: () => onAttemptDismiss?.(),
      }),
      React.createElement('Pressable', {
        accessibilityLabel: 'sheet-did-dismiss',
        onPress: () => onDidDismiss?.(),
      }),
      children,
    ),
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareBottomSheetScrollView: ({ children }: any) =>
    React.createElement('KeyboardAwareBottomSheetScrollView', null, children),
}))

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

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
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
    data: id ? { goal: detailGoal, metrics: null } : null,
    isLoading: false,
    isError: detailLoadError,
    refetch: refetchDetail,
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
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

    const sheet = tree.root.findByType('BottomSheetModal')
    const textContent = collectText(tree.toJSON())

    expect(sheet.props.title).toBe('Read 12 books (synced)')
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
    expect(textContent).toContain('25%')
  })

  it('opens the progress form when the edit affordance is tapped', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalDetailDrawer open={true} onClose={vi.fn()} goalId="1" />,
      )
    })

    expect(tree.root.findAllByType('BottomSheetAppTextInput')).toHaveLength(0)

    const editButton = tree.root
      .findAll(
        (node: any) =>
          node.props.accessibilityLabel === 'goals.updateProgress' &&
          typeof node.props.onPress === 'function',
      )
      .at(0)

    TestRenderer.act(() => {
      editButton.props.onPress()
    })

    expect(
      tree.root.findAllByType('BottomSheetAppTextInput').length,
    ).toBeGreaterThan(0)
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

    expect(labels).toContain('goals.detail.markCompleted')
    expect(labels).toContain('goals.detail.markAbandoned')
    expect(labels).toContain('goals.detail.edit')
    expect(labels).toContain('goals.detail.delete')
  })

  it('orders history before linked habits for standard goals', () => {
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
    expect(textContent.indexOf('goals.progressHistory')).toBeLessThan(
      textContent.indexOf('goals.linkedHabits'),
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
          node.props.accessibilityLabel === 'common.retry' &&
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
    const confirm = tree.root
      .findAll(
        (n: any) =>
          n.props.accessibilityLabel === 'confirm:goals.detail.delete' &&
          typeof n.props.onPress === 'function',
      )
      .at(0)
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
    const confirm = tree.root
      .findAll(
        (n: any) =>
          n.props.accessibilityLabel === 'confirm:goals.detail.delete' &&
          typeof n.props.onPress === 'function',
      )
      .at(0)
    await TestRenderer.act(async () => {
      await confirm.props.onPress()
    })

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('1')
    expect(onClose).not.toHaveBeenCalled()
  })

  /* WHY: replicates the goal-list host contract (drawer mounted while
     selectedGoalId is set, close only clears `open`) so the exit action is
     proven to survive the close the way production actually runs it.
     https://sheet.lodev09.com/guides/navigation */
  function GoalListHostReplica() {
    const [selectedGoalId, setSelectedGoalId] = React.useState<string | null>(null)
    const [showDetail, setShowDetail] = React.useState(false)
    return React.createElement(
      React.Fragment,
      null,
      React.createElement('Pressable', {
        accessibilityLabel: 'open-goal-detail',
        onPress: () => {
          setSelectedGoalId('1')
          setShowDetail(true)
        },
      }),
      selectedGoalId
        ? React.createElement(GoalDetailDrawer, {
            open: showDetail,
            onClose: () => setShowDetail(false),
            goalId: selectedGoalId,
          })
        : null,
    )
  }

  it('seeds a chat draft and navigates to Astra only after the host-mounted sheet finishes dismissing', () => {
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<GoalListHostReplica />)
    })

    press(tree, 'open-goal-detail')
    expect(tree.root.findByType('BottomSheetModal').props.open).toBe(true)

    press(tree, 'ask-astra')

    expect(setItem).toHaveBeenCalledWith(
      'orbit-chat-draft',
      'goals.detail.askAstraSeedDefault:{"title":"Read 12 books"}',
    )
    expect(mockPush).not.toHaveBeenCalled()

    const sheet = tree.root.findByType('BottomSheetModal')
    expect(sheet.props.open).toBe(false)

    press(tree, 'sheet-did-dismiss')

    expect(mockPush).toHaveBeenCalledWith('/chat')
    expect(mockPush).toHaveBeenCalledTimes(1)

    press(tree, 'sheet-did-dismiss')
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('runs status mutations from the active action footer', () => {
    const tree = renderDrawer()
    press(tree, 'goals.detail.markCompleted')
    expect(mockStatusMutateAsync).toHaveBeenCalledTimes(1)

    press(tree, 'goals.detail.markAbandoned')
    expect(mockStatusMutateAsync).toHaveBeenCalledTimes(2)
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
})

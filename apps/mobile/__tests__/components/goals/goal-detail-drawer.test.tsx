import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

let detailGoal = { ...listGoal, progressHistory: [] as unknown[] }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-US' },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
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

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children, title }: any) =>
    open ? React.createElement('BottomSheetModal', { title }, children) : null,
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
  ConfirmDialog: () => null,
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
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdateGoalStatus: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteGoal: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}))

function collectText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(collectText).join('')
  return collectText(node.children ?? [])
}

describe('GoalDetailDrawer', () => {
  beforeEach(() => {
    detailGoal = { ...listGoal, progressHistory: [] }
  })

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
})

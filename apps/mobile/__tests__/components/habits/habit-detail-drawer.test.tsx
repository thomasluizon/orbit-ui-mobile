import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'

const TestRenderer = require('react-test-renderer')

const mockUpdateChecklistMutate = vi.fn()
const mockLogHabitMutateAsync = vi.fn()
const mockShowError = vi.fn()

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mockShowError }),
}))
vi.mock('@/hooks/use-habits', () => ({
  useHabitFullDetail: () => ({ data: undefined, isLoading: false }),
  useUpdateChecklist: () => ({ mutate: mockUpdateChecklistMutate }),
  useLogHabit: () => ({ mutateAsync: mockLogHabitMutateAsync }),
}))
vi.mock('@/components/habits/habit-calendar', () => ({
  HabitCalendar: () => null,
}))
vi.mock('@/components/habits/description-viewer', () => ({
  DescriptionViewer: () => null,
}))
vi.mock('@/app/social/_components/new-pair-flow', () => ({
  NewPairFlow: () => null,
}))
vi.mock('@/components/habits/habit-checklist', () => {
  const ReactLib = require('react')
  return {
    HabitChecklist: ({
      items,
      onToggle,
      onClear,
    }: {
      items: { text: string; isChecked: boolean }[]
      onToggle?: (index: number) => void
      onClear?: () => void
    }) =>
      ReactLib.createElement(
        'View',
        null,
        items.map((item, index) =>
          ReactLib.createElement(
            'Pressable',
            {
              key: `toggle-${index}`,
              accessibilityLabel: `toggle-${index}`,
              onPress: () => onToggle?.(index),
            },
            ReactLib.createElement('Text', null, item.text),
          ),
        ),
        ReactLib.createElement('Pressable', {
          accessibilityLabel: 'checklist-clear',
          onPress: () => onClear?.(),
        }),
      ),
  }
})

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

function render(ui: React.ReactElement) {
  let tree: { root: TestNode }
  TestRenderer.act(() => {
    tree = TestRenderer.create(ui)
  })
  return tree!
}

function hasText(root: TestNode, value: string) {
  return root.findAll((node) => node.type === 'Text' && node.props.children === value).length > 0
}

function pressButton(root: TestNode, label: string) {
  const node = root.findAll(
    (candidate) =>
      candidate.type === 'Pressable' &&
      (candidate.props.accessibilityLabel === label ||
        candidate.findAll((c) => c.type === 'Text' && c.props.children === label).length > 0),
  )[0]
  if (!node) throw new Error(`Button not found: ${label}`)
  const onPress = node.props.onPress
  if (typeof onPress !== 'function') throw new Error(`Button missing onPress: ${label}`)
  onPress()
}

describe('HabitDetailDrawer (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogHabitMutateAsync.mockResolvedValue({})
  })

  it('gates checklist clear behind a confirmation and only clears on confirm', () => {
    const habit = createMockHabit({
      id: 'h-1',
      checklistItems: [
        { text: 'Warm up', isChecked: false },
        { text: 'Main set', isChecked: true },
      ],
    })

    const tree = render(
      <HabitDetailDrawer open onClose={vi.fn()} habit={habit} />,
    )

    TestRenderer.act(() => {
      pressButton(tree.root, 'checklist-clear')
    })
    expect(mockUpdateChecklistMutate).not.toHaveBeenCalled()
    expect(hasText(tree.root, 'habits.checklistClearTitle')).toBe(true)

    TestRenderer.act(() => {
      pressButton(tree.root, 'habits.form.clearChecklist')
    })
    expect(mockUpdateChecklistMutate).toHaveBeenCalledWith({
      habitId: 'h-1',
      items: [],
    })
  })

  it('surfaces an error toast when logging from the checklist-complete confirm fails', async () => {
    mockLogHabitMutateAsync.mockRejectedValue(new Error('offline'))
    const habit = createMockHabit({
      id: 'h-1',
      isCompleted: false,
      checklistItems: [{ text: 'Only item', isChecked: false }],
    })

    const tree = render(
      <HabitDetailDrawer open onClose={vi.fn()} habit={habit} />,
    )

    TestRenderer.act(() => {
      pressButton(tree.root, 'toggle-0')
    })
    expect(hasText(tree.root, 'habits.checklistCompleteTitle')).toBe(true)

    await TestRenderer.act(async () => {
      pressButton(tree.root, 'habits.checklistCompleteConfirm')
    })
    expect(mockShowError).toHaveBeenCalledTimes(1)
  })
})

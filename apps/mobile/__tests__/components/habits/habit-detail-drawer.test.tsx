import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'

const TestRenderer = require('react-test-renderer')

const mockUpdateChecklistMutate = vi.fn()
const mockLogHabitMutateAsync = vi.fn()
const mockShowError = vi.fn()
const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
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
vi.mock('@/app/social/_components/new-pair-flow', () => {
  const ReactLib = require('react')
  return {
    NewPairFlow: ({ open }: { open: boolean }) =>
      open ? ReactLib.createElement('Text', null, 'pair-flow-open') : null,
  }
})
vi.mock('@/components/habits/habit-detail-drawer/habit-ask-astra-button', () => {
  const ReactLib = require('react')
  return {
    HabitAskAstraButton: ({ onPress }: { onPress: () => void }) =>
      ReactLib.createElement('Pressable', {
        accessibilityLabel: 'ask-astra',
        onPress,
      }),
  }
})
vi.mock('@/components/habits/habit-checklist', () => {
  const ReactLib = require('react')
  return {
    HabitChecklist: ({
      items,
      onToggle,
      onReset,
      onClear,
    }: {
      items: { text: string; isChecked: boolean }[]
      onToggle?: (index: number) => void
      onReset?: () => void
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
          accessibilityLabel: 'checklist-reset',
          onPress: () => onReset?.(),
        }),
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

  it('resets every checklist item to unchecked when reset is pressed', () => {
    const habit = createMockHabit({
      id: 'h-2',
      checklistItems: [
        { text: 'Warm up', isChecked: true },
        { text: 'Main set', isChecked: true },
      ],
    })

    const tree = render(<HabitDetailDrawer open onClose={vi.fn()} habit={habit} />)

    TestRenderer.act(() => {
      pressButton(tree.root, 'checklist-reset')
    })
    expect(mockUpdateChecklistMutate).toHaveBeenCalledWith({
      habitId: 'h-2',
      items: [
        { text: 'Warm up', isChecked: false },
        { text: 'Main set', isChecked: false },
      ],
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

  it('logs the habit and notifies onLogged when the checklist-complete confirm succeeds', async () => {
    const onLogged = vi.fn()
    const habit = createMockHabit({
      id: 'h-9',
      isCompleted: false,
      checklistItems: [{ text: 'Only item', isChecked: false }],
    })

    const tree = render(
      <HabitDetailDrawer open onClose={vi.fn()} habit={habit} onLogged={onLogged} />,
    )

    TestRenderer.act(() => {
      pressButton(tree.root, 'toggle-0')
    })
    await TestRenderer.act(async () => {
      pressButton(tree.root, 'habits.checklistCompleteConfirm')
    })

    expect(mockLogHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'h-9' })
    expect(onLogged).toHaveBeenCalledWith('h-9')
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('renders the description and linked goals and opens the description viewer on press', () => {
    const habit = createMockHabit({
      id: 'h-3',
      description: 'Two mile easy run',
      checklistItems: [],
      linkedGoals: [{ id: 'g-1', title: 'Marathon' }],
    })

    const tree = render(<HabitDetailDrawer open onClose={vi.fn()} habit={habit} />)

    expect(hasText(tree.root, 'Two mile easy run')).toBe(true)
    expect(hasText(tree.root, 'Marathon')).toBe(true)

    TestRenderer.act(() => {
      pressButton(tree.root, 'habits.detail.viewDescription')
    })
    expect(mockLogHabitMutateAsync).not.toHaveBeenCalled()
  })

  it('seeds a sub-habit chat draft and navigates when Ask Astra is pressed for a checklist habit', () => {
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    const onClose = vi.fn()
    const habit = createMockHabit({
      id: 'h-4',
      title: 'Strength',
      checklistItems: [{ text: 'Squats', isChecked: false }],
    })

    const tree = render(<HabitDetailDrawer open onClose={onClose} habit={habit} />)

    TestRenderer.act(() => {
      pressButton(tree.root, 'ask-astra')
    })

    expect(setItem).toHaveBeenCalledWith(
      'orbit-chat-draft',
      'habits.detail.askAstraSeedSubHabits:{"title":"Strength"}',
    )
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith('/chat')
  })

  it('seeds the default chat draft for a habit with no checklist', () => {
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    const habit = createMockHabit({
      id: 'h-5',
      title: 'Read',
      checklistItems: [],
    })

    const tree = render(<HabitDetailDrawer open onClose={vi.fn()} habit={habit} />)

    TestRenderer.act(() => {
      pressButton(tree.root, 'ask-astra')
    })

    expect(setItem).toHaveBeenCalledWith(
      'orbit-chat-draft',
      'habits.detail.askAstraSeedDefault:{"title":"Read"}',
    )
  })

  it('opens the buddy pair flow when pair-this-habit is pressed', () => {
    const habit = createMockHabit({ id: 'h-6', checklistItems: [] })

    const tree = render(<HabitDetailDrawer open onClose={vi.fn()} habit={habit} />)

    expect(hasText(tree.root, 'pair-flow-open')).toBe(false)
    TestRenderer.act(() => {
      pressButton(tree.root, 'social.buddies.pairThisHabit')
    })
    expect(hasText(tree.root, 'pair-flow-open')).toBe(true)
  })
})

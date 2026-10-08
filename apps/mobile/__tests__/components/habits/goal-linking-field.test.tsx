import { expandedTextControls, pressTextControl, expectPersonalTextLayout } from '@/__tests__/support/personal-text'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { FlatList, StyleSheet } from 'react-native'
import { GoalLinkingField } from '@/components/habits/goal-linking-field'

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let queryGoals: Record<string, unknown>[] = []

vi.mock('@/components/habits/create-goal-from-habit-sheet', () => ({
  CreateGoalFromHabitSheet: 'CreateGoalFromHabitSheet',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: queryGoals }),
}))
vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRow', props),
}))
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: 'BottomSheetAppTextInput',
}))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'default', currentTheme: 'light' }),
}))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#000000' }),
}))
function createGoalButton(root: { findAll: (predicate: (node: { props: Record<string, unknown>; findAll: (childPredicate: (child: { type: unknown; props: Record<string, unknown> }) => boolean) => unknown[] }) => boolean) => { props: { onPress: () => void } }[] }) {
  return root.findAll((node) =>
    node.props.accessibilityRole === 'button' &&
    node.findAll((child) => child.type === 'Text' && child.props.children === 'habits.form.createGoal').length > 0,
  )[0]!
}

describe.each(['Today', 'habit detail'])('GoalLinkingField lifecycle from %s', () => {
  beforeEach(() => {
    queryGoals = []
  })

  it('opens goal creation inside the habit surface and returns to the picker', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
      )
    })

    await TestRenderer.act(() => {
      (tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'ListRow')[0]!.props.onClick as () => void)()
    })
    await TestRenderer.act(() => {
      createGoalButton(tree.root).props.onPress()
    })

    expect(tree.root.findAllByType('Sheet')).toHaveLength(0)
    expect(tree.root.findByType('CreateGoalFromHabitSheet').props.open).toBe(true)

    await TestRenderer.act(() => {
      tree.root.findByType('CreateGoalFromHabitSheet').props.onClose()
    })
    await TestRenderer.act(() => {
      (tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'ListRow')[0]!.props.onClick as () => void)()
    })
    expect(tree.root.findAllByType('Sheet')).toHaveLength(1)
  })
})

it('selects a goal below the first viewport while the search keyboard is open', async () => {
  const onToggleGoal = vi.fn()
  queryGoals = Array.from({ length: 25 }, (_, index) => ({
    id: `goal-${index}`,
    title: `Goal ${index}`,
    status: 'Active',
    progressPercentage: index,
  }))
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={onToggleGoal} />,
    )
  })
  await TestRenderer.act(() => {
    (tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'ListRow')[0]!.props.onClick as () => void)()
  })

  expect(StyleSheet.flatten(tree.root.findByType('BottomSheetAppTextInput').props.style)).toMatchObject({ paddingHorizontal: 16, minHeight: 54 })
  const list = tree.root.findByType(FlatList)
  expect(list.props.nestedScrollEnabled).toBe(true)
  expect(list.props.keyboardShouldPersistTaps).toBe('handled')

  let row: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    row = TestRenderer.create(list.props.renderItem({ item: queryGoals[20], index: 20 }))
  })
  await TestRenderer.act(() => {
    row.root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'button')[0]!.props.onPress()
  })
  expect(onToggleGoal).toHaveBeenCalledWith('goal-20')

})

  it.each(['UnbrokenToken' .repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses typed text without changing selection for %s', async (name) => {
    const onToggle = vi.fn()
    queryGoals = [{ id: 'long-goal', title: name, status: 'Active', progressPercentage: 20 }]
    const element = <GoalLinkingField selectedGoalIds={['long-goal']} atGoalLimit={false} onToggleGoal={onToggle} />
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(element) })
    const disclosure = expandedTextControls(tree.root, name, false)[0]!
    expect(disclosure).toBeDefined()
    await expectPersonalTextLayout(tree.root, name, 1)
    await TestRenderer.act(() => pressTextControl(disclosure))
    expect(expandedTextControls(tree.root, name, true)).toHaveLength(1)
    expect(tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'ScrollView' && node.props.horizontal === true).length).toBeGreaterThan(0)
    expect(onToggle).not.toHaveBeenCalled()
    await TestRenderer.act(() => pressTextControl(expandedTextControls(tree.root, name, true)[0]!))
    await TestRenderer.act(() => (tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'ListRow')[0]!.props.onClick as () => void)())
    const row = tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === name && (node.props.accessibilityState as { selected?: boolean } | undefined)?.selected === true)[0]!
    expect(row).toBeDefined()
    await expectPersonalTextLayout(row, name)
    await TestRenderer.act(() => pressTextControl(row))
    expect(onToggle).toHaveBeenCalledWith('long-goal')
    await TestRenderer.act(() => tree.update(<></>))
  })

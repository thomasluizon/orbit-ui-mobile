import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { GoalLinkingField } from '@/components/habits/goal-linking-field'

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let showCreateGoalModal = false
const setShowCreateGoalModal = vi.fn((open: boolean) => {
  showCreateGoalModal = open
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
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
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    showCreateGoalModal,
    setShowCreateGoalModal,
  }),
}))

function createGoalButton(root: { findAll: (predicate: (node: { props: Record<string, unknown>; findAll: (childPredicate: (child: { type: unknown; props: Record<string, unknown> }) => boolean) => unknown[] }) => boolean) => Array<{ props: { onPress: () => void } }> }) {
  return root.findAll((node) =>
    node.props.accessibilityRole === 'button' &&
    node.findAll((child) => child.type === 'Text' && child.props.children === 'habits.form.createGoal').length > 0,
  )[0]!
}

describe.each(['Today', 'habit detail'])('GoalLinkingField lifecycle from %s', () => {
  beforeEach(() => {
    showCreateGoalModal = false
    setShowCreateGoalModal.mockClear()
  })

  it('closes creation and reopens the picker', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
      )
    })

    await TestRenderer.act(() => {
      tree.root.findByType('ListRow').props.onClick()
    })
    await TestRenderer.act(() => {
      createGoalButton(tree.root).props.onPress()
    })

    expect(tree.root.findAllByType('Sheet')).toHaveLength(0)
    expect(showCreateGoalModal).toBe(true)

    setShowCreateGoalModal(false)
    await TestRenderer.act(() => {
      tree.root.findByType('ListRow').props.onClick()
    })
    expect(tree.root.findAllByType('Sheet')).toHaveLength(1)
  })
})

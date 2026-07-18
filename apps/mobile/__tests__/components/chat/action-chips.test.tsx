import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@orbit/shared/types/chat'

import { ActionChips } from '@/components/chat/action-chips'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === 'white') return '#ffffff'
      return '#111111'
    },
  },
)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`
      return key
    },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createColors: () => colorProxy,
  }
})

vi.mock('@/components/chat/conflict-warning', () => {
  const React = require('react')
  return {
    ConflictWarning: () => React.createElement('ConflictWarning'),
  }
})

vi.mock('@/components/ui/icons', () => {
  const React = require('react')
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
    CheckCircle: createIcon('CheckCircle'),
    XCircle: createIcon('XCircle'),
    Info: createIcon('Info'),
  }
})

function makeAction(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    type: 'CreateHabit',
    status: 'Success',
    entityId: 'h-1',
    entityName: 'Meditate',
    error: null,
    field: null,
    suggestedSubHabits: null,
    conflictWarning: null,
    ...overrides,
  }
}

function findPressableByType(root: any) {
  // Pressable from react-native expands into a host View AND a function-component
  // node in react-test-renderer; both inherit accessibilityRole and onPress.
  // Count only the outermost owner: nodes whose `type` is a function/object
  // (the Pressable component itself), not the inner host View string.
  return root.findAll(
    (node: any) =>
      node.props &&
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      typeof node.type !== 'string',
  )
}

describe('ActionChips (mobile)', () => {
  it.each<{ name: string; overrides: Partial<ActionResult>; handler: boolean; expected: number }>([
    { name: 'renders successful Create chip as a Pressable when onChipClick is provided', overrides: { type: 'CreateHabit', status: 'Success', entityId: 'h-1' }, handler: true, expected: 1 },
    { name: 'does not render Delete chip as Pressable even with handler', overrides: { type: 'DeleteHabit', status: 'Success', entityId: 'h-1' }, handler: true, expected: 0 },
    { name: 'does not render DeleteGoal chip as Pressable even with handler', overrides: { type: 'DeleteGoal', status: 'Success', entityId: 'g-1' }, handler: true, expected: 0 },
    { name: 'does not render Failed chip as Pressable even with handler', overrides: { type: 'CreateHabit', status: 'Failed', entityId: 'h-1', error: 'oops' }, handler: true, expected: 0 },
    { name: 'does not render as Pressable when no handler is provided', overrides: { type: 'CreateHabit', status: 'Success', entityId: 'h-1' }, handler: false, expected: 0 },
    { name: 'does not render chip with null entityId as Pressable', overrides: { type: 'CreateHabit', status: 'Success', entityId: null }, handler: true, expected: 0 },
  ])('$name', ({ overrides, handler, expected }) => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction(overrides)]}
          onChipClick={handler ? () => {} : undefined}
        />,
      )
    })
    expect(findPressableByType(tree.root)).toHaveLength(expected)
  })

  it('calls onChipClick with entityId and actionType on press', () => {
    const onChipClick = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction({ type: 'CreateHabit', status: 'Success', entityId: 'h-42' })]}
          onChipClick={onChipClick}
        />,
      )
    })
    const [pressable] = findPressableByType(tree.root)
    TestRenderer.act(() => {
      pressable?.props.onPress?.()
    })
    expect(onChipClick).toHaveBeenCalledWith('h-42', 'CreateHabit')
  })

  it('calls onChipClick with goal entityId and actionType on press', () => {
    const onChipClick = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction({ type: 'UpdateGoal', status: 'Success', entityId: 'g-42' })]}
          onChipClick={onChipClick}
        />,
      )
    })
    const [pressable] = findPressableByType(tree.root)
    TestRenderer.act(() => {
      pressable?.props.onPress?.()
    })
    expect(onChipClick).toHaveBeenCalledWith('g-42', 'UpdateGoal')
  })

  it('does not render tag mutation chips as Pressable even with handler', () => {
    for (const type of ['CreateTag', 'UpdateTag', 'DeleteTag']) {
      let tree: any
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          <ActionChips
            actions={[makeAction({ type, status: 'Success', entityId: 'tag-1' })]}
            onChipClick={() => {}}
          />,
        )
      })
      expect(findPressableByType(tree.root)).toHaveLength(0)
    }
  })

  it('renders localized labels for the new tag and reorder action types', () => {
    const cases: Array<[string, string]> = [
      ['CreateTag', 'chat.action.createdTag'],
      ['UpdateTag', 'chat.action.updatedTag'],
      ['DeleteTag', 'chat.action.deletedTag'],
      ['ReorderGoals', 'chat.action.reorderedGoals'],
      ['ReorderHabits', 'chat.action.reorderedHabits'],
    ]
    for (const [type, labelKey] of cases) {
      let tree: any
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          <ActionChips actions={[makeAction({ type, entityName: 'Work' })]} />,
        )
      })
      const matches = tree.root.findAll(
        (node: any) =>
          typeof node.props?.children === 'string' &&
          node.props.children.startsWith(labelKey),
      )
      expect(matches.length).toBeGreaterThan(0)
    }
  })

})

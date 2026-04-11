import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@orbit/shared/types/chat'

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

vi.mock('lucide-react-native', () => {
  const React = require('react')
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
    CheckCircle: createIcon('CheckCircle'),
    XCircle: createIcon('XCircle'),
    Info: createIcon('Info'),
  }
})

import { ActionChips } from '@/components/chat/action-chips'

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
  it('renders successful Create chip as a Pressable when onChipClick is provided', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction({ type: 'CreateHabit', status: 'Success', entityId: 'h-1' })]}
          onChipClick={() => {}}
        />,
      )
    })
    const pressables = findPressableByType(tree.root)
    expect(pressables.length).toBe(1)
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

  it('does not render Delete chip as Pressable even with handler', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction({ type: 'DeleteHabit', status: 'Success', entityId: 'h-1' })]}
          onChipClick={() => {}}
        />,
      )
    })
    const pressables = findPressableByType(tree.root)
    expect(pressables.length).toBe(0)
  })

  it('does not render Failed chip as Pressable even with handler', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[
            makeAction({ type: 'CreateHabit', status: 'Failed', entityId: 'h-1', error: 'oops' }),
          ]}
          onChipClick={() => {}}
        />,
      )
    })
    expect(findPressableByType(tree.root).length).toBe(0)
  })

  it('does not render as Pressable when no handler is provided', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction({ type: 'CreateHabit', status: 'Success', entityId: 'h-1' })]}
        />,
      )
    })
    expect(findPressableByType(tree.root).length).toBe(0)
  })

  it('does not render chip with null entityId as Pressable', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ActionChips
          actions={[makeAction({ type: 'CreateHabit', status: 'Success', entityId: null })]}
          onChipClick={() => {}}
        />,
      )
    })
    expect(findPressableByType(tree.root).length).toBe(0)
  })
})

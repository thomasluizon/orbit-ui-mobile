import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClarificationRequest } from '@orbit/shared/types'

// react-test-renderer ships as CJS-only and doesn't surface ESM-friendly types
// for the bits we use, so we declare a local shape and require() it the same
// way the sibling pending-operation-card.test.tsx does.
interface TestNode {
  type: unknown
  props: {
    children?: unknown
    onPress?: (...args: unknown[]) => unknown
    [key: string]: unknown
  }
}

interface TestTreeRoot extends TestNode {
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestInstance {
  root: TestTreeRoot
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer: TestRendererApi = require('react-test-renderer')

interface ColorRecord {
  [key: string]: string
}

const colorProxy = new Proxy<ColorRecord>(
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
    t: (key: string) => key,
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}))

vi.mock('@/lib/theme', () => ({
  radius: { xl: 20, full: 9999 },
  shadows: { sm: {} },
}))

vi.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  return {
    Check: (props: Record<string, unknown>) => React.createElement('Check', props),
  }
})

const mutateAsync = vi.fn()
const isPendingRef = { current: false }

vi.mock('@/hooks/use-resolve-clarification', () => ({
  useResolveClarification: () => ({
    mutateAsync,
    get isPending() {
      return isPendingRef.current
    },
  }),
}))

import { ClarificationCard } from '@/components/chat/clarification-card'

function findPressables(root: TestTreeRoot): TestNode[] {
  return root.findAll(
    (node) =>
      node.props != null &&
      typeof node.props.onPress === 'function' &&
      typeof node.type !== 'string',
  )
}

function findTextNodesWithChild(root: TestTreeRoot, text: string): TestNode[] {
  return root.findAll((node) => {
    if (typeof node.type !== 'function' && node.type !== 'Text') return false
    const children = node.props?.children
    if (typeof children === 'string' && children === text) return true
    if (Array.isArray(children) && children.includes(text)) return true
    return false
  })
}

const baseClarification: ClarificationRequest = {
  question: 'habits.clarification.questionFallback',
  operationId: '00000000-0000-0000-0000-000000000001',
  missingArgumentKey: 'frequency_unit',
  quickActions: [
    { label: 'habits.clarification.quickAction.daily', value: '{"frequency_unit":"Day","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.weekly', value: '{"frequency_unit":"Week","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.threePerWeek', value: '{"frequency_unit":"Week","frequency_quantity":3,"is_flexible":true}', description: null },
    { label: 'habits.clarification.quickAction.oneTime', value: '{"frequency_unit":null}', description: null },
  ],
}

describe('ClarificationCard (mobile)', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    isPendingRef.current = false
  })

  it('renders four quick-action buttons', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const buttons = findPressables(tree.root)
    expect(buttons).toHaveLength(4)
  })

  it('renders the question text', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const questions = findTextNodesWithChild(tree.root, 'habits.clarification.questionFallback')
    expect(questions.length).toBeGreaterThan(0)
  })

  it('calls mutateAsync with the chosen value when a button is pressed', async () => {
    mutateAsync.mockResolvedValueOnce({ operation: { status: 'Succeeded' } })

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    expect(mutateAsync).toHaveBeenCalledWith({
      operationId: '00000000-0000-0000-0000-000000000001',
      value: '{"frequency_unit":"Day","frequency_quantity":1}',
    })
  })

  it('shows success text after a successful resolve', async () => {
    mutateAsync.mockResolvedValueOnce({ operation: { status: 'Succeeded' } })

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ClarificationCard clarificationRequest={baseClarification} entityName="meditation" />,
      )
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    const successNodes = findTextNodesWithChild(tree.root, 'habits.clarification.successCreated')
    expect(successNodes.length).toBeGreaterThan(0)
  })

  it('shows expired-error text when resolve throws a 404', async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 404 }))

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    const errorNodes = findTextNodesWithChild(tree.root, 'habits.clarification.errorExpired')
    expect(errorNodes.length).toBeGreaterThan(0)
  })

  it('shows generic-error text when resolve throws a non-404 error', async () => {
    // No .status property — exercises the `status === 0` fallback path.
    mutateAsync.mockRejectedValueOnce(new Error('network error'))

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    const errorNodes = findTextNodesWithChild(tree.root, 'habits.clarification.errorGeneric')
    expect(errorNodes.length).toBeGreaterThan(0)
  })

  it('shows already-resolved error when resolve throws a 409', async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    const errorNodes = findTextNodesWithChild(tree.root, 'habits.clarification.errorAlreadyResolved')
    expect(errorNodes.length).toBeGreaterThan(0)
  })

  it('shows expired-error text when resolve throws a 410 Gone', async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 410 }))

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    const errorNodes = findTextNodesWithChild(tree.root, 'habits.clarification.errorExpired')
    expect(errorNodes.length).toBeGreaterThan(0)
  })

  it('shows generic-error text when operation.status is not Succeeded', async () => {
    mutateAsync.mockResolvedValueOnce({ operation: { status: 'Denied' } })

    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    if (!firstButton?.props.onPress) throw new Error('first button missing onPress')
    await TestRenderer.act(async () => {
      await firstButton.props.onPress!()
    })

    const errorNodes = findTextNodesWithChild(tree.root, 'habits.clarification.errorGeneric')
    expect(errorNodes.length).toBeGreaterThan(0)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClarificationRequest } from '@orbit/shared/types/chat'

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
  const React = require('react')
  return {
    Check: (props: any) => React.createElement('Check', props),
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

function findPressables(root: any) {
  return root.findAll(
    (node: any) =>
      node.props &&
      typeof node.props.onPress === 'function' &&
      typeof node.type !== 'string',
  )
}

function findTextNodesWithChild(root: any, text: string) {
  return root.findAll((node: any) => {
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
    { label: 'habits.clarification.quickAction.daily', value: '{"frequency_unit":"Day","frequency_quantity":1}' },
    { label: 'habits.clarification.quickAction.weekly', value: '{"frequency_unit":"Week","frequency_quantity":1}' },
    { label: 'habits.clarification.quickAction.threePerWeek', value: '{"frequency_unit":"Week","frequency_quantity":3,"is_flexible":true}' },
    { label: 'habits.clarification.quickAction.oneTime', value: '{"frequency_unit":null}' },
  ],
}

describe('ClarificationCard (mobile)', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    isPendingRef.current = false
  })

  it('renders four quick-action buttons', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const buttons = findPressables(tree.root)
    expect(buttons).toHaveLength(4)
  })

  it('renders the question text', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const questions = findTextNodesWithChild(tree.root, 'habits.clarification.questionFallback')
    expect(questions.length).toBeGreaterThan(0)
  })

  it('calls mutateAsync with the chosen value when a button is pressed', async () => {
    mutateAsync.mockResolvedValueOnce({ operation: { status: 'Succeeded' } })

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    await TestRenderer.act(async () => {
      await firstButton.props.onPress()
    })

    expect(mutateAsync).toHaveBeenCalledWith({
      operationId: '00000000-0000-0000-0000-000000000001',
      value: '{"frequency_unit":"Day","frequency_quantity":1}',
    })
  })

  it('shows success text after a successful resolve', async () => {
    mutateAsync.mockResolvedValueOnce({ operation: { status: 'Succeeded' } })

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ClarificationCard clarificationRequest={baseClarification} entityName="meditation" />,
      )
    })

    const [firstButton] = findPressables(tree.root)
    await TestRenderer.act(async () => {
      await firstButton.props.onPress()
    })

    const successNodes = tree.root.findAll((node: any) => {
      const children = node.props?.children
      return typeof children === 'string' && children === 'habits.clarification.successCreated'
    })
    expect(successNodes.length).toBeGreaterThan(0)
  })

  it('shows expired-error text when resolve throws a 404', async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 404 }))

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ClarificationCard clarificationRequest={baseClarification} />)
    })

    const [firstButton] = findPressables(tree.root)
    await TestRenderer.act(async () => {
      await firstButton.props.onPress()
    })

    const errorNodes = findTextNodesWithChild(tree.root, 'habits.clarification.errorExpired')
    expect(errorNodes.length).toBeGreaterThan(0)
  })
})

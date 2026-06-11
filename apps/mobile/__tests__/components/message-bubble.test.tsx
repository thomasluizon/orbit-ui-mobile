import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'

import { MessageBubble } from '@/components/message-bubble'

interface TestNode {
  type: unknown
  props: {
    children?: unknown
    onPress?: (...args: unknown[]) => unknown
    accessibilityLabel?: string
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


const TestRenderer: TestRendererApi = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'fgOnPrimary') return '#ffffff'
          return '#111111'
        },
      },
    ),
  tintFromPrimary: () => 'rgba(17, 17, 17, 0.18)',
}))

vi.mock('lucide-react-native', () => {

  const React = require('react')
  return {
    Sparkles: (props: Record<string, unknown>) =>
      React.createElement('Sparkles', props),
    ArrowUpRight: (props: Record<string, unknown>) =>
      React.createElement('ArrowUpRight', props),
  }
})

const push = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/components/ui/markdown', () => {
  const React = require('react')
  return {
    Markdown: ({ children }: { children: string }) =>
      React.createElement('Markdown', null, children),
  }
})

vi.mock('@/components/chat/action-chips', () => ({
  ActionChips: () => null,
}))
vi.mock('@/components/chat/breakdown-suggestion', () => ({
  BreakdownSuggestion: () => null,
}))
vi.mock('@/components/chat/clarification-card', () => ({
  ClarificationCard: () => null,
}))
vi.mock('@/components/chat/pending-operation-card', () => ({
  PendingOperationCard: () => null,
}))

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'ai',
    content: 'Hello',
    timestamp: new Date(),
    ...overrides,
  }
}

describe('MessageBubble trace footer (mobile)', () => {
  it('never renders a trace footer, even when the AI message has a correlationId', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'ai', correlationId: 'req-abc-123' })} />,
      )
    })

    const traceNodes = tree.root.findAll(
      (node) =>
        node.props != null &&
        (node.props.accessibilityLabel === 'chat.trace.copy' ||
          (typeof node.props.children === 'string' &&
            node.props.children.includes('req-abc-123'))),
    )
    expect(traceNodes).toHaveLength(0)
  })
})

function findSurfaceLinks(root: TestTreeRoot, label: string): TestNode[] {
  return root.findAll(
    (node) =>
      node.props != null &&
      typeof node.type !== 'string' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === label,
  )
}

describe('MessageBubble related-surfaces footer (mobile)', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it('renders deep links for known surfaces and drops unknown ones', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'ai',
            relatedSurfaces: ['gamification', 'mystery'],
          })}
        />,
      )
    })

    const links = findSurfaceLinks(tree.root, 'chat.related.surface.gamification')
    expect(links).toHaveLength(1)
    expect(findSurfaceLinks(tree.root, 'chat.related.surface.mystery')).toHaveLength(0)

    await TestRenderer.act(async () => {
      links[0]?.props.onPress?.()
    })
    expect(push).toHaveBeenCalledWith('/achievements')
  })

  it('does not render the footer for user messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({ role: 'user', relatedSurfaces: ['gamification'] })}
        />,
      )
    })

    expect(findSurfaceLinks(tree.root, 'chat.related.surface.gamification')).toHaveLength(0)
  })
})

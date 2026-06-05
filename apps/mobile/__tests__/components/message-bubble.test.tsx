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

const setStringAsync = vi.fn().mockResolvedValue(true)

vi.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => setStringAsync(value),
}))

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
}))

vi.mock('lucide-react-native', () => {

  const React = require('react')
  return {
    Sparkles: (props: Record<string, unknown>) => React.createElement('Sparkles', props),
    User: (props: Record<string, unknown>) => React.createElement('User', props),
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
vi.mock('@/components/chat/format-chat-message', () => ({
  formatChatMessage: (text: string) => text,
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

function findTraceFooter(root: TestTreeRoot): TestNode[] {
  return root.findAll(
    (node) =>
      node.props != null &&
      typeof node.type !== 'string' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === 'chat.trace.copy',
  )
}

describe('MessageBubble trace footer (mobile)', () => {
  beforeEach(() => {
    setStringAsync.mockClear()
  })

  it('renders the trace footer for AI messages with a correlationId', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'ai', correlationId: 'req-abc-123' })} />,
      )
    })

    expect(findTraceFooter(tree.root)).toHaveLength(1)
  })

  it('does not render the trace footer for user messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'user', correlationId: 'req-abc-123' })} />,
      )
    })

    expect(findTraceFooter(tree.root)).toHaveLength(0)
  })

  it('does not render the trace footer when correlationId is null', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'ai', correlationId: null })} />,
      )
    })

    expect(findTraceFooter(tree.root)).toHaveLength(0)
  })

  it('copies the correlationId to the clipboard when the footer is pressed', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'ai', correlationId: 'req-abc-123' })} />,
      )
    })

    const [footer] = findTraceFooter(tree.root)
    if (!footer?.props.onPress) throw new Error('trace footer missing onPress')
    await TestRenderer.act(async () => {
      await footer.props.onPress!()
    })

    expect(setStringAsync).toHaveBeenCalledWith('req-abc-123')
  })
})

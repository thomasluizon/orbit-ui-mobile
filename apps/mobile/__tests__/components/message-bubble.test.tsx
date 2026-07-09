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
    i18n: { language: 'en-US' },
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
        node.props.accessibilityLabel === 'chat.trace.copy' ||
          (typeof node.props.children === 'string' &&
            node.props.children.includes('req-abc-123')),
    )
    expect(traceNodes).toHaveLength(0)
  })
})

function findSurfaceLinks(root: TestTreeRoot, label: string): TestNode[] {
  return root.findAll(
    (node) =>
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

function collectStrings(root: TestTreeRoot): string[] {
  return root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string)
}

describe('MessageBubble habit-list card (mobile)', () => {
  it('renders the habit-list card for AI messages with a habitList payload', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'ai',
            content: 'Here are your habits:',
            habitList: {
              scope: 'today',
              items: [
                { id: 'h1', title: 'Meditate', emoji: null, depth: 0, isBadHabit: false, status: 'today' },
                { id: 'h2', title: 'Floss', emoji: null, depth: 0, isBadHabit: false, status: 'overdue' },
              ],
            },
          })}
        />,
      )
    })

    const strings = collectStrings(tree.root)
    expect(strings).toContain('Meditate')
    expect(strings).toContain('Floss')
    expect(strings).toContain('chat.habitList.today')
    expect(strings).toContain('chat.habitList.overdue')
  })

  it('strips the habit-list directive from rendered content', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'ai',
            content: 'Here are your habits for today:\n[[orbit:habits:today]]',
            habitList: { scope: 'today', items: [] },
          })}
        />,
      )
    })

    const strings = collectStrings(tree.root)
    expect(strings).toContain('Here are your habits for today:')
    expect(strings.some((value) => value.includes('orbit:habits'))).toBe(false)
  })

  it('does not render the card for user messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'user',
            habitList: {
              scope: 'all',
              items: [{ id: 'h1', title: 'Meditate', emoji: null, depth: 0, isBadHabit: false, status: 'today' }],
            },
          })}
        />,
      )
    })

    expect(collectStrings(tree.root)).not.toContain('Meditate')
  })
})

describe('MessageBubble goal-list card (mobile)', () => {
  it('renders the goal-list card for AI messages with a goalList payload', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'ai',
            content: 'Here are your goals:',
            goalList: {
              items: [
                { id: 'g1', title: 'Read books', current: 12, target: 30, unit: 'books', deadline: null },
                { id: 'g2', title: 'Run distance', current: 50, target: 100, unit: 'km', deadline: '2026-12-31' },
              ],
            },
          })}
        />,
      )
    })

    const strings = collectStrings(tree.root)
    expect(strings).toContain('Read books')
    expect(strings).toContain('Run distance')
    expect(strings).toContain('chat.goalList.percentage:{"pct":40}')
    expect(strings).toContain('chat.goalList.percentage:{"pct":50}')
  })

  it('does not render the card for user messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'user',
            goalList: {
              items: [{ id: 'g1', title: 'Read books', current: 12, target: 30, unit: 'books', deadline: null }],
            },
          })}
        />,
      )
    })

    expect(collectStrings(tree.root)).not.toContain('Read books')
  })
})

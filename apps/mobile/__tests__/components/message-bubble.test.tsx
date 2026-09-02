import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import * as Clipboard from 'expo-clipboard'

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

vi.mock('@/components/ui/icons', () => {

  const React = require('react')
  return {
    Sparkles: (props: Record<string, unknown>) =>
      React.createElement('Sparkles', props),
    ArrowUpRight: (props: Record<string, unknown>) =>
      React.createElement('ArrowUpRight', props),
    Copy: (props: Record<string, unknown>) => React.createElement('Copy', props),
    Check: (props: Record<string, unknown>) => React.createElement('Check', props),
  }
})

vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(undefined) }))

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
  ActionChips: (props: Record<string, unknown>) =>
    require('react').createElement('ActionChips', props),
}))
vi.mock('@/components/chat/breakdown-suggestion', () => ({
  BreakdownSuggestion: (props: Record<string, unknown>) =>
    require('react').createElement('BreakdownSuggestion', props),
}))
vi.mock('@/components/chat/clarification-card', () => ({
  ClarificationCard: (props: Record<string, unknown>) =>
    require('react').createElement('ClarificationCard', props),
}))
vi.mock('@/components/chat/pending-operation-card', () => ({
  PendingOperationCard: (props: Record<string, unknown>) =>
    require('react').createElement('PendingOperationCard', props),
}))
vi.mock('@/components/chat/habit-list-card', () => ({
  HabitListCard: ({ habitList }: { habitList: { items: { id: string; title: string; status: string }[] } }) => {
    const React = require('react')
    return React.createElement(
      'HabitListCard',
      null,
      ...habitList.items.flatMap((item) => [
        React.createElement('Text', { key: `${item.id}-title` }, item.title),
        React.createElement('Text', { key: `${item.id}-status` }, `chat.habitList.${item.status}`),
      ]),
    )
  },
}))
vi.mock('@/components/chat/goal-list-card', () => ({
  GoalListCard: (props: {
    goalList: { items: { id: string; title: string; current: number; target: number }[] }
    onOpenGoal?: (id: string) => void
  }) => {
    const React = require('react')
    const { goalList } = props
    return React.createElement(
      'GoalListCard',
      props,
      ...goalList.items.flatMap((item) => [
        React.createElement('Text', { key: `${item.id}-title` }, item.title),
        React.createElement('Text', { key: `${item.id}-progress` }, `chat.goalList.percentage:{"pct":${Math.round((item.current / item.target) * 100)}}`),
      ]),
    )
  },
}))
vi.mock('@/components/chat/operation-outcomes', () => ({
  OperationOutcomes: (props: Record<string, unknown>) =>
    require('react').createElement('OperationOutcomes', props),
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
    await TestRenderer.act(() => {
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

describe('MessageBubble copy control (mobile)', () => {
  it('copies directive-free AI source text and confirms the action', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({ content: 'Your habits\n[[orbit:habits:today]]' })}
        />,
      )
    })

    const copy = tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')[0]
    await TestRenderer.act(async () => {
      await copy?.props.onPress?.()
    })

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Your habits')
    expect(
      tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copied').length,
    ).toBeGreaterThan(0)
  })

  it('copies sent source text', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'user', content: '**Walk**\n- Water' })} />,
      )
    })

    const copy = tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')[0]
    await TestRenderer.act(async () => {
      await copy?.props.onPress?.()
    })

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('**Walk**\n- Water')
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
    await TestRenderer.act(() => {
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
    const linkStyle = links[0]?.props.style as ((state: { pressed: boolean }) => unknown[])
    expect(linkStyle({ pressed: true })).toHaveLength(2)
    expect(linkStyle({ pressed: false })).toHaveLength(2)

    await TestRenderer.act(() => {
      links[0]?.props.onPress?.()
    })
    expect(push).toHaveBeenCalledWith('/progress')
  })

  it('does not render the footer for user messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
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
    await TestRenderer.act(() => {
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
    await TestRenderer.act(() => {
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

  it('hides a partial directive only while the AI message is streaming', async () => {
    const message = makeMessage({ role: 'ai', content: 'Keep this literal [[or' })
    let streamingTree!: TestInstance
    await TestRenderer.act(() => {
      streamingTree = TestRenderer.create(<MessageBubble message={message} isStreaming />)
    })

    expect(collectStrings(streamingTree.root)).toContain('Keep this literal')

    let finalTree!: TestInstance
    await TestRenderer.act(() => {
      finalTree = TestRenderer.create(<MessageBubble message={message} />)
    })
    expect(collectStrings(finalTree.root)).toContain('Keep this literal [[or')
  })

  it('preserves user-authored directive text byte-for-byte', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            role: 'user',
            content: '[[orbit:goals]]',
          })}
        />,
      )
    })

    expect(collectStrings(tree.root)).toContain('[[orbit:goals]]')
  })

  it('does not render the card for user messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
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
    await TestRenderer.act(() => {
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
    await TestRenderer.act(() => {
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

  it('routes a goal row through the conversation action handler', async () => {
    const onActionChipClick = vi.fn()
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <MessageBubble
          message={makeMessage({
            goalList: {
              items: [{ id: 'g1', title: 'Read books', current: 12, target: 30, unit: 'books', deadline: null }],
            },
          })}
          onActionChipClick={onActionChipClick}
        />,
      )
    })
    const goalCard = tree.root.findAll((node) => node.type === 'GoalListCard')[0]

    await TestRenderer.act(() => {
      const openGoal = goalCard?.props.onOpenGoal as ((id: string) => void)
      openGoal('g1')
    })

    expect(onActionChipClick).toHaveBeenCalledWith('g1', 'CreateGoal')
  })
})

describe('MessageBubble interactive blocks (mobile)', () => {
  it('renders each actionable AI payload and dismisses a rejected breakdown in place', async () => {
    const onActionChipClick = vi.fn()
    const onBreakdownConfirmed = vi.fn()
    const onConfirmExecute = vi.fn()
    const onPrepareStepUp = vi.fn()
    const onVerifyStepUp = vi.fn()
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <MessageBubble
          animateEntry
          message={makeMessage({
            imageUrl: 'file:///morning.jpg',
            actions: [
              { type: 'LogHabit', status: 'Success', entityId: 'habit-1' },
              {
                type: 'BreakDownHabit',
                status: 'Suggestion',
                entityName: 'Morning',
                suggestedSubHabits: [{ title: 'Walk' }],
              },
              {
                type: 'LogHabit',
                status: 'NeedsClarification',
                entityName: 'Walk',
                clarificationRequest: {
                  question: 'Which walk?',
                  operationId: '11111111-1111-4111-8111-111111111111',
                  missingArgumentKey: 'habitId',
                  quickActions: [{ label: 'Morning walk', value: 'habit-1' }],
                },
              },
            ],
            pendingOperations: [{
              id: 'pending-1',
              capabilityId: 'habits.delete',
              displayName: 'DeleteHabit',
              summary: 'Delete Morning walk',
              riskClass: 'Destructive',
              confirmationRequirement: 'FreshConfirmation',
              expiresAtUtc: '2026-09-02T12:00:00Z',
            }],
            operations: [{
              operationId: 'operation-1',
              sourceName: 'LogHabit',
              riskClass: 'Low',
              confirmationRequirement: 'None',
              status: 'Succeeded',
              targetName: 'Morning walk',
            }],
          })}
          onActionChipClick={onActionChipClick}
          onBreakdownConfirmed={onBreakdownConfirmed}
          onPendingOperationConfirmExecute={onConfirmExecute}
          onPendingOperationPrepareStepUp={onPrepareStepUp}
          onPendingOperationVerifyStepUp={onVerifyStepUp}
        />,
      )
    })

    expect(
      tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.attachmentPreview').length,
    ).toBeGreaterThan(0)
    const actionChips = tree.root.findAll((node) => node.type === 'ActionChips')[0]
    expect(actionChips).toBeDefined()
    await TestRenderer.act(() => {
      const selectAction = actionChips?.props.onChipClick as ((id: string, type: string) => void)
      selectAction('habit-1', 'LogHabit')
    })
    expect(onActionChipClick).toHaveBeenCalledWith('habit-1', 'LogHabit')

    const clarification = tree.root.findAll((node) => node.type === 'ClarificationCard')[0]
    expect(clarification?.props.entityName).toBe('Walk')
    const pending = tree.root.findAll((node) => node.type === 'PendingOperationCard')[0]
    expect(pending?.props).toMatchObject({
      onConfirmExecute,
      onPrepareStepUp,
      onVerifyStepUp,
    })
    const outcomes = tree.root.findAll((node) => node.type === 'OperationOutcomes')[0]
    expect(outcomes?.props.operations).toHaveLength(1)

    const breakdown = tree.root.findAll((node) => node.type === 'BreakdownSuggestion')[0]
    await TestRenderer.act(() => {
      const confirmBreakdown = breakdown?.props.onConfirmed as (() => void)
      confirmBreakdown()
    })
    expect(onBreakdownConfirmed).toHaveBeenCalledOnce()
    await TestRenderer.act(() => {
      const cancelBreakdown = breakdown?.props.onCancelled as (() => void)
      cancelBreakdown()
    })
    expect(tree.root.findAll((node) => node.type === 'BreakdownSuggestion')).toHaveLength(0)
  })
})

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import * as Clipboard from 'expo-clipboard'
import { createTokensV2 } from '@/lib/theme'
import { Check, Copy } from '@/components/ui/icons'

import { MessageBubble } from '@/components/message-bubble'
import { useChatStore } from '@/stores/chat-store'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { BlockFrame } from '@/components/ui/block-frame'
import { renderedText } from '../support/react-test-renderer'
import { makeActionResult, makeAgentOperationResult, makeClarificationPreviewMessage, makeHeldGoalMessage, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
const realClarification = vi.hoisted(() => ({ current: false }))
const resolveClarification = vi.hoisted(() => vi.fn())
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => {
  vi.useRealTimers()
  realClarification.current = false
  resolveClarification.mockReset()
})

interface TestNode {
  type: unknown
  props: {
    children?: unknown
    onPress?: (...args: unknown[]) => unknown
    onChangeText?: (value: string) => void
    accessibilityLabel?: string
    [key: string]: unknown
  }
}

interface TestTreeRoot extends TestNode {
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestInstance {
  root: TestTreeRoot
  update(element: React.ReactNode): void
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}


const TestRenderer: TestRendererApi = require('react-test-renderer')

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    i18n: { language: 'en-US' },
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))

vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/hooks/use-resolve-clarification', () => ({
  useResolveClarification: () => ({ mutateAsync: resolveClarification, isPending: false }),
}))

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

describe('MessageBubble write blocks (mobile)', () => {
  function blocks(tree: TestInstance) {
    return tree.root.findAll((node) => node.type === BlockFrame)
  }

  function press(tree: TestInstance, label: string) {
    const button = tree.root.findAll((node) => typeof node.props.onPress === 'function' && renderedText(node.props.children).includes(label))[0]
    if (!button) throw new Error(`Missing button ${label}`)
    return button.props.onPress!
  }

  it('shows one real preview block and finishes it in place', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created',
    } } })
    const onOpenTarget = vi.fn()
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeHeldHabitMessage()} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={confirm} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} onActionChipClick={onOpenTarget} />)
    })
    expect(blocks(tree)).toHaveLength(1)
    expect(renderedText(tree.root)).toContain('chat.operation.edit')
    expect(renderedText(tree.root)).toContain('chat.operation.reject')
    expect(renderedText(tree.root)).not.toContain('chat.operation.risk')
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('status.done')
    expect(blocks(tree)).toHaveLength(1)
    await TestRenderer.act(() => { press(tree, 'chat.action.open')() })
    expect(onOpenTarget).toHaveBeenCalledWith('habit-created', 'CreateHabit')
  })

  it('keeps an approved preview settled after the bubble remounts', async () => {
    const message = makeHeldHabitMessage()
    useChatStore.setState({ messages: [message] })
    const onOpenTarget = vi.fn()
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created',
    } } })
    const props = { onActionChipClick: onOpenTarget, onPendingOperationRevise: vi.fn(), onPendingOperationConfirmExecute: confirm,
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => {
      const current = useChatStore((state) => state.messages[0]!)
      return <MessageBubble {...props} message={current} />
    }
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('status.done')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).not.toContain('chat.operation.approve')
    expect(renderedText(tree.root)).toContain('status.done')
    await TestRenderer.act(() => { press(tree, 'chat.action.open')() })
    expect(onOpenTarget).toHaveBeenCalledWith('habit-created', 'CreateHabit')
    expect(useChatStore.getState().messages).toHaveLength(1)
  })

  it('keeps a rejected preview rejected after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const onPendingOperationRevise = vi.fn().mockResolvedValue({ ok: true, result: { cancelled: true } })
    const StoredBubble = () => {
      const message = useChatStore((state) => state.messages[0]!)
      return <MessageBubble message={message} onPendingOperationRevise={onPendingOperationRevise} onPendingOperationConfirmExecute={vi.fn()} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} />
    }
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.reject')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.rejected')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).not.toContain('chat.operation.approve')
    expect(renderedText(tree.root)).toContain('chat.operation.rejected')
  })

  it('keeps a failed approval retryable after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const confirm = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'temporary' })
      .mockResolvedValueOnce({ ok: true, response: { operation: {
        operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low',
        confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created',
      } } })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationConfirmExecute: confirm,
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('status.failed')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).toContain('status.failed')
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('status.done')
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('keeps an expired preview stale after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const confirm = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationRefresh: vi.fn(),
      onPendingOperationConfirmExecute: confirm, onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.stale')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).toContain('chat.operation.stale')
    expect(renderedText(tree.root)).not.toContain('chat.operation.approve')
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('keeps a stale revision blocked after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const revise = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' })
    const callbacks = { onPendingOperationRevise: revise, onPendingOperationRefresh: vi.fn(),
      onPendingOperationConfirmExecute: vi.fn(), onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.reject')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.stale')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).toContain('chat.operation.stale')
    expect(renderedText(tree.root)).not.toContain('chat.operation.approve')
    expect(revise).toHaveBeenCalledTimes(1)
  })

  it('keeps a rejected refresh unavailable after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const refresh = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationRefresh: refresh,
      onPendingOperationConfirmExecute: vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' }),
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    const refreshButton = () => tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.operation.refresh' && typeof node.props.onPress === 'function')[0]
    expect(refreshButton()).toBeDefined()
    await TestRenderer.act(async () => { refreshButton()!.props.onPress!(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.staleUnavailable')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).toContain('chat.operation.staleUnavailable')
    expect(refreshButton()).toBeUndefined()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps an edited item marked after the bubble remounts', async () => {
    const message = makeHeldHabitMessage()
    useChatStore.setState({ messages: [message] })
    const original = message.pendingOperations![0]!.items![0]!
    const edited = { ...original, entityName: 'Drink water', fields: [{ ...original.fields[0]!, newValue: 'Drink water' }] }
    const revise = vi.fn().mockResolvedValue({ ok: true, result: {
      cancelled: false, preview: { items: [edited], changes: [], changeTargetCount: 1, previewFingerprint: 'habit-preview-2' },
    } })
    const callbacks = { onPendingOperationRevise: revise, onPendingOperationConfirmExecute: vi.fn(),
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(() => { press(tree, 'chat.operation.edit')() })
    await TestRenderer.act(() => { tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.operation.field.title')[0]!.props.onChangeText!('Drink water') })
    await TestRenderer.act(async () => { press(tree, 'common.save')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.edited')
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    expect(renderedText(tree.root)).toContain('chat.operation.edited')
    expect(renderedText(tree.root)).toContain('Drink water')
  })

  it('keeps a clarification preview in the message after remount', async () => {
    realClarification.current = true
    useChatStore.setState({ messages: [makeClarificationPreviewMessage()] })
    const pendingOperation = makeHeldHabitMessage().pendingOperations![0]!
    resolveClarification.mockResolvedValueOnce({ operation: { status: 'PendingConfirmation' }, pendingOperation })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationConfirmExecute: vi.fn(),
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<StoredBubble />) })
    await TestRenderer.act(async () => { press(tree, 'habits.clarification.quickAction.daily')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.approve')
    expect(useChatStore.getState().messages[0]?.clarificationPreviews?.['00000000-0000-0000-0000-000000000001']).toEqual(pendingOperation)
    await TestRenderer.act(() => { tree.update(<></>) })
    await TestRenderer.act(() => { tree.update(<StoredBubble />) })
    const output = renderedText(tree.root)
    expect(output).toContain('chat.operation.approve')
    expect(output).toContain('chat.operation.edit')
    expect(output).toContain('chat.operation.reject')
    expect(resolveClarification).toHaveBeenCalledTimes(1)
  })

  it('opens an approved create_goal preview as a goal', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'create_goal', sourceName: 'create_goal', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'goal-created',
    } } })
    const onOpenTarget = vi.fn()
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<MessageBubble message={makeHeldGoalMessage()} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={confirm} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} onActionChipClick={onOpenTarget} />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    await TestRenderer.act(() => { press(tree, 'chat.action.open')() })
    expect(onOpenTarget).toHaveBeenCalledWith('goal-created', 'CreateGoal')
  })

  it('keeps a failed approval in one preview block', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: { status: 'Failed' } } })
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeHeldHabitMessage()} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={confirm} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} />)
    })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve')(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('status.failed')
    expect(blocks(tree)).toHaveLength(1)
  })

  it('shows a denied action and policy outcome in one block', async () => {
    const operation = makeAgentOperationResult('Denied', 1)
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [makeActionResult({ type: 'CreateHabit', status: 'Failed' })], operations: [operation], policyDenials: [{
      operationId: operation.operationId, sourceName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', reason: 'policy',
    }] })
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<MessageBubble message={message} />) })
    expect(blocks(tree)).toHaveLength(1)
    expect(renderedText(tree.root)).toContain('chat.operation.outcome.UnsupportedByPolicy')
  })

  it('shows a legacy success action once and no outcome for reads', async () => {
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [makeActionResult({ type: 'CreateHabit', status: 'Success' })], operations: [makeAgentOperationResult('Succeeded', 1)] })
    let tree!: TestInstance
    await TestRenderer.act(() => { tree = TestRenderer.create(<MessageBubble message={message} />) })
    expect(blocks(tree)).toHaveLength(1)
    await TestRenderer.act(() => { tree.update(<MessageBubble message={makeHeldHabitMessage({ pendingOperations: [], operations: [makeAgentOperationResult('Succeeded', 1)] })} />) })
    expect(blocks(tree)).toHaveLength(0)
  })
})

vi.mock('@/components/chat/breakdown-suggestion', () => ({
  BreakdownSuggestion: (props: Record<string, unknown>) =>
    require('react').createElement('BreakdownSuggestion', props),
}))
vi.mock('@/components/chat/clarification-card', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/chat/clarification-card')>()
  return {
    ClarificationCard: (props: Record<string, unknown>) => require('react').createElement(
      realClarification.current ? actual.ClarificationCard : 'ClarificationCard', props,
    ),
  }
})
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
vi.mock('@/components/chat/day-summary-card', () => ({ DaySummaryCard: () => null }))
vi.mock('@/components/chat/streak-card', () => ({ StreakCard: () => null }))
vi.mock('@/components/chat/calendar-card', () => ({ CalendarCard: () => null }))
vi.mock('@/components/chat/record-list-card', () => ({ RecordListCard: () => null }))
vi.mock('@/components/chat/account-rows-card', () => ({ AccountRowsCard: () => null }))

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'ai',
    content: 'Hello',
    timestamp: new Date(),
    ...overrides,
  }
}

const periodInsight: NonNullable<ChatMessage['periodInsight']> = {
  period: 'week', dateFrom: '2026-09-01', dateTo: '2026-09-07',
  completionRate: 50, activeDays: 4, periodDays: 7,
  totalCompletions: 7, totalScheduled: 14, currentStreak: 2, bestStreak: 5,
  topHabits: [], needsAttention: [],
  narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
}

describe('MessageBubble trace footer (mobile)', () => {
  it('reveals the period insight only after the final response', async () => {
    const message = makeMessage({ role: 'ai', periodInsight })
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={message} isStreaming />)
    })
    expect(tree.root.findAll((node) => node.props.testID === 'block-frame-resting')).toHaveLength(0)
    await TestRenderer.act(() => { tree.update(<MessageBubble message={message} />) })
    expect(tree.root.findAll((node) => node.props.testID === 'block-frame-resting').length).toBeGreaterThan(0)
  })
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
    expect(tree.root.findAll((node) => node.type === Copy)).toHaveLength(1)
    vi.useFakeTimers()
    await TestRenderer.act(async () => {
      await copy?.props.onPress?.()
    })

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Your habits')
    expect(
      tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copied').length,
    ).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.type === Check)).toHaveLength(1)
    await TestRenderer.act(() => { vi.advanceTimersByTime(1600) })
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy').length).toBeGreaterThan(0)
  })

  it('omits the copy control when an AI turn has no prose', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeMessage({ content: '[[orbit:habits:today]]' })} />)
    })
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')).toHaveLength(0)
  })

  it('does not copy a hidden partial directive while streaming', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeMessage({ content: '[[orbit:habits:' })} isStreaming />)
    })
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')).toHaveLength(0)

    await TestRenderer.act(() => {
      tree.update(<MessageBubble message={makeMessage({ content: 'Hello [[orbit:habits:' })} isStreaming />)
    })
    const copy = tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')[0]
    await TestRenderer.act(async () => { await copy?.props.onPress?.() })
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Hello')
  })

  it('omits the copy control for a separator-only reply', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeMessage({ content: '---' })} />)
    })
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')).toHaveLength(0)
  })

  it('does not offer copying a sent message', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <MessageBubble message={makeMessage({ role: 'user', content: '**Walk**\n- Water' })} />,
      )
    })

    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'chat.copy')).toHaveLength(0)
  })
})

describe('MessageBubble thread treatment (mobile)', () => {
  it('uses a neutral 16-radius well with an 80% cap for sent messages', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeMessage({ role: 'user' })} />)
    })
    const tokens = createTokensV2('purple', 'dark')
    const bubble = tree.root.findAll((node) =>
      Array.isArray(node.props.style) && node.props.style[0]?.flexShrink === 1,
    )[0]
    expect(bubble).toBeDefined()
    const bubbleStyle = Object.assign({}, ...((bubble?.props.style ?? []) as object[]))
    expect(bubbleStyle).toMatchObject({
      backgroundColor: tokens.bgWell,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    })
    expect(tree.root.findAll((node) =>
      typeof node.type === 'string' && (node.props.style as { maxWidth?: string } | undefined)?.maxWidth === '80%',
    )).toHaveLength(1)
  })

  it('renders AI prose without an avatar or filled surface', async () => {
    let tree!: TestInstance
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<MessageBubble message={makeMessage({ role: 'ai' })} />)
    })
    const tokens = createTokensV2('purple', 'dark')
    expect(tree.root.findAll((node) => {
      const style = node.props.style as { width?: number; height?: number } | undefined
      return typeof node.type === 'string' && style != null && style.width === 30 && style.height === 30
    })).toHaveLength(0)
    expect(tree.root.findAll((node) =>
      Array.isArray(node.props.style) && node.props.style.some((style: { backgroundColor?: string } | null) => style != null && style.backgroundColor === tokens.bgElev),
    )).toHaveLength(0)
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
    const openAction = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && renderedText(node.props.children).includes('chat.action.open'))[0]
    expect(openAction).toBeDefined()
    await TestRenderer.act(() => { openAction?.props.onPress?.() })
    expect(onActionChipClick).toHaveBeenCalledWith('habit-1', 'LogHabit')

    const clarification = tree.root.findAll((node) => node.type === 'ClarificationCard')[0]
    expect(clarification?.props.entityName).toBe('Walk')
    const pending = tree.root.findAll((node) => node.type === PendingOperationCard)[0]
    expect(pending?.props).toMatchObject({
      onConfirmExecute,
      onPrepareStepUp,
      onVerifyStepUp,
    })
    expect(renderedText(tree.root)).not.toContain('chat.operation.outcome.Succeeded')

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

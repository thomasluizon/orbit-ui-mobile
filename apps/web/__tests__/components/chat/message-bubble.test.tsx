import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => 'en-US',
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))

const resolveClarification = vi.fn()
vi.mock('@/hooks/use-resolve-clarification', () => ({
  useResolveClarification: () => ({ mutateAsync: resolveClarification, isPending: false }),
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

vi.mock('./breakdown-suggestion', () => ({
  BreakdownSuggestion: () => <div data-testid="breakdown-suggestion" />,
}))

vi.mock('@/components/chat/breakdown-suggestion', () => ({
  BreakdownSuggestion: () => <div data-testid="breakdown-suggestion" />,
}))
vi.mock('@/components/chat/habit-list-card', () => ({
  HabitListCard: ({ habitList }: { habitList: { items: { title: string }[] } }) => (
    <div data-slot="habit-list-card">{habitList.items.map((item) => <span key={item.title}>{item.title}</span>)}</div>
  ),
}))
vi.mock('@/components/chat/goal-list-card', () => ({
  GoalListCard: ({ goalList }: { goalList: { items: { title: string }[] } }) => (
    <div data-slot="goal-list-card">{goalList.items.map((item) => <span key={item.title}>{item.title}</span>)}</div>
  ),
}))

import { MessageBubble } from '@/components/chat/message-bubble'
import { useChatStore } from '@/stores/chat-store'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { makeActionResult, makeAgentOperationResult, makeClarificationPreviewMessage, makeHeldGoalMessage, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '1',
    role: 'user',
    content: 'Hello',
    timestamp: new Date(),
    imageUrl: null,
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

describe('MessageBubble', () => {
  beforeEach(() => {
    push.mockClear()
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('reveals the period insight only after the final response', () => {
    const message = makeMessage({ role: 'ai', periodInsight })
    const { rerender } = render(<MessageBubble message={message} isStreaming />)
    expect(screen.queryByText('chat.insight.title')).not.toBeInTheDocument()
    rerender(<MessageBubble message={message} />)
    expect(screen.getByText('chat.insight.title')).toBeInTheDocument()
  })

  it('renders user message with user label announced exactly once', () => {
    render(<MessageBubble message={makeMessage({ role: 'user', content: 'Hello' })} />)
    expect(screen.getByText('chat.senderYou')).toBeInTheDocument()
    expect(screen.queryByLabelText('chat.senderYou')).not.toBeInTheDocument()
  })

  it('renders AI message with orbit label announced exactly once', () => {
    render(<MessageBubble message={makeMessage({ role: 'ai', content: 'Hi there' })} />)
    expect(screen.getByText('chat.senderOrbit')).toBeInTheDocument()
    expect(screen.queryByLabelText('chat.senderOrbit')).not.toBeInTheDocument()
  })

  it('copies directive-free AI source text and confirms the action', async () => {
    vi.useFakeTimers()
    render(
      <MessageBubble
        message={makeMessage({ role: 'ai', content: 'Your habits\n[[orbit:habits:today]]' })}
      />,
    )

    expect(screen.getByRole('button', { name: 'chat.copy' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'chat.copy' }))

    await act(async () => { await Promise.resolve() })
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('Your habits')
    expect(screen.getByRole('button', { name: 'chat.copied' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.copied' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    await act(async () => { vi.advanceTimersByTime(1600) })
    expect(screen.getByRole('button', { name: 'chat.copy' })).toBeInTheDocument()
  })

  it('omits the copy control when an AI turn has no prose', () => {
    render(<MessageBubble message={makeMessage({ role: 'ai', content: '[[orbit:habits:today]]' })} />)
    expect(screen.queryByRole('button', { name: 'chat.copy' })).not.toBeInTheDocument()
  })

  it('does not copy a hidden partial directive while streaming', async () => {
    const { rerender } = render(<MessageBubble message={makeMessage({ role: 'ai', content: '[[orbit:habits:' })} isStreaming />)
    expect(screen.queryByRole('button', { name: 'chat.copy' })).not.toBeInTheDocument()

    rerender(<MessageBubble message={makeMessage({ role: 'ai', content: 'Hello [[orbit:habits:' })} isStreaming />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.copy' }))
    await act(async () => { await Promise.resolve() })
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('Hello')
  })

  it('omits the copy control for a separator-only reply', () => {
    render(<MessageBubble message={makeMessage({ role: 'ai', content: '---' })} />)
    expect(screen.queryByRole('button', { name: 'chat.copy' })).not.toBeInTheDocument()
  })

  it('does not offer copying a sent message', () => {
    render(<MessageBubble message={makeMessage({ role: 'user', content: '**Walk**\n- Water' })} />)
    expect(screen.queryByRole('button', { name: 'chat.copy' })).not.toBeInTheDocument()
  })

  it('renders message content', () => {
    render(<MessageBubble message={makeMessage({ content: 'Test message content' })} />)
    expect(document.body.textContent).toContain('Test message content')
  })

  it('does not render an avatar for user messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'user' })} />,
    )
    expect(container.querySelector('[data-slot="ai-avatar"]')).not.toBeInTheDocument()
  })

  it('renders AI prose without an avatar or bubble fill', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'ai' })} />,
    )
    const avatar = container.querySelector('[data-slot="ai-avatar"]')
    expect(avatar).not.toBeInTheDocument()
    const prose = container.querySelector('[data-bubble-role="ai"]') as HTMLElement
    expect(prose.className).not.toContain('bg-[')
    expect(prose).toHaveStyle({ padding: '0' })
  })

  it('aligns user messages to the right', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'user' })} />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('justify-end')
  })

  it('aligns AI messages to the left', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'ai' })} />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('justify-start')
  })

  it('renders image when imageUrl is provided', () => {
    render(
      <MessageBubble
        message={makeMessage({ imageUrl: 'https://example.com/img.png' })}
      />,
    )
    const img = document.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/img.png')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('does not render image when imageUrl is null', () => {
    render(
      <MessageBubble message={makeMessage({ imageUrl: null })} />,
    )
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('marks user messages with bubble role', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'user' })} />,
    )
    const bubble = container.querySelector('[data-bubble-role="user"]')
    expect(bubble).toBeInTheDocument()
    expect(bubble).toHaveClass('bg-[var(--bg-well)]', 'text-[var(--fg-1)]')
    expect(bubble).toHaveStyle({ borderRadius: '16px' })
    expect((bubble?.parentElement?.parentElement as HTMLElement).className).toContain('max-w-[80%]')
    expect((container.firstChild as HTMLElement).style.marginBottom).toBe('')
  })

  it('caps a user bubble while preserving a long unbroken message', () => {
    const longMessage = 'x'.repeat(400)
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'user', content: longMessage })} />,
    )
    const bubble = container.querySelector('[data-bubble-role="user"]')
    expect((bubble?.parentElement?.parentElement as HTMLElement).className).toContain('max-w-[80%]')
    expect(screen.getByTestId('markdown')).toHaveTextContent(longMessage)
  })

  it('marks AI messages with bubble role', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'ai' })} />,
    )
    const bubble = container.querySelector('[data-bubble-role="ai"]')
    expect(bubble).toBeInTheDocument()
  })

  it('renders pending operation cards for AI messages', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'ai',
          pendingOperations: [
            {
              id: 'pending-1',
              capabilityId: 'habit.delete',
              displayName: 'Delete habit',
              summary: 'Delete Meditation habit',
              riskClass: 'Destructive',
              confirmationRequirement: 'FreshConfirmation',
              expiresAtUtc: '2025-01-15T10:00:00Z',
            },
          ],
        })}
        onPendingOperationConfirmExecute={async () => ({ ok: true })}
        onPendingOperationPrepareStepUp={async () => ({ ok: true, challengeId: 'challenge-1', confirmationToken: 'token' })}
        onPendingOperationVerifyStepUp={async () => ({ ok: true })}
      />,
    )

    expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeInTheDocument()
  })

  it('renders policy denials', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'ai',
          policyDenials: [
            {
              operationId: 'habit.delete',
              sourceName: 'Delete habit',
              riskClass: 'Destructive',
              confirmationRequirement: 'FreshConfirmation',
              reason: 'Fresh confirmation required',
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('chat.operation.outcome.UnsupportedByPolicy')).toBeInTheDocument()
    expect(screen.queryByText('Fresh confirmation required')).not.toBeInTheDocument()
  })

  it('renders a related-surfaces footer that deep-links known surfaces', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'ai',
          content: 'Streaks work like this.',
          relatedSurfaces: ['gamification', 'mystery'],
        })}
      />,
    )

    expect(screen.getByText('chat.related.title')).toBeInTheDocument()
    const link = screen.getByRole('button', { name: 'chat.related.surface.gamification' })
    fireEvent.click(link)
    expect(push).toHaveBeenCalledWith('/progress')
    expect(screen.queryByText('mystery')).not.toBeInTheDocument()
  })

  it('does not render a related-surfaces footer for user messages', () => {
    render(
      <MessageBubble
        message={makeMessage({ role: 'user', relatedSurfaces: ['gamification'] })}
      />,
    )
    expect(screen.queryByText('chat.related.title')).not.toBeInTheDocument()
  })

  it('never renders a trace footer, even when the AI message has a correlationId', () => {
    render(
      <MessageBubble
        message={makeMessage({ role: 'ai', correlationId: 'req-abc-123' })}
      />,
    )
    expect(screen.queryByLabelText('chat.trace.copy')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('req-abc-123')
  })

  it('renders the habit-list card for AI messages with a habitList payload', () => {
    const { container } = render(
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

    expect(container.querySelector('[data-slot="habit-list-card"]')).toBeInTheDocument()
    expect(screen.getByText('Meditate')).toBeInTheDocument()
    expect(screen.getByText('Floss')).toBeInTheDocument()
  })

  it('strips the habit-list directive from rendered message content', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'ai',
          content: 'Here are your habits for today:\n[[orbit:habits:today]]',
          habitList: { scope: 'today', items: [] },
        })}
      />,
    )

    const markdown = screen.getByTestId('markdown')
    expect(markdown.textContent).toBe('Here are your habits for today:')
    expect(markdown.textContent).not.toContain('orbit:habits')
  })

  it('hides a partial directive only while the AI message is streaming', () => {
    const message = makeMessage({ role: 'ai', content: 'Keep this literal [[or' })
    const { rerender } = render(<MessageBubble message={message} isStreaming />)

    expect(screen.getByTestId('markdown').textContent).toBe('Keep this literal')

    rerender(<MessageBubble message={message} />)
    expect(screen.getByTestId('markdown').textContent).toBe('Keep this literal [[or')
  })

  it('preserves user-authored directive text byte-for-byte', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'user',
          content: '[[orbit:goals]]',
        })}
      />,
    )

    expect(screen.getByTestId('markdown').textContent).toBe('[[orbit:goals]]')
  })

  it('does not render the habit-list card for user messages', () => {
    const { container } = render(
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
    expect(container.querySelector('[data-slot="habit-list-card"]')).not.toBeInTheDocument()
  })

  it('renders the goal-list card for AI messages with a goalList payload', () => {
    const { container } = render(
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

    expect(container.querySelector('[data-slot="goal-list-card"]')).toBeInTheDocument()
    expect(screen.getByText('Read books')).toBeInTheDocument()
    expect(screen.getByText('Run distance')).toBeInTheDocument()
  })

  it('does not render the goal-list card for user messages', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          role: 'user',
          goalList: {
            items: [{ id: 'g1', title: 'Read books', current: 12, target: 30, unit: 'books', deadline: null }],
          },
        })}
      />,
    )
    expect(container.querySelector('[data-slot="goal-list-card"]')).not.toBeInTheDocument()
  })

  it('does not render the raw operation summary card for completed operations', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'ai',
          content: 'Logged your meditation habit.',
          operations: [
            {
              operationId: 'habit.log',
              sourceName: 'Log habit',
              riskClass: 'Low',
              confirmationRequirement: 'None',
              status: 'Succeeded',
              summary: 'Logged Meditation',
              payload: null,
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Logged your meditation habit.')).toBeInTheDocument()
    expect(screen.queryByText('chat.operation.outcome.Succeeded')).not.toBeInTheDocument()
    expect(screen.queryByText('Logged Meditation')).not.toBeInTheDocument()
    expect(screen.queryByText(/SUCCEEDED/i)).not.toBeInTheDocument()
  })

  it('shows one real preview block and finishes it in place', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created',
    } } })
    const onOpenTarget = vi.fn()
    const { container } = render(<MessageBubble message={makeHeldHabitMessage()} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={confirm} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} onActionChipClick={onOpenTarget} />)
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'chat.operation.edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.reject' })).toBeInTheDocument()
    expect(container.textContent).not.toContain('chat.operation.risk')
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('status.done')
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(1)
    expect(screen.queryByText('chat.operation.outcome.Succeeded')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.action.openEntity:{"name":"Beber água"}' }))
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
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('status.done')
    first.unmount()
    render(<StoredBubble />)
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    expect(screen.getByText('status.done')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.action.openEntity:{"name":"Beber água"}' }))
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
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await screen.findByText('chat.operation.rejected:{"count":1}')
    first.unmount()
    render(<StoredBubble />)
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('chat.operation.rejected:{"count":1}')
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
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('status.failed')
    first.unmount()
    render(<StoredBubble />)
    expect(screen.getByText('status.failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('status.done')
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('keeps an expired preview stale after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const confirm = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationRefresh: vi.fn(),
      onPendingOperationConfirmExecute: confirm, onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('chat.operation.stale')
    first.unmount()
    render(<StoredBubble />)
    expect(screen.getByText('chat.operation.stale')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('keeps a stale revision blocked after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const revise = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' })
    const callbacks = { onPendingOperationRevise: revise, onPendingOperationRefresh: vi.fn(),
      onPendingOperationConfirmExecute: vi.fn(), onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await screen.findByText('chat.operation.stale')
    first.unmount()
    render(<StoredBubble />)
    expect(screen.getByText('chat.operation.stale')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    expect(revise).toHaveBeenCalledTimes(1)
  })

  it('keeps a rejected refresh unavailable after the bubble remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage()] })
    const refresh = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationRefresh: refresh,
      onPendingOperationConfirmExecute: vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'expired' }),
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByRole('button', { name: 'chat.operation.refresh' })
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.refresh' }))
    await screen.findByText('chat.operation.staleUnavailable')
    first.unmount()
    render(<StoredBubble />)
    expect(screen.getByText('chat.operation.staleUnavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.refresh' })).not.toBeInTheDocument()
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
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.title' }), { target: { value: 'Drink water' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await screen.findByText(/chat.operation.edited/)
    first.unmount()
    render(<StoredBubble />)
    expect(screen.getByText(/chat.operation.edited/)).toBeInTheDocument()
    expect(screen.getByText('Drink water')).toBeInTheDocument()
  })

  it('keeps a clarification preview in the message after remount', async () => {
    useChatStore.setState({ messages: [makeClarificationPreviewMessage()] })
    resolveClarification.mockResolvedValueOnce({ ok: true, data: {
      operation: { status: 'PendingConfirmation' },
      pendingOperation: makeHeldHabitMessage().pendingOperations![0]!,
    } })
    const callbacks = { onPendingOperationRevise: vi.fn(), onPendingOperationConfirmExecute: vi.fn(),
      onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
    const StoredBubble = () => <MessageBubble message={useChatStore((state) => state.messages[0]!)} {...callbacks} />
    const first = render(<StoredBubble />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.clarification.quickAction.daily' }))
    await screen.findByRole('button', { name: 'chat.operation.approve' })
    first.unmount()
    render(<StoredBubble />)
    expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeInTheDocument()
    expect(resolveClarification).toHaveBeenCalledTimes(1)
  })

  it('opens an approved create_goal preview as a goal', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'create_goal', sourceName: 'create_goal', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'goal-created',
    } } })
    const onOpenTarget = vi.fn()
    render(<MessageBubble message={makeHeldGoalMessage()} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={confirm} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} onActionChipClick={onOpenTarget} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('status.done')
    fireEvent.click(screen.getByRole('button', { name: 'chat.action.openEntity:{"name":"Run 10 km"}' }))
    expect(onOpenTarget).toHaveBeenCalledWith('goal-created', 'CreateGoal')
  })

  it('keeps a failed approval in its preview block', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, response: { operation: { status: 'Failed' } } })
    const { container } = render(<MessageBubble message={makeHeldHabitMessage()} onPendingOperationRevise={vi.fn()} onPendingOperationConfirmExecute={confirm} onPendingOperationPrepareStepUp={vi.fn()} onPendingOperationVerifyStepUp={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByText('status.failed')
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(1)
  })

  it('shows a denied action and policy outcome in one block', () => {
    const operation = makeAgentOperationResult('Denied', 1)
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [makeActionResult({ type: 'CreateHabit', status: 'Failed' })], operations: [operation], policyDenials: [{
      operationId: operation.operationId, sourceName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', reason: 'policy',
    }] })
    const { container } = render(<MessageBubble message={message} />)
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(1)
    expect(screen.getByText('chat.operation.outcome.UnsupportedByPolicy')).toBeInTheDocument()
  })

  it('shows a legacy success action once and no outcome for reads', () => {
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [makeActionResult({ type: 'CreateHabit', status: 'Success' })], operations: [makeAgentOperationResult('Succeeded', 1)] })
    const { container, rerender } = render(<MessageBubble message={message} />)
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(1)
    rerender(<MessageBubble message={makeHeldHabitMessage({ pendingOperations: [], operations: [makeAgentOperationResult('Succeeded', 1)] })} />)
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(0)
  })
})

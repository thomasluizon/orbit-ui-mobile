import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

vi.mock('./action-chips', () => ({
  ActionChips: () => <div data-testid="action-chips" />,
}))
vi.mock('./breakdown-suggestion', () => ({
  BreakdownSuggestion: () => <div data-testid="breakdown-suggestion" />,
}))

vi.mock('@/components/chat/action-chips', () => ({
  ActionChips: () => <div data-testid="action-chips" />,
}))
vi.mock('@/components/chat/breakdown-suggestion', () => ({
  BreakdownSuggestion: () => <div data-testid="breakdown-suggestion" />,
}))
vi.mock('@/components/chat/pending-operation-card', () => ({
  PendingOperationCard: () => <div data-testid="pending-operation-card" />,
}))

import { MessageBubble } from '@/components/chat/message-bubble'
import type { ChatMessage } from '@orbit/shared/types/chat'

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

describe('MessageBubble', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it('renders user message with user label', () => {
    render(<MessageBubble message={makeMessage({ role: 'user', content: 'Hello' })} />)
    expect(screen.getByText('chat.senderYou')).toBeInTheDocument()
    expect(screen.getByLabelText('chat.senderYou')).toBeInTheDocument()
  })

  it('renders AI message with orbit label', () => {
    render(<MessageBubble message={makeMessage({ role: 'ai', content: 'Hi there' })} />)
    expect(screen.getByText('chat.senderOrbit')).toBeInTheDocument()
    expect(screen.getByLabelText('chat.senderOrbit')).toBeInTheDocument()
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

  it('renders AI avatar for AI messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'ai' })} />,
    )
    const avatar = container.querySelector('[data-slot="ai-avatar"]')
    expect(avatar).toBeInTheDocument()
    expect(avatar?.className).toContain('rounded-full')
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

    expect(screen.getByTestId('pending-operation-card')).toBeInTheDocument()
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

    expect(screen.getByText('Fresh confirmation required')).toBeInTheDocument()
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
    expect(push).toHaveBeenCalledWith('/achievements')
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
    expect(screen.getByText('chat.habitList.today')).toBeInTheDocument()
    expect(screen.getByText('chat.habitList.overdue')).toBeInTheDocument()
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
    expect(screen.queryByText('Logged Meditation')).not.toBeInTheDocument()
    expect(screen.queryByText(/SUCCEEDED/i)).not.toBeInTheDocument()
  })
})

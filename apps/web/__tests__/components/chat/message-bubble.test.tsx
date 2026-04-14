import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('./action-chips', () => ({
  ActionChips: () => <div data-testid="action-chips" />,
}))
vi.mock('./breakdown-suggestion', () => ({
  BreakdownSuggestion: () => <div data-testid="breakdown-suggestion" />,
}))
vi.mock('./format-chat-message', () => ({
  formatChatMessage: (text: string) => text,
}))

vi.mock('@/components/chat/action-chips', () => ({
  ActionChips: () => <div data-testid="action-chips" />,
}))
vi.mock('@/components/chat/breakdown-suggestion', () => ({
  BreakdownSuggestion: () => <div data-testid="breakdown-suggestion" />,
}))
vi.mock('@/components/chat/format-chat-message', () => ({
  formatChatMessage: (text: string) => text,
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

  it('renders user avatar for user messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'user' })} />,
    )
    // User icon is the last avatar container
    const avatars = container.querySelectorAll('.rounded-full')
    expect(avatars.length).toBeGreaterThan(0)
  })

  it('renders AI avatar for AI messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'ai' })} />,
    )
    const avatars = container.querySelectorAll('.rounded-full')
    expect(avatars.length).toBeGreaterThan(0)
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

  it('applies gradient background to user messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'user' })} />,
    )
    const bubble = container.querySelector('.bg-linear-to-br')
    expect(bubble).toBeInTheDocument()
  })

  it('applies elevated background to AI messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ role: 'ai' })} />,
    )
    const bubble = container.querySelector('.bg-surface-elevated')
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

  it('renders policy denials and operation summaries', () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: 'ai',
          operations: [
            {
              operationId: 'habit.read',
              sourceName: 'Read habits',
              riskClass: 'Low',
              confirmationRequirement: 'None',
              status: 'Succeeded',
              summary: 'Loaded habits',
              payload: null,
            },
          ],
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

    expect(screen.getByText('Loaded habits')).toBeInTheDocument()
    expect(screen.getByText('Fresh confirmation required')).toBeInTheDocument()
  })
})

import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/shell/composer', () => ({
  Composer: () => <div data-testid="conversation-composer" />,
}))

vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: () => <div data-testid="empty-suggestions" />,
}))

vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: ({ message }: { message: { id: string } }) => <div>{message.id}</div>,
}))

import { AstraConversation } from '@/components/chat/conversation'
import { useUIStore } from '@/stores/ui-store'

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function buildChat(): ChatController {
  return {
    chatContainerRef: createRef<HTMLDivElement>(),
    messages: [],
    activeSteps: [],
    canShowFollowUps: false,
    isTyping: false,
    streamingMessageId: null,
    showSuggestions: true,
    sendMessage: vi.fn(),
    handleBreakdownConfirmed: vi.fn(),
    confirmAndExecutePendingOperation: vi.fn(),
    prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(),
    isOnline: true,
    sendError: null,
    canRetryLastSend: false,
    retryLastSend: vi.fn(),
    composerProps: { suggestions: [] },
  } as unknown as ChatController
}

afterEach(() => {
  cleanup()
  useUIStore.getState().setAstraConversationOpen(false)
})

it('closes the conversation from one trailing control, with no back control', () => {
  useUIStore.getState().setAstraConversationOpen(true)
  render(<AstraConversation chat={buildChat()} />)

  const header = screen.getByRole('banner')
  expect(header).not.toHaveAttribute('data-back')
  const close = screen.getByRole('button', { name: 'common.closeConversation' })
  expect(header.lastElementChild).toContainElement(close)

  fireEvent.click(close)

  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('keeps the title on the brand, untranslatable', () => {
  render(<AstraConversation chat={buildChat()} />)

  expect(screen.getByRole('heading', { name: 'chat.title' })).toHaveAttribute('translate', 'no')
})

it('still closes the conversation on Escape', () => {
  useUIStore.getState().setAstraConversationOpen(true)
  render(<AstraConversation chat={buildChat()} />)

  fireEvent.keyDown(document, { key: 'Escape' })

  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

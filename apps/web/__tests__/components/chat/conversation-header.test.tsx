import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { useChatStore } from '@/stores/chat-store'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key === 'chat.title' ? 'Astra' : key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/chat/proactive-action', () => ({ ProactiveAction: () => null }))

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
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
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

it('shows the decorative Astra mark with one named heading and no visible title', () => {
  render(<AstraConversation chat={buildChat()} />)

  const header = screen.getByRole('banner')
  const heading = screen.getByRole('heading', { name: 'Astra' })
  expect(heading).toHaveAttribute('translate', 'no')
  expect(header.querySelector('[data-asset="astra-mark-16"]')).not.toBeNull()
  expect(heading.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(heading).toHaveTextContent('')
  expect(header).toHaveTextContent('')
  expect(screen.getAllByRole('heading', { name: 'Astra' })).toHaveLength(1)
})

it('still closes the conversation on Escape', () => {
  useUIStore.getState().setAstraConversationOpen(true)
  render(<AstraConversation chat={buildChat()} />)

  fireEvent.keyDown(document, { key: 'Escape' })

  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('opens and reopens the proactive message above an existing long streaming thread', () => {
  useChatStore.setState({ messages: [], proactiveOutcomes: {} })
  const item = createMockProactiveItem()
  for (let index = 0; index < 30; index++) useChatStore.getState().addMessage({ id: `old-${index}`, role: 'ai', content: 'Previous reply', timestamp: new Date() })
  useChatStore.getState().openProactiveItem(item)
  const chat = { ...buildChat(), showSuggestions: false, messages: useChatStore.getState().messages, streamingMessageId: 'old-29' }
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollTo')
  const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000)
  try {
    render(<AstraConversation chat={chat} />)
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })
    expect(chat.threadScroll.isFollowing()).toBe(false)
    void act(() => { useChatStore.getState().openProactiveItem(item) })
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })
    expect(useChatStore.getState().messages.some((message) => message.id === 'old-29')).toBe(true)
  } finally { height.mockRestore(); scroll.mockRestore() }
})

it('opens the summary at the end of an existing thread with its AI disclosure', () => {
  useChatStore.setState({ messages: [], proactiveEntryId: null })
  useChatStore.getState().addMessage({ id: 'earlier', role: 'user', content: 'Earlier conversation', timestamp: new Date() })
  useChatStore.getState().openDailySummary('2026-08-29', 'First sentence. Full guidance.')
  const chat = { ...buildChat(), messages: useChatStore.getState().messages, showSuggestions: false }
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollTo')
  const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000)
  try {
    render(<AstraConversation chat={chat} />)
    expect(scroll).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    expect(chat.threadScroll.isFollowing()).toBe(true)
    expect(screen.queryByTestId('empty-suggestions')).not.toBeInTheDocument()
    expect(screen.getByTestId('astra-ai-disclosure')).toHaveTextContent('aiDisclosure.notMedicalAdvice')
  } finally { height.mockRestore(); scroll.mockRestore() }
})

import { createRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createChatStoreState } from '@orbit/shared/stores'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { ApiClientError } from '@orbit/shared/utils'
import { makeConversationPage, storedConversationId } from '@orbit/shared/test-support/conversation-fixtures'
import { AstraConversation } from '@/components/chat/conversation'
import { useChatStore } from '@/stores/chat-store'

const requests = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/server-fetch', () => ({ serverAuthFetch: requests.read, serverAuthMutate: requests.remove }))
vi.mock('@/lib/client-action', () => ({ runServerActionResult: async (result: Promise<unknown>) => result, accountIntentWithOrigin: (id: string) => id, bindServerAction: (action: unknown) => action }))
vi.mock('@/stores/auth-store', async importOriginal => ({ ...await importOriginal<typeof import('@/stores/auth-store')>(), getHeldAccountId: () => 'account-1' }))
vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return { getQueryClient: () => client }
})
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-chat-navigation', () => ({ useChatNavigation: () => vi.fn() }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/chat/chat-empty-state', () => ({ ChatEmptyState: () => <div>Empty thread</div> }))
vi.mock('@/components/chat/message-bubble', () => ({ MessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p> }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: (props: { open: boolean; title: string; onConfirm: () => void; onCancel: () => void }) => props.open ? <div role="dialog" aria-label={props.title}><button onClick={props.onConfirm}>Confirm deletion</button><button onClick={props.onCancel}>Cancel deletion</button></div> : null }))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
function Conversation() {
  const messages = useChatStore(state => state.messages)
  const [threadScroll] = useState(createChatThreadScroll)
  const [chatContainerRef] = useState(createRef<HTMLDivElement>)
  const chat = { messages, threadScroll, chatContainerRef, scrollToBottom: vi.fn(), activeSteps: [], isTyping: false,
    showSuggestions: messages.length === 0, isSending: false, streamingMessageId: null, canShowFollowUps: false,
    composerProps: { suggestions: [] }, trackCardOperation: vi.fn(),
  } as unknown as ChatController
  return <AstraConversation chat={chat} />
}

beforeEach(() => {
  vi.clearAllMocks()
  useChatStore.setState(createChatStoreState(useChatStore.setState as Parameters<typeof createChatStoreState>[0]))
  requests.read.mockResolvedValue(makeConversationPage())
  requests.remove.mockResolvedValue(null)
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(cleanup)

it('reopens the latest thread and loads an earlier page at the top while preserving the scroll anchor', async () => {
  render(<Conversation />)
  await screen.findByText('Review ready')
  expect(requests.read.mock.calls[0]![0]).toBe('/api/chat/conversations/latest?pageSize=40')
  expect(useChatStore.getState().conversationId).toBe(storedConversationId)
  const earlier = makeConversationPage({ beforeOrder: null })
  earlier.turns = earlier.turns.map(turn => ({ ...turn, turnId: '00000000-0000-4000-8000-000000000099', order: Number(turn.order) - 2, content: 'Earlier message', responseJson: null }))
  requests.read.mockResolvedValueOnce(earlier)
  const feed = screen.getByRole('feed')
  const baseHeight = 400
  Object.defineProperty(feed, 'scrollHeight', { configurable: true, get: () => screen.getAllByRole('article').length === 2 ? baseHeight : 800 })
  fireEvent.scroll(feed, { target: { scrollTop: 0 } })
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4))
  expect(requests.read.mock.calls[1]![0]).toContain(`conversationId=${storedConversationId}&beforeOrder=3`)
  expect(feed.scrollTop).toBe(400)
  expect(useChatStore.getState().conversationBeforeOrder).toBeNull()
})

it('keeps the empty thread without an error when recording is off or no conversation exists', async () => {
  requests.read.mockRejectedValueOnce(new ApiClientError(404, 'Unavailable', { code: 'CONVERSATION_NOT_FOUND' }))
  render(<Conversation />)
  await waitFor(() => expect(useChatStore.getState().conversationLoaded).toBe(true))
  expect(screen.getByText('Empty thread')).toBeInTheDocument()
  expect(screen.queryByText('common.error')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'chat.conversation.delete' })).not.toBeInTheDocument()
})

it.each([204, 404])('requires confirmation before clearing a thread on delete %s', async status => {
  render(<Conversation />)
  await screen.findByText('Review ready')
  if (status === 404) requests.remove.mockRejectedValueOnce(new ApiClientError(404, 'Unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'chat.conversation.delete' }))
  expect(requests.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Cancel deletion'))
  expect(screen.getByText('Review ready')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'chat.conversation.delete' }))
  fireEvent.click(screen.getByText('Confirm deletion'))
  await screen.findByText('Empty thread')
  expect(requests.remove).toHaveBeenCalledWith(`/api/chat/conversations/${storedConversationId}`, { method: 'DELETE' }, 'account-1')
  expect(useChatStore.getState()).toMatchObject({ conversationId: null, serverConversationId: null })
})

it('keeps the thread after a failed delete and offers another confirmed attempt', async () => {
  render(<Conversation />)
  await screen.findByText('Review ready')
  requests.remove.mockRejectedValueOnce(new ApiClientError(503, 'Unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'chat.conversation.delete' }))
  fireEvent.click(screen.getByText('Confirm deletion'))
  await screen.findByText('common.error')
  expect(screen.getByText('Review ready')).toBeInTheDocument()
  expect(useChatStore.getState().serverConversationId).toBe(storedConversationId)
  fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
  expect(requests.remove).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Confirm deletion'))
  await screen.findByText('Empty thread')
})

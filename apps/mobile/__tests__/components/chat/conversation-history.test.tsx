import React, { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StyleSheet, type ViewStyle } from 'react-native'
import { createChatStoreState } from '@orbit/shared/stores'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { ApiClientError } from '@orbit/shared/utils'
import { makeConversationPage, storedConversationId } from '@orbit/shared/test-support/conversation-fixtures'
import { AstraConversation } from '@/components/chat/conversation'
import { useChatStore } from '@/stores/chat-store'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer')
const requests = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn() }))
vi.mock('react-native', async importOriginal => {
  const actual = await importOriginal<typeof import('react-native')>()
  return { ...actual, FlatList: React.forwardRef<unknown, { data: unknown[]; renderItem: (entry: { item: unknown; index: number }) => React.ReactNode; ListFooterComponent?: React.ReactNode }>((props, _ref) => React.createElement('FlatList', props,
    props.data.map((item, index) => React.createElement(React.Fragment, { key: index }, props.renderItem({ item, index }))), props.ListFooterComponent)) }
})
vi.mock('@/lib/api-client', () => ({ apiClient: (path: string, options?: { method?: string }) => options?.method === 'DELETE' ? requests.remove(path, options) : requests.read(path) }))
vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) }
})
vi.mock('@/hooks/use-chat-navigation', () => ({ useChatNavigation: () => vi.fn() }))
vi.mock('@/hooks/use-overlay-back', () => ({ useOverlayBack: vi.fn() }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/chat/chat-empty-state', () => ({ ChatEmptyState: () => React.createElement('Text', {}, 'Empty thread') }))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: ({ message }: { message: { content: string } }) => React.createElement('Text', {}, message.content) }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: (props: { open: boolean; onConfirm: () => void; onCancel: () => void }) => props.open ? React.createElement('Confirmation', props) : null }))
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
let tree: ReturnType<typeof TestRenderer.create>
function Conversation() {
  const messages = useChatStore(state => state.messages)
  const [threadScroll] = useState(createChatThreadScroll)
  const chat = { messages, threadScroll, flatListRef: { current: null }, scrollToBottom: vi.fn(), activeSteps: [], isTyping: false,
    showSuggestions: messages.length === 0, isSending: false, streamingMessageId: null, canShowFollowUps: false,
    composerProps: { suggestions: [] }, trackCardOperation: vi.fn(),
  } as unknown as ChatController
  return <AstraConversation chat={chat} />
}
async function open() { await TestRenderer.act(() => { tree = TestRenderer.create(<Conversation />) }) }
function button(label: string) { return tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]! }
function confirmation() { return tree!.root.findByType('Confirmation' as React.ElementType) }
function text(content: string) { return tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === content) }

beforeEach(() => {
  vi.clearAllMocks()
  __resetTestHostConfig()
  useChatStore.setState(createChatStoreState(useChatStore.setState as Parameters<typeof createChatStoreState>[0]))
  requests.read.mockResolvedValue(makeConversationPage())
  requests.remove.mockResolvedValue(undefined)
})
afterEach(() => { if (tree) TestRenderer.act(() => tree!.unmount()); tree = undefined })

it('reopens the latest thread and requests earlier turns with a native scroll anchor', async () => {
  await open()
  expect(text('Review ready')).toHaveLength(1)
  expect(requests.read).toHaveBeenCalledWith('/api/chat/conversations/latest?pageSize=40')
  expect(useChatStore.getState().conversationId).toBe(storedConversationId)
  const list = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'FlatList')[0]!
  expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 })
  requests.read.mockResolvedValueOnce(makeConversationPage({ turns: [], beforeOrder: null }))
  await TestRenderer.act(() => { list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 900 }, layoutMeasurement: { height: 400 } } }) })
  expect(requests.read.mock.calls[1]![0]).toContain(`conversationId=${storedConversationId}&beforeOrder=3`)
  expect(useChatStore.getState().conversationBeforeOrder).toBeNull()
})

it('keeps the empty thread on the conversation-not-found path', async () => {
  requests.read.mockRejectedValueOnce(new ApiClientError(404, 'Unavailable', { code: 'CONVERSATION_NOT_FOUND' }))
  await open()
  expect(text('Empty thread')).toHaveLength(1)
  expect(text('common.error')).toHaveLength(0)
  expect(useChatStore.getState().conversationLoaded).toBe(true)
})

it.each([204, 404])('asks before deleting and clears the id on %s', async status => {
  await open()
  const control = button('chat.conversation.delete')
  const style = StyleSheet.flatten(control.props.style) as ViewStyle
  expect(style.width).toBe(48)
  expect(style.height).toBe(48)
  if (status === 404) requests.remove.mockRejectedValueOnce(new ApiClientError(404, 'Unavailable'))
  TestRenderer.act(() => control.props.onPress())
  expect(requests.remove).not.toHaveBeenCalled()
  TestRenderer.act(() => confirmation().props.onCancel())
  expect(text('Review ready')).toHaveLength(1)
  TestRenderer.act(() => control.props.onPress())
  await TestRenderer.act(async () => { await confirmation().props.onConfirm() })
  expect(requests.remove).toHaveBeenCalledWith(`/api/chat/conversations/${storedConversationId}`, expect.objectContaining({ method: 'DELETE' }))
  expect(useChatStore.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null })
})

it('retains a failed delete and asks again before retry', async () => {
  await open()
  requests.remove.mockRejectedValueOnce(new ApiClientError(503, 'Unavailable'))
  TestRenderer.act(() => button('chat.conversation.delete').props.onPress())
  await TestRenderer.act(async () => { await confirmation().props.onConfirm() })
  expect(text('Review ready')).toHaveLength(1)
  expect(text('common.error').length).toBeGreaterThan(0)
  expect(useChatStore.getState().serverConversationId).toBe(storedConversationId)
  const retry = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.props.label === 'common.retry' && Boolean(node.props.onClick))[0]!
  TestRenderer.act(() => retry.props.onClick())
  expect(requests.remove).toHaveBeenCalledTimes(1)
  await TestRenderer.act(async () => { await confirmation().props.onConfirm() })
  expect(useChatStore.getState().messages).toEqual([])
})

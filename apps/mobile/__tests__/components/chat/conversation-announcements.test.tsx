import React from 'react'
import { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { FlatList, type FlatListProps, type View } from 'react-native'
import type { ChatMessage } from '@orbit/shared/types/chat'
import type { MessageBubbleProps } from '@orbit/shared/chat'
import { AstraConversation } from '@/components/chat/conversation'
import { usePendingOperationExecution } from '@/hooks/use-pending-operation-execution'
import { renderedText } from '../../support/react-test-renderer'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'pt-BR' } }),
}))
const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: api.request }))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/message-bubble', () => ({
  MessageBubble: (props: MessageBubbleProps) => React.createElement('MessageBubbleStub', props),
}))
vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-native')>()
  return {
    ...original,
    FlatList: React.forwardRef<View, FlatListProps<ChatMessage>>((props, ref) => (
      <original.View ref={ref} {...props}>
        {Array.from(props.data ?? []).map((item, index) => <React.Fragment key={item.id}>
          {props.renderItem?.({ item, index, separators: {
            highlight: () => {}, unhighlight: () => {}, updateProps: () => {},
          } })}
        </React.Fragment>)}
      </original.View>
    )),
  }
})

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
function buildChat(): ChatController {
  return {
    flatListRef: { current: null }, messages: [], activeSteps: [], canShowFollowUps: false,
    isTyping: false, streamingMessageId: null, showSuggestions: false,
    sendMessage: vi.fn(), scrollToBottom: vi.fn(), handleBreakdownConfirmed: vi.fn(),
    confirmAndExecutePendingOperation: vi.fn(), prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as ChatController
}
interface TestNode {
  type: unknown
  props: Record<string, unknown>
  parent: TestNode | null
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
  update(element: React.ReactElement): void
  unmount(): void
}
const { create }: { create(element: React.ReactElement): TestTree } = require('react-test-renderer')
let tree: TestTree
function list() {
  return tree.root.findAll(node => node.type === FlatList)[0]!
}
function mount(chat: ChatController) {
  void act(() => { tree = create(<AstraConversation chat={chat} />) })
}
function update(chat: ChatController) {
  void act(() => { tree.update(<AstraConversation chat={chat} />) })
}
function politeRegions() {
  return tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')
}
afterEach(() => { void act(() => tree.unmount()) })

it('keeps the list silent and busy while a turn or tool batch arrives', () => {
  const chat = buildChat()
  mount(chat)
  expect(list().props).not.toHaveProperty('accessibilityLiveRegion')
  expect(list().props.accessibilityState).toEqual({ busy: false })
  chat.isTyping = true
  update(chat)
  expect(list().props.accessibilityState).toEqual({ busy: true })
  chat.isTyping = false
  chat.streamingMessageId = 'reply'
  update(chat)
  expect(list().props.accessibilityState).toEqual({ busy: true })
  chat.streamingMessageId = null
  chat.activeSteps = [{ domain: 'habits', access: 'write' }]
  update(chat)
  expect(list().props.accessibilityState).toEqual({ busy: true })
  chat.activeSteps = []
  update(chat)
  expect(list().props.accessibilityState).toEqual({ busy: false })
})

it('keeps the turn region empty through streaming and reads completed prose once', async () => {
  const chat = buildChat()
  chat.messages = [{ id: 'history', role: 'ai', content: 'History', timestamp: new Date() }]
  mount(chat)
  chat.messages = [...chat.messages, { id: 'reply', role: 'ai', content: '', timestamp: new Date() }]
  chat.streamingMessageId = 'reply'
  update(chat)
  const region = politeRegions().at(-1)!
  expect(region).toBeDefined()
  expect(renderedText(region.props.children)).toBe('')
  chat.messages[1] = { ...chat.messages[1]!, content: 'Partial' }
  update(chat)
  expect(renderedText(region.props.children)).toBe('')
  chat.messages[1] = { ...chat.messages[1], content: 'Completed reply' }
  chat.streamingMessageId = null
  await act(async () => { tree.update(<AstraConversation chat={chat} />); await Promise.resolve() })
  expect(politeRegions().filter(node => renderedText(node.props.children) === 'Completed reply')).toHaveLength(1)
  let turn = region.parent
  while (turn && turn.findAll(node => node.type === 'MessageBubbleStub').length === 0) turn = turn.parent
  expect(turn?.findAll(node => node.type === 'MessageBubbleStub')).toHaveLength(1)
  for (let ancestor = region.parent; ancestor; ancestor = ancestor.parent) {
    if (typeof ancestor.type === 'string') expect(ancestor.props.accessibilityLiveRegion).not.toBe('polite')
  }
  expect(renderedText(politeRegions()[0]!.props.children)).toBe('')
  chat.messages[1] = { ...chat.messages[1], content: 'Edited reply' }
  update(chat)
  expect(renderedText(region.props.children)).toBe('Completed reply')
})

it('mounts final-only replies with an empty region before announcing', async () => {
  const chat = buildChat()
  mount(chat)
  chat.messages = [{ id: 'reply', role: 'ai', content: 'Final only', timestamp: new Date() }]
  update(chat)
  expect(politeRegions()).toHaveLength(1)
  expect(renderedText(politeRegions()[0]!.props.children)).toBe('')
  await act(async () => { await Promise.resolve() })
  expect(renderedText(politeRegions()[0]!.props.children)).toBe('Final only')
})

const onExecuted = () => Promise.resolve()
function BatchConversation({ open = true }: { open?: boolean }) {
  const operations = usePendingOperationExecution({ handleExecutedOperation: onExecuted })
  const chat = buildChat()
  chat.messages = [{ id: 'preview', role: 'ai', content: 'Preview', timestamp: new Date() }]
  return open ? <AstraConversation chat={{ ...chat, ...operations }} /> : null
}

const batchCallbacks = ['onPendingOperationConfirmExecute', 'onPendingOperationPrepareStepUp', 'onPendingOperationVerifyStepUp'] as const
function startBatch(callback: typeof batchCallbacks[number]) {
  const bubble = tree.root.findAll(node => node.type === 'MessageBubbleStub')[0]!
  return (bubble.props[callback] as (...args: string[]) => Promise<unknown>)('operation', 'challenge', '123456', 'token')
}

it.each(batchCallbacks)('keeps the list busy through %s and clears it after failure', async (callback) => {
  let fail!: (error: Error) => void
  api.request.mockReturnValue(new Promise((_, reject) => { fail = reject }))
  void act(() => { tree = create(<BatchConversation />) })
  let execution!: Promise<unknown>
  void act(() => { execution = startBatch(callback) })
  expect(list().props.accessibilityState).toEqual({ busy: true })
  await act(async () => { fail(new Error('Failed')); await execution })
  expect(list().props.accessibilityState).toEqual({ busy: false })
})

it.each(batchCallbacks)('keeps a reopened conversation busy during %s', async (callback) => {
  let fail!: (error: Error) => void
  api.request.mockReturnValue(new Promise((_, reject) => { fail = reject }))
  void act(() => { tree = create(<BatchConversation />) })
  let execution!: Promise<unknown>
  void act(() => { execution = startBatch(callback) })
  void act(() => { tree.update(<BatchConversation open={false} />) })
  void act(() => { tree.update(<BatchConversation />) })
  expect(list().props.accessibilityState).toEqual({ busy: true })
  await act(async () => { fail(new Error('Failed')); await execution })
  expect(list().props.accessibilityState).toEqual({ busy: false })
})


it('does not repeat a completed reply when its row remounts', async () => {
  const chat = buildChat()
  mount(chat)
  const reply: ChatMessage = { id: 'reply', role: 'ai', content: 'Final only', timestamp: new Date() }
  chat.messages = [reply]
  await act(async () => { tree.update(<AstraConversation chat={chat} />); await Promise.resolve() })
  expect(renderedText(politeRegions()[0]!.props.children)).toBe('Final only')
  chat.messages = []
  update(chat)
  chat.messages = [reply]
  await act(async () => { tree.update(<AstraConversation chat={chat} />); await Promise.resolve() })
  expect(renderedText(politeRegions()[0]!.props.children)).toBe('')
})

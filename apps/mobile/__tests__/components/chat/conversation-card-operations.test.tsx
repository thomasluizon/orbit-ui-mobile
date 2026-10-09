import React, { useState } from 'react'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { FlatList, type FlatListProps } from 'react-native'
import type { ChatMessage } from '@orbit/shared/types'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { renderedText } from '../../support/react-test-renderer'
import { usePendingOperationExecution } from '@/hooks/use-pending-operation-execution'
import { AstraConversation } from '@/components/chat/conversation'
import { breakdownSubHabits, makeActionResult, makeAgentOperationResult, makeBulkCreateResponse, makeClarificationPreviewMessage, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ i18n: { language: 'pt-BR' }, t: (key: string) => key }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => React.createElement('Markdown', null, children) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: (path: string) => path === API.ai.pendingOperationRefresh('refresh') ? mutations.refresh() : mutations.revise() }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open ? React.createElement('ConfirmBreakdown', { onConfirm }) : null }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-native')>()
  return { ...original, FlatList: React.forwardRef<FlatList<ChatMessage>, FlatListProps<ChatMessage>>((props, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollToEnd }) as unknown as FlatList<ChatMessage>)
    return <original.View {...props}>{Array.from(props.data ?? []).map((item, index) => <React.Fragment key={item.id}>{props.renderItem?.({ item, index, separators: { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} } })}</React.Fragment>)}</original.View>
  }) }
})

const viewport = { offset: 163.5, height: 1400, visibleHeight: 500 }
const scrollToEnd = vi.fn(() => { viewport.offset = viewport.height - viewport.visibleHeight })
const mutations = vi.hoisted(() => ({ refresh: vi.fn(), revise: vi.fn(), breakdown: vi.fn(), clarification: vi.fn() }))
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: mutations.breakdown, isPending: false }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: mutations.clarification, isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))


type ChatController = Parameters<typeof AstraConversation>[0]['chat']
type CardOperation = 'refresh' | 'revise' | 'breakdown' | 'clarification'
const cardOperations: CardOperation[] = ['refresh', 'revise', 'breakdown', 'clarification']

function messagesFor(operations: CardOperation[]) {
  return operations.map((operation) => {
    if (operation === 'clarification') return makeClarificationPreviewMessage({ id: operation })
    if (operation === 'breakdown') return makeHeldHabitMessage({ id: operation, pendingOperations: [], actions: [makeActionResult({ type: 'SuggestBreakdown', status: 'Suggestion', suggestedSubHabits: breakdownSubHabits })] })
    const message = makeHeldHabitMessage({ id: operation })
    const preview = message.pendingOperations![0]!
    preview.id = operation
    const first = preview.items![0]!
    preview.items = [first, { ...first, itemId: 'second', entityName: 'Second habit', fields: first.fields.map(field => ({ ...field, entityId: 'second', entityName: 'Second habit' })) }]
    preview.changeTargetCount = 2
    if (operation === 'refresh') message.pendingOperationStates = { [operation]: { stale: true } }
    return message
  })
}

function successFor(operation: CardOperation) {
  if (operation === 'breakdown') return makeBulkCreateResponse(['Success', 'Success'])
  if (operation === 'clarification') return { operation: makeAgentOperationResult('Succeeded', 1) }
  const preview = messagesFor([operation])[0]!.pendingOperations![0]!
  return { isSuccess: true, error: null, pendingOperationId: operation, cancelled: false, preview: {
    items: preview.items!.slice(1), changes: [], changeTargetCount: 1, previewFingerprint: 'updated-preview',
  } }
}

function deferOperation(operation: CardOperation) {
  let resolve!: (response: unknown) => void
  let reject!: (error: Error) => void
  const pending = new Promise((finish, fail) => { resolve = finish; reject = fail })
  mutations[operation].mockReturnValue(pending)
  return { finish: (failure: boolean) => {
    if (failure) reject(new Error('Request failed'))
    else resolve(successFor(operation))
  } }
}

const onExecuted = () => Promise.resolve()
function CardConversation({ operations }: { operations: CardOperation[] }) {
  const tracked = usePendingOperationExecution({ handleExecutedOperation: onExecuted })
  const [threadScroll] = useState(createChatThreadScroll)
  const [flatListRef] = useState(() => ({ current: null }))
  const chat = { flatListRef, threadScroll, messages: messagesFor(operations),
    activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: false,
    canShowFollowUps: false, composerProps: { suggestions: [] }, scrollToBottom: () => scrollToEnd(), handleBreakdownConfirmed: vi.fn(), ...tracked,
  } as unknown as ChatController
  return <AstraConversation chat={chat} />
}
interface TestTree { root: ReactTestInstance; unmount(): void }
let tree: TestTree
function press(label: string) {
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function' && (node.props.accessibilityLabel === label || renderedText(node.props.children).includes(label)))[0]!
  const onPress = button.props.onPress as () => void
  onPress()
}
function start(operation: CardOperation) {
  void act(() => {
    if (operation === 'breakdown') {
      press('chat.preview.approve')
    } else press(operation === 'refresh' ? 'chat.operation.refresh' : operation === 'revise' ? 'chat.operation.remove Beber água' : 'habits.clarification.quickAction.daily')
  })
  if (operation === 'breakdown') void act(() => { (tree.root.findAll(node => (node.type as unknown) === 'ConfirmBreakdown')[0]!.props.onConfirm as () => void)() })
}
function expectBusy(busy: boolean) { expect(tree.root.findAll(node => node.type === FlatList)[0]!.props.accessibilityState).toEqual({ busy }) }
beforeEach(() => { vi.clearAllMocks(); viewport.offset = 163.5; viewport.height = 1400 })
afterEach(() => { void act(() => tree.unmount()) })

it.each(cardOperations.flatMap(operation => [false, true].map(failure => ({ operation, failure }))))('reports $operation busy until settlement (failure=$failure)', async ({ operation, failure }) => {
  const deferred = deferOperation(operation)
  void act(() => { tree = create(<CardConversation operations={[operation]} />) as unknown as TestTree })
  expectBusy(false)
  start(operation)
  expectBusy(true)
  await act(async () => { deferred.finish(failure); await Promise.resolve() })
  expectBusy(false)
})
it.each([['refresh', 'revise'], ['breakdown', 'clarification']] as CardOperation[][])('keeps overlapping %s and %s busy until both settle', async (first, second) => {
  const one = deferOperation(first), two = deferOperation(second)
  void act(() => { tree = create(<CardConversation operations={[first, second]} />) as unknown as TestTree })
  start(first); start(second)
  expectBusy(true)
  await act(async () => { one.finish(false); await Promise.resolve() })
  expectBusy(true)
  await act(async () => { two.finish(true); await Promise.resolve() })
  expectBusy(false)
})

function listProps() {
  return tree.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
}
function scroll(offset: number) {
  viewport.offset = offset
  listProps().onScroll?.({ nativeEvent: { contentOffset: { x: 0, y: offset }, contentSize: { width: 412, height: viewport.height }, layoutMeasurement: { width: 412, height: viewport.visibleHeight } } } as Parameters<NonNullable<FlatListProps<ChatMessage>['onScroll']>>[0])
}

it('opens and reopens a retained thread at its newest message', async () => {
  await act(() => { tree = create(<CardConversation operations={['clarification']} />) as unknown as TestTree })
  await act(() => { listProps().onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 500 } } } as Parameters<NonNullable<FlatListProps<ChatMessage>['onLayout']>>[0]) })
  expect(viewport.offset).toBe(900)
  scroll(100)
  await act(() => { tree.unmount(); tree = create(<CardConversation operations={['clarification']} />) as unknown as TestTree })
  await act(() => { listProps().onContentSizeChange?.(412, 1400) })
  expect(viewport.offset).toBe(900)
  expect(scrollToEnd).toHaveBeenCalledWith({ animated: false })
})

it.each([false, true])('reveals the clarification preview actions unless reading earlier messages (reading=%s)', async reading => {
  let finish!: (response: unknown) => void
  mutations.clarification.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await act(() => { tree = create(<CardConversation operations={['clarification']} />) as unknown as TestTree })
  await act(() => { listProps().onContentSizeChange?.(412, 1400) })
  scroll(900)
  start('clarification')
  if (reading) scroll(100)
  scrollToEnd.mockClear()
  await act(async () => {
    finish({ operation: makeAgentOperationResult('PendingConfirmation', 1), pendingOperation: makeHeldHabitMessage().pendingOperations![0]! })
    await Promise.resolve()
  })
  expect(tree.root.findAll(node => typeof node.props.onPress === 'function' && renderedText(node.props.children).includes('chat.operation.approve')).length).toBeGreaterThan(0)
  viewport.height = 1800
  await act(() => { listProps().onContentSizeChange?.(412, 1800) })
  expect(viewport.offset).toBe(reading ? 100 : 1300)
  if (reading) expect(scrollToEnd).not.toHaveBeenCalled()
})

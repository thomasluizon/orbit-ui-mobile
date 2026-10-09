import { createRef, useState } from 'react'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useChatPendingOperations } from '@/hooks/use-chat-pending-operations'
import { holdAccount } from '@/__tests__/support/account-change'
import { AstraConversation } from '@/components/chat/conversation'
import { breakdownSubHabits, makeActionResult, makeAgentOperationResult, makeBulkCreateResponse, makeClarificationPreviewMessage, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/app/actions/chat', () => ({ refreshPendingOperation: mutations.refresh, revisePendingOperation: mutations.revise }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open ? <button onClick={onConfirm}>Confirm breakdown</button> : null }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))

const resizeCallbacks = new Set<() => void>()
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
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
    else resolve(operation === 'breakdown' ? successFor(operation) : { ok: true, data: successFor(operation) })
  } }
}

const onExecuted = () => Promise.resolve()
function CardConversation({ operations }: { operations: CardOperation[] }) {
  const tracked = useChatPendingOperations(onExecuted)
  const [threadScroll] = useState(createChatThreadScroll)
  const [chatContainerRef] = useState(createRef<HTMLDivElement>)
  const scrollToBottom = () => {
    const feed = chatContainerRef.current
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const chat = { chatContainerRef, threadScroll, scrollToBottom, messages: messagesFor(operations),
    activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: operations.length === 0,
    canShowFollowUps: false, composerProps: { suggestions: [] }, handleBreakdownConfirmed: vi.fn(), ...tracked,
  } as unknown as ChatController
  return <AstraConversation chat={chat} />
}
function start(operation: CardOperation) {
  if (operation === 'breakdown') {
    fireEvent.click(screen.getByRole('button', { name: 'chat.preview.approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm breakdown' }))
  } else fireEvent.click(screen.getByRole('button', { name: operation === 'refresh' ? 'chat.operation.refresh' : operation === 'revise' ? 'chat.operation.remove Beber água' : 'habits.clarification.quickAction.daily' }))
}
function expectBusy(busy: boolean) { expect(screen.getByRole('feed')).toHaveAttribute('aria-busy', String(busy)) }
beforeEach(() => { vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn(); holdAccount('user-1') })
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resizeCallbacks.clear()
  if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

it.each(cardOperations.flatMap(operation => [false, true].map(failure => ({ operation, failure }))))('reports $operation busy until settlement (failure=$failure)', async ({ operation, failure }) => {
  const deferred = deferOperation(operation)
  render(<CardConversation operations={[operation]} />)
  expectBusy(false)
  start(operation)
  expectBusy(true)
  await act(async () => { deferred.finish(failure); await Promise.resolve() })
  expectBusy(false)
})
it.each([['refresh', 'revise'], ['breakdown', 'clarification']] as CardOperation[][])('keeps overlapping %s and %s busy until both settle', async (first, second) => {
  const one = deferOperation(first), two = deferOperation(second)
  render(<CardConversation operations={[first, second]} />)
  start(first); start(second)
  expectBusy(true)
  await act(async () => { one.finish(false); await Promise.resolve() })
  expectBusy(true)
  await act(async () => { two.finish(true); await Promise.resolve() })
  expectBusy(false)
})

function renderScrollingConversation(operations: CardOperation[] = ['clarification']) {
  let height = 1400
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) { resizeCallbacks.add(callback) }
    observe() {}
    disconnect() { resizeCallbacks.delete(this.callback) }
  })
  const scrolling = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
    if (typeof options === 'object') this.scrollTop = Math.max(0, Math.min(options.top ?? 0, this.scrollHeight - this.clientHeight))
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrolling })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => height })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 })
  const view = render(<CardConversation operations={operations} />)
  const feed = screen.getByRole('feed')
  return { view, feed, scrolling, grow: () => { height = 1800; for (const resize of resizeCallbacks) resize() } }
}

it('keeps the empty conversation at its first line on opening and content growth', async () => {
  const owner = renderScrollingConversation([])
  await act(async () => { await new Promise(requestAnimationFrame) })
  expect(owner.feed.scrollTop).toBe(0)
  await act(async () => { owner.grow(); await new Promise(requestAnimationFrame) })
  expect(owner.feed.scrollTop).toBe(0)
  expect(owner.scrolling).not.toHaveBeenCalled()
})

it('opens and reopens a retained thread at its newest message', async () => {
  const owner = renderScrollingConversation()
  await act(async () => { await new Promise(requestAnimationFrame) })
  expect(owner.feed.scrollTop).toBe(900)
  owner.feed.scrollTop = 163.5
  fireEvent.scroll(owner.feed)
  owner.view.unmount()
  render(<CardConversation operations={['clarification']} />)
  await act(async () => { await new Promise(requestAnimationFrame) })
  expect(screen.getByRole('feed').scrollTop).toBe(900)
})

it.each([false, true])('reveals the clarification preview actions unless reading earlier messages (reading=%s)', async reading => {
  let finish!: (response: unknown) => void
  mutations.clarification.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const owner = renderScrollingConversation()
  await act(async () => { await new Promise(requestAnimationFrame) })
  start('clarification')
  if (reading) {
    owner.feed.scrollTop = 100
    fireEvent.scroll(owner.feed)
  }
  owner.scrolling.mockClear()
  const pendingOperation = makeHeldHabitMessage().pendingOperations![0]!
  await act(async () => {
    finish({ ok: true, data: { operation: makeAgentOperationResult('PendingConfirmation', 1), pendingOperation } })
    await Promise.resolve()
  })
  expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeInTheDocument()
  await act(async () => { owner.grow(); await new Promise(requestAnimationFrame) })
  expect(owner.feed.scrollTop).toBe(reading ? 100 : 1300)
  if (reading) expect(owner.scrolling).not.toHaveBeenCalled()
})

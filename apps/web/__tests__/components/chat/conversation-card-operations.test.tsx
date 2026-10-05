import { createRef } from 'react'
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
  const chat = { chatContainerRef: createRef<HTMLDivElement>(), messages: messagesFor(operations),
    activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: false,
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
beforeEach(() => { vi.clearAllMocks(); holdAccount('user-1') })
afterEach(cleanup)

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

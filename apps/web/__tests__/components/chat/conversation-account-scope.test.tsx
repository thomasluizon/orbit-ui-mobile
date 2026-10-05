import { createRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === 'chat.trace.steps' ? `${values?.count} steps` : key,
}))

const operationsApi = vi.hoisted(() => ({ confirm: vi.fn(), verify: vi.fn() }))
vi.mock('@/app/actions/chat', () => ({
  confirmPendingOperation: operationsApi.confirm,
  verifyPendingOperationStepUp: operationsApi.verify,
  executePendingOperation: vi.fn(), issuePendingOperationStepUp: vi.fn(),
  revisePendingOperation: vi.fn(), refreshPendingOperation: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/ui/app-bar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/app-bar')>()),
  AppBar: () => null,
}))

vi.mock('@/components/shell/composer', () => ({
  Composer: ({ suggestions }: { suggestions?: { id: string }[] }) => (
    <div data-testid="conversation-composer">{suggestions?.length ? <div role="group" aria-label="composer-chips" /> : null}</div>
  ),
}))

vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: ({ contextualAction }: { contextualAction?: { label: string; onSelect: () => void } }) => <div data-testid="empty-suggestions">{contextualAction ? <button type="button" onClick={contextualAction.onSelect}>{contextualAction.label}</button> : null}</div>,
}))

vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: ({
    message,
    senderLabelId,
    onActionChipClick,
    onPendingOperationConfirmExecute,
    onPendingOperationVerifyStepUp,
    onPendingOperationPrepareStepUp,
  }: {
    message: { id: string; role: string }
    senderLabelId?: string
    onActionChipClick: (entityId: string, actionType: string) => void
    onPendingOperationConfirmExecute: (id: string) => Promise<unknown>
    onPendingOperationPrepareStepUp: (id: string) => Promise<unknown>
    onPendingOperationVerifyStepUp: (id: string, challenge: string, code: string, token: string) => Promise<unknown>
  }) => (
    <div>
      <span id={senderLabelId}>{message.role === 'user' ? 'chat.senderYou' : 'chat.senderOrbit'}</span>
      <button type="button" onClick={() => onActionChipClick('goal-1', 'UpdateGoal')}>open {message.id}</button>
      <button type="button" onClick={() => void onPendingOperationConfirmExecute('operation')}>Apply batch</button>
      <button type="button" onClick={() => void onPendingOperationPrepareStepUp('operation')}>Prepare batch</button>
      <button type="button" onClick={() => void onPendingOperationVerifyStepUp('operation', 'challenge', '123456', 'token')}>Verify batch</button>
    </div>
  ),
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({ goalId }: { goalId: string }) => (
    <div aria-label="goal-detail">{goalId}</div>
  ),
}))

import { AstraConversation } from '@/components/chat/conversation'
import { useChatPendingOperations } from '@/hooks/use-chat-pending-operations'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useChatStore } from '@/stores/chat-store'

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function buildChat(): ChatController {
  return {
    chatContainerRef: createRef<HTMLDivElement>(),
    messages: [{ id: 'message-1', role: 'ai', content: 'hello', timestamp: new Date() }],
    activeSteps: [],
    canShowFollowUps: false,
    isTyping: false,
    streamingMessageId: null,
    showSuggestions: false,
    sendMessage: vi.fn(),
    handleBreakdownConfirmed: vi.fn(),
    confirmAndExecutePendingOperation: vi.fn(),
    prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(),
    isOnline: true,
    sendError: null,
    canRetryLastSend: false,
    retryLastSend: vi.fn(),
    composerProps: { suggestions: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] },
  } as unknown as ChatController
}

it('keeps live composer suggestions available in a new and populated thread', () => {
  const chat = buildChat()
  chat.messages = []
  chat.showSuggestions = true
  const view = render(<AstraConversation chat={chat} />)
  expect(screen.getByTestId('empty-suggestions')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'composer-chips' })).toBeInTheDocument()
  chat.messages = [{ id: 'message-1', role: 'user', content: 'Hello', timestamp: new Date() }]
  chat.showSuggestions = false
  view.rerender(<AstraConversation chat={chat} />)
  expect(screen.queryByTestId('empty-suggestions')).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'composer-chips' })).toBeInTheDocument()
})

it('keeps a requested Progress action reachable in a new conversation', () => {
  const chat = buildChat()
  chat.messages = []
  chat.showSuggestions = true
  chat.composerProps.suggestions = []
  useChatStore.getState().setContextualSuggestion({ id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal' })
  render(<AstraConversation chat={chat} />)
  expect(screen.queryByRole('group', { name: 'composer-chips' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create a goal' }))
  expect(chat.sendMessage).toHaveBeenCalledWith('Help me make a goal')
})

it('collapses two tool steps on the finished message', () => {
  const chat = buildChat()
  chat.messages = [{ id: 'message-1', role: 'ai', content: 'Done', toolSteps: [
    { domain: 'habits', access: 'read' }, { domain: 'other', access: 'read' },
  ], timestamp: new Date() }]
  render(<AstraConversation chat={chat} />)
  const disclosure = screen.getByRole('button', { name: '2 steps' })
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  expect(disclosure).toHaveAttribute('aria-controls')
  fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('chat.trace.unknown')).toBeVisible()
})

it('owns the feed padding and spacing between turns', () => {
  const chat = buildChat()
  chat.messages = [
    { id: 'first', role: 'user', content: 'Hello', timestamp: new Date() },
    { id: 'second', role: 'ai', content: 'Hi', timestamp: new Date() },
  ]
  render(<AstraConversation chat={chat} />)
  const feed = screen.getByRole('feed')
  expect(feed).toHaveStyle({ padding: '16px' })
  expect(feed.firstElementChild).toHaveClass('gap-4')
  expect(feed.firstElementChild?.children).toHaveLength(2)
})

it('shows follow-ups only under the latest AI message and sends their origin', () => {
  const chat = buildChat()
  chat.messages = [
    { id: 'old', role: 'ai', content: 'Old', followUps: ['Old one', 'Old two'], timestamp: new Date() },
    { id: 'new', role: 'ai', content: 'New', followUps: ['Check goals', 'Review habits'], timestamp: new Date() },
  ]
  chat.canShowFollowUps = true
  render(<AstraConversation chat={chat} />)
  expect(screen.queryByText('Old one')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Check goals' }))
  expect(chat.sendMessage).toHaveBeenCalledWith('Check goals', 'followUp')
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('user-1')
  useAppToastStore.setState({ currentToast: null, queue: [] })
  useChatStore.getState().setContextualSuggestion(null)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  useChatStore.getState().setContextualSuggestion(null)
})

it('closes the goal drawer Astra opened when another account replaces the tab', async () => {
  render(<AstraConversation chat={buildChat()} />)
  fireEvent.click(screen.getByText('open message-1'))
  expect(screen.getByLabelText('goal-detail')).toHaveTextContent('goal-1')

  await replaceAccountWith('user-2')

  expect(screen.queryByLabelText('goal-detail')).not.toBeInTheDocument()
})

it('pins an actionable toast above the conversation composer', async () => {
  const reload = vi.fn()
  const view = render(<AstraConversation chat={buildChat()} notice={<AppToastHost />} />)
  act(() => { useAppToastStore.getState().showQueued('App updated', 'Reload', reload) })

  await screen.findByText('App updated')
  const notice = view.container.querySelector('[data-shell-notice]')
  expect(notice?.nextElementSibling).toHaveAttribute('data-testid', 'conversation-composer')
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  expect(reload).toHaveBeenCalledOnce()
})

it('labels and positions feed articles and moves focus in both directions', () => {
  const chat = buildChat()
  chat.messages = [
    { id: 'user', role: 'user', content: 'Hello', timestamp: new Date() },
    { id: 'reply', role: 'ai', content: 'Hi', timestamp: new Date() },
  ]
  render(<AstraConversation chat={chat} />)
  const feed = screen.getByRole('feed', { name: 'chat.title' })
  for (const attribute of ['aria-live', 'aria-relevant', 'aria-atomic']) expect(feed).not.toHaveAttribute(attribute)
  const articles = screen.getAllByRole('article')
  articles.forEach((article, index) => {
    expect(article).toHaveAttribute('aria-posinset', String(index + 1))
    expect(article).toHaveAttribute('aria-setsize', '2')
    expect(article).toHaveAccessibleName(index === 0 ? 'chat.senderYou' : 'chat.senderOrbit')
  })
  articles[0]!.focus()
  fireEvent.keyDown(articles[0]!, { key: 'PageDown' })
  expect(articles[1]!).toHaveFocus()
  fireEvent.keyDown(articles[1]!, { key: 'PageUp' })
  expect(articles[0]!).toHaveFocus()
  fireEvent.keyDown(articles[0]!, { key: 'PageUp' })
  expect(articles[0]!).toHaveFocus()
})

it('mounts an empty turn region and announces completed prose once', async () => {
  const chat = buildChat()
  const view = render(<AstraConversation chat={chat} />)
  chat.messages = [...chat.messages, { id: 'reply', role: 'ai', content: '', timestamp: new Date() }]
  chat.streamingMessageId = 'reply'
  view.rerender(<AstraConversation chat={chat} />)
  const feed = screen.getByRole('feed')
  const region = screen.getAllByRole('article')[1]!.querySelector('[aria-live="polite"]')!
  expect(region).toBeEmptyDOMElement()
  expect(feed).toHaveAttribute('aria-busy', 'true')
  chat.messages[1] = { ...chat.messages[1]!, content: 'Partial' }
  view.rerender(<AstraConversation chat={chat} />)
  expect(region).toBeEmptyDOMElement()
  chat.messages[1] = { ...chat.messages[1]!, content: 'Completed reply' }
  chat.streamingMessageId = null
  view.rerender(<AstraConversation chat={chat} />)
  await vi.waitFor(() => expect(region).toHaveTextContent('Completed reply'))
  expect(feed).toHaveAttribute('aria-busy', 'false')
  expect(screen.getAllByRole('article')[0]!.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement()
  for (const live of feed.querySelectorAll('[aria-live], [role="status"]')) {
    expect(live.parentElement?.closest('[aria-live="polite"], [aria-live="assertive"], [role="status"]')).toBeNull()
  }
  chat.messages[1] = { ...chat.messages[1]!, content: 'Edited reply' }
  view.rerender(<AstraConversation chat={chat} />)
  expect(region).toHaveTextContent('Completed reply')
})

it('keeps final-only reply regions empty on insertion before announcing', async () => {
  const chat = buildChat()
  const view = render(<AstraConversation chat={chat} />)
  chat.messages = [...chat.messages, { id: 'reply', role: 'ai', content: 'Final only', timestamp: new Date() }]
  view.rerender(<AstraConversation chat={chat} />)
  const region = screen.getAllByRole('article')[1]!.querySelector('[aria-live="polite"]')!
  expect(region).toBeEmptyDOMElement()
  await vi.waitFor(() => expect(region).toHaveTextContent('Final only'))
})

const onExecuted = () => Promise.resolve()
function BatchConversation({ open = true }: { open?: boolean }) {
  const operations = useChatPendingOperations(onExecuted)
  return open ? <AstraConversation chat={{ ...buildChat(), ...operations }} /> : null
}

const batchLabels = ['Apply batch', 'Prepare batch', 'Verify batch'] as const
function deferBatch() {
  let finish!: (result: { ok: false; error: string; status: number }) => void
  const pending = new Promise<{ ok: false; error: string; status: number }>((resolve) => { finish = resolve })
  operationsApi.confirm.mockReturnValue(pending)
  operationsApi.verify.mockReturnValue(pending)
  return { pending, finish }
}

it.each(batchLabels)('keeps the feed busy through %s and clears it after failure', async (label) => {
  const { pending, finish } = deferBatch()
  render(<BatchConversation />)
  const feed = screen.getByRole('feed')
  expect(feed).toHaveAttribute('aria-busy', 'false')
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(feed).toHaveAttribute('aria-busy', 'true')
  await act(async () => { finish({ ok: false, error: 'Failed', status: 500 }); await pending })
  expect(feed).toHaveAttribute('aria-busy', 'false')
})

it.each(batchLabels)('keeps a reopened conversation busy during %s', async (label) => {
  const { pending, finish } = deferBatch()
  const view = render(<BatchConversation />)
  fireEvent.click(screen.getByRole('button', { name: label }))
  view.rerender(<BatchConversation open={false} />)
  view.rerender(<BatchConversation />)
  const feed = screen.getByRole('feed')
  expect(feed).toHaveAttribute('aria-busy', 'true')
  await act(async () => { finish({ ok: false, error: 'Failed', status: 500 }); await pending })
  expect(feed).toHaveAttribute('aria-busy', 'false')
})


it('does not repeat a completed reply when its article remounts', async () => {
  const chat = buildChat()
  const view = render(<AstraConversation chat={chat} />)
  const reply: ChatController['messages'][number] = { id: 'reply', role: 'ai', content: 'Final only', timestamp: new Date() }
  chat.messages = [reply]
  view.rerender(<AstraConversation chat={chat} />)
  await vi.waitFor(() => expect(screen.getByRole('article').querySelector('[aria-live="polite"]')).toHaveTextContent('Final only'))
  chat.messages = []
  view.rerender(<AstraConversation chat={chat} />)
  chat.messages = [reply]
  view.rerender(<AstraConversation chat={chat} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('article').querySelector('[aria-live="polite"]')).toBeEmptyDOMElement()
})

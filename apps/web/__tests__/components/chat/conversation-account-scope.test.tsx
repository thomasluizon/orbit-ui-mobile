import { createRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === 'chat.trace.steps' ? `${values?.count} steps` : key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/ui/app-bar', () => ({
  AppBar: () => null,
}))

vi.mock('@/components/shell/composer', () => ({
  Composer: () => <div data-testid="conversation-composer" />,
}))

vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: () => null,
}))

vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: ({
    message,
    onActionChipClick,
  }: {
    message: { id: string }
    onActionChipClick: (entityId: string, actionType: string) => void
  }) => (
    <button type="button" onClick={() => onActionChipClick('goal-1', 'UpdateGoal')}>
      open {message.id}
    </button>
  ),
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({ goalId }: { goalId: string }) => (
    <div aria-label="goal-detail">{goalId}</div>
  ),
}))

import { AstraConversation } from '@/components/chat/conversation'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToastStore } from '@/stores/app-toast-store'

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function buildChat(): ChatController {
  return {
    chatContainerRef: createRef<HTMLDivElement>(),
    messages: [{ id: 'message-1', role: 'assistant', content: 'hello' }],
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
    composerProps: {},
  } as unknown as ChatController
}

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
  const feed = screen.getByRole('log')
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
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
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

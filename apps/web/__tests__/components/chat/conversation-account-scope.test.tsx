import { createRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/ui/app-bar', () => ({
  AppBar: () => null,
}))

vi.mock('@/components/shell/composer', () => ({
  Composer: () => null,
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

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function buildChat(): ChatController {
  return {
    chatContainerRef: createRef<HTMLDivElement>(),
    messages: [{ id: 'message-1', role: 'assistant', content: 'hello' }],
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

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('user-1')
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

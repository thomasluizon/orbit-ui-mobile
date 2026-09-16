import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'

type ActionChipHandler = (entityId: string, actionType: string) => void
type SuggestionHandler = (suggestion: string) => void

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setOpen: vi.fn(),
  goBack: vi.fn(),
  onActionChipClick: null as ActionChipHandler | null,
  onSuggestion: null as SuggestionHandler | null,
  composer: {
    chatContainerRef: { current: null },
    fileInputRef: { current: null },
    messages: [] as { id: string }[],
    isTyping: false,
    hasProAccess: false,
    atMessageLimit: false,
    showSuggestions: false,
    isOnline: true,
    input: '',
    setInput: vi.fn(),
    sendError: null as string | null,
    imagePreview: null,
    isRecording: false,
    isTranscribing: false,
    speechSupported: false,
    toggleRecording: vi.fn(),
    recordingTime: '0:00',
    starterChips: [],
    aiMessagesUsed: 0,
    aiMessagesLimit: 20,
    canSend: false,
    openFilePicker: vi.fn(),
    handleFileSelect: vi.fn(),
    removeImage: vi.fn(),
    composerProps: {},
    sendMessage: vi.fn(),
    retryLastSend: vi.fn(),
    canRetryLastSend: false,
    handleBreakdownConfirmed: vi.fn(),
    confirmAndExecutePendingOperation: vi.fn(),
    prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(),
    scrollToBottom: vi.fn(),
  },
  goal: {
    id: 'goal-9',
    title: 'Goal nine',
    status: 'Active',
    targetValue: 10,
    unit: 'pages',
    linkedHabits: [{ id: 'linked-habit', title: 'linked habit sentinel' }],
    progressHistory: [],
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setAstraConversationOpen: typeof mocks.setOpen }) => unknown) =>
    selector({ setAstraConversationOpen: mocks.setOpen }),
}))
vi.mock('@/components/ui/app-bar', () => ({
  AppBar: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>back sentinel</button>,
}))
vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: ({ onActionChipClick }: { onActionChipClick: ActionChipHandler }) => {
    mocks.onActionChipClick = onActionChipClick
    return null
  },
}))
vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: ({ onSelectSuggestion }: { onSelectSuggestion: SuggestionHandler }) => {
    mocks.onSuggestion = onSelectSuggestion
    return <div data-testid="empty-state" />
  },
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({ data: { goalsById: new Map([[mocks.goal.id, mocks.goal]]) } }),
  useGoalDetail: (goalId: string | null) => ({
    data: goalId ? {
      goal: mocks.goal,
      metrics: {
        trackingStatus: 'no_deadline',
        habitAdherence: [{ habitId: 'linked-habit', currentStreak: 4 }],
      },
    } : null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDeleteGoal: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/components/goals/edit-goal-modal', () => ({ EditGoalModal: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))
vi.mock('@/components/goals/goal-detail-drawer/goal-progress-block', () => ({ GoalProgressBlock: () => null }))
vi.mock('@/components/goals/goal-detail-drawer/goal-action-footer', () => ({ GoalActionFooter: () => null }))
vi.mock('@/components/goals/goal-detail-drawer/use-goal-status-actions', () => ({
  useGoalStatusActions: () => ({
    isUpdatingStatus: false,
    markCompleted: vi.fn(),
    markAbandoned: vi.fn(),
    reactivate: vi.fn(),
  }),
}))
vi.mock('@/components/goals/goal-detail-drawer/use-goal-drawer-initial-action', () => ({
  useGoalDrawerInitialAction: vi.fn(),
}))
vi.mock('@/components/chat/typing-indicator', () => ({
  TypingIndicator: () => <div data-testid="typing-indicator" />,
}))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => mocks.composer }))

import { AstraConversation } from '@/components/chat/conversation'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

function ChatPage() {
  return <AstraConversation chat={useChatComposer()} />
}
const goalActionType = [...CHAT_GOAL_ACTION_TYPES][0] as string

describe('ChatPage', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.setOpen.mockClear()
    mocks.onActionChipClick = null
    mocks.onSuggestion = null
    mocks.composer.messages = []
    mocks.composer.hasProAccess = false
    mocks.composer.showSuggestions = false
    mocks.composer.isTyping = false
    mocks.composer.isOnline = true
    mocks.composer.sendError = null
    sheetTestControls.defer(false)
  })

  it('renders as shell conversation content without route navigation', () => {
    render(<ChatPage />)

    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('renders the empty state when suggestions are shown', () => {
    mocks.composer.showSuggestions = true
    render(<ChatPage />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('sends the selected live suggestion', () => {
    mocks.composer.showSuggestions = true
    render(<ChatPage />)

    act(() => mocks.onSuggestion?.('Plan today'))

    expect(mocks.composer.sendMessage).toHaveBeenCalledWith('Plan today')
  })

  it('uses the visible app-bar back control', () => {
    render(<ChatPage />)

    fireEvent.click(screen.getByRole('button', { name: 'back sentinel' }))

    expect(mocks.setOpen).toHaveBeenCalledWith(false)
  })

  it('marks the feed busy without adding a typing animation', () => {
    mocks.composer.isOnline = false
    mocks.composer.sendError = 'send failed sentinel'
    mocks.composer.isTyping = true

    render(<ChatPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('send failed sentinel')
    expect(screen.getByRole('log', { name: 'chat.title' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
  })

  it('goes back on Escape when no text is being edited', () => {
    render(<ChatPage />)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(mocks.setOpen).toHaveBeenCalledWith(false)
  })

  it('does not go back on Escape while a textarea holds text', () => {
    render(<ChatPage />)
    const textarea = document.createElement('textarea')
    textarea.value = 'draft in progress'
    document.body.appendChild(textarea)

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(mocks.setOpen).not.toHaveBeenCalled()
    textarea.remove()
  })

  it('does not go back on Escape while an input holds text', () => {
    render(<ChatPage />)
    const input = document.createElement('input')
    input.value = 'draft in progress'
    document.body.appendChild(input)

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(mocks.setOpen).not.toHaveBeenCalled()
    input.remove()
  })

  it('does not go back on Escape while editable content holds text', () => {
    render(<ChatPage />)
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    editor.textContent = 'draft in progress'
    document.body.appendChild(editor)

    act(() => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(mocks.setOpen).not.toHaveBeenCalled()
    editor.remove()
  })

  it('opens a goal action without an Astra paywall route', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    mocks.composer.hasProAccess = false
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-1', goalActionType))

    expect(mocks.push).not.toHaveBeenCalledWith('/upgrade')
    expect(screen.getByRole('dialog', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
  })

  it('opens the goal drawer for a goal action chip when pro', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    mocks.composer.hasProAccess = true
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-9', goalActionType))

    expect(screen.getByRole('dialog', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))
    expect(screen.queryByRole('dialog', { name: 'progressScreen.sections.goals' })).not.toBeInTheDocument()
  })

  it('waits for the goal sheet dismissal before closing owners and navigating', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    sheetTestControls.defer(true)
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-9', goalActionType))
    const browserHandlesNavigation = fireEvent.click(screen.getByRole('link', { name: /linked habit sentinel/ }))

    expect(browserHandlesNavigation).toBe(false)
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    expect(mocks.setOpen).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()

    act(() => sheetTestControls.completeDismissal())

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
    expect(mocks.setOpen).toHaveBeenCalledWith(false)
    expect(mocks.push).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/habits/linked-habit')
    expect(mocks.setOpen.mock.invocationCallOrder[0]!).toBeLessThan(mocks.push.mock.invocationCallOrder[0]!)
  })

  it('leaves modified linked habit clicks to the browser', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-9', goalActionType))
    const browserHandlesNavigation = fireEvent.click(
      screen.getByRole('link', { name: /linked habit sentinel/ }),
      { metaKey: true },
    )

    expect(browserHandlesNavigation).toBe(true)
    expect(screen.getByRole('dialog', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    expect(sheetTestControls.isDismissPending).toBe(false)
    expect(mocks.setOpen).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('closes the conversation before routing a habit action chip', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('habit-3', 'view_habit'))

    expect(mocks.setOpen).toHaveBeenCalledWith(false)
    expect(mocks.push).toHaveBeenCalledWith('/habits/habit-3')
    expect(mocks.setOpen.mock.invocationCallOrder[0]!).toBeLessThan(mocks.push.mock.invocationCallOrder[0]!)
  })
})

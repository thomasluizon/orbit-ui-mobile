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
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
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
vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({ goalId, onOpenChange }: { goalId: string; onOpenChange: (open: boolean) => void }) => (
    <div data-testid="goal-drawer">
      {goalId}
      <button onClick={() => onOpenChange(false)}>close goal sentinel</button>
    </div>
  ),
}))
vi.mock('@/components/chat/typing-indicator', () => ({
  TypingIndicator: () => <div data-testid="typing-indicator" />,
}))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => mocks.composer }))

import { AstraConversation } from '@/components/chat/conversation'
import { useChatComposer } from '@/hooks/use-chat-composer'

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

    expect(screen.getByText('chat.offline.description')).toBeInTheDocument()
    expect(screen.getByText('send failed sentinel')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('log', { name: 'chat.title' })).toHaveAttribute('aria-busy', 'true')
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
    expect(screen.getByTestId('goal-drawer')).toHaveTextContent('goal-1')
  })

  it('opens the goal drawer for a goal action chip when pro', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    mocks.composer.hasProAccess = true
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-9', goalActionType))

    expect(screen.getByTestId('goal-drawer')).toHaveTextContent('goal-9')
    fireEvent.click(screen.getByRole('button', { name: 'close goal sentinel' }))
    expect(screen.queryByTestId('goal-drawer')).not.toBeInTheDocument()
  })

  it('routes a non-goal action chip into the habit flow', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('habit-3', 'view_habit'))

    expect(mocks.push).toHaveBeenCalledWith('/habits/habit-3')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'

type ActionChipHandler = (entityId: string, actionType: string) => void

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  isDesktop: false,
  goBack: vi.fn(),
  onActionChipClick: null as ActionChipHandler | null,
  composer: {
    chatContainerRef: { current: null },
    textareaRef: { current: null },
    fileInputRef: { current: null },
    textFileInputRef: { current: null },
    messages: [] as { id: string }[],
    isTyping: false,
    hasProAccess: false,
    atMessageLimit: false,
    showSuggestions: false,
    isOnline: true,
    input: '',
    setInput: vi.fn(),
    sendError: null,
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
    handlePaste: vi.fn(),
    handleKeyDown: vi.fn(),
    removeImage: vi.fn(),
    selectedTextFileName: null,
    openTextFilePicker: vi.fn(),
    handleTextFileSelect: vi.fn(),
    removeTextFile: vi.fn(),
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => mocks.isDesktop }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.goBack }))
vi.mock('@/hooks/use-habits', () => ({ useHabitDetail: () => ({ data: undefined }) }))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: ({ onActionChipClick }: { onActionChipClick: ActionChipHandler }) => {
    mocks.onActionChipClick = onActionChipClick
    return null
  },
}))
vi.mock('@/app/(chat)/chat/chat-empty-state', () => ({
  ChatEmptyState: () => <div data-testid="empty-state" />,
}))
vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({ goalId }: { goalId: string }) => <div data-testid="goal-drawer">{goalId}</div>,
}))
vi.mock('@/components/habits/habit-detail-drawer', () => ({
  HabitDetailDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="habit-drawer" /> : null),
}))
vi.mock('@/app/(chat)/chat/chat-composer-bar', () => ({ ChatComposerBar: () => null }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => mocks.composer }))

import ChatPage from '@/app/(chat)/chat/page'
import { useShellStore } from '@/stores/shell-store'

const goalActionType = [...CHAT_GOAL_ACTION_TYPES][0] as string

describe('ChatPage desktop handoff', () => {
  beforeEach(() => {
    mocks.replace.mockClear()
    mocks.push.mockClear()
    mocks.goBack.mockClear()
    mocks.isDesktop = false
    mocks.onActionChipClick = null
    mocks.composer.messages = []
    mocks.composer.hasProAccess = false
    mocks.composer.showSuggestions = false
    useShellStore.setState({ astraOpen: false, astraMaximized: false })
  })

  it('hands off to the maximized Astra rail at the desktop breakpoint', () => {
    mocks.isDesktop = true
    render(<ChatPage />)

    expect(mocks.replace).toHaveBeenCalledWith('/')
    expect(useShellStore.getState().astraOpen).toBe(true)
    expect(useShellStore.getState().astraMaximized).toBe(true)
  })

  it('keeps the full-page chat below the desktop breakpoint', () => {
    mocks.isDesktop = false
    render(<ChatPage />)

    expect(mocks.replace).not.toHaveBeenCalled()
    expect(useShellStore.getState().astraOpen).toBe(false)
  })

  it('renders the empty state when suggestions are shown', () => {
    mocks.composer.showSuggestions = true
    render(<ChatPage />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('goes back on Escape when no text is being edited', () => {
    render(<ChatPage />)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(mocks.goBack).toHaveBeenCalledWith('/')
  })

  it('does not go back on Escape while a textarea holds text', () => {
    render(<ChatPage />)
    const textarea = document.createElement('textarea')
    textarea.value = 'draft in progress'
    document.body.appendChild(textarea)

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(mocks.goBack).not.toHaveBeenCalled()
    textarea.remove()
  })

  it('routes a goal action chip to upgrade when the user lacks pro access', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    mocks.composer.hasProAccess = false
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-1', goalActionType))

    expect(mocks.push).toHaveBeenCalledWith('/upgrade')
    expect(screen.queryByTestId('goal-drawer')).not.toBeInTheDocument()
  })

  it('opens the goal drawer for a goal action chip when pro', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    mocks.composer.hasProAccess = true
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('goal-9', goalActionType))

    expect(screen.getByTestId('goal-drawer')).toHaveTextContent('goal-9')
  })

  it('opens the habit drawer for a non-goal action chip', () => {
    mocks.composer.messages = [{ id: 'm1' }]
    render(<ChatPage />)

    act(() => mocks.onActionChipClick?.('habit-3', 'view_habit'))

    expect(screen.getByTestId('habit-drawer')).toBeInTheDocument()
  })
})

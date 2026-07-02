import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  isDesktop: false,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

vi.mock('@/components/calendar/use-is-desktop', () => ({
  useIsDesktop: () => mocks.isDesktop,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabitDetail: () => ({ data: undefined }),
}))

vi.mock('@/components/ui/app-bar', () => ({
  AppBar: () => null,
}))

vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: () => null,
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: () => null,
}))

vi.mock('@/components/habits/habit-detail-drawer', () => ({
  HabitDetailDrawer: () => null,
}))

vi.mock('@/app/(chat)/chat/chat-composer-bar', () => ({
  ChatComposerBar: () => null,
}))

vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({
    chatContainerRef: { current: null },
    textareaRef: { current: null },
    fileInputRef: { current: null },
    textFileInputRef: { current: null },
    messages: [],
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
  }),
}))

import ChatPage from '@/app/(chat)/chat/page'
import { useShellStore } from '@/stores/shell-store'

describe('ChatPage desktop handoff', () => {
  beforeEach(() => {
    mocks.replace.mockClear()
    mocks.push.mockClear()
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
    expect(useShellStore.getState().astraMaximized).toBe(false)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ChatResponse } from '@orbit/shared/types/chat'

const mocks = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
  routerPush: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined }),
}))

vi.mock('@/hooks/use-speech-to-text', () => ({
  useSpeechToText: () => ({
    isRecording: false,
    isSupported: true,
    transcript: '',
    error: null,
    selectedLanguage: 'en-US',
    setSelectedLanguage: vi.fn(),
    toggleRecording: vi.fn(),
    recordingDuration: 0,
  }),
}))

vi.mock('@/app/actions/chat', () => ({
  sendChatMessage: mocks.sendChatMessage,
  confirmPendingOperation: vi.fn(),
  executePendingOperation: vi.fn(),
  issuePendingOperationStepUp: vi.fn(),
  verifyPendingOperationStepUp: vi.fn(),
}))

import { useChatComposer } from '@/hooks/use-chat-composer'
import { useChatStore } from '@/stores/chat-store'

function makeChatResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    aiMessage: 'Hi there',
    actions: [],
    ...overrides,
  }
}

describe('web useChatComposer retry state', () => {
  beforeEach(() => {
    mocks.sendChatMessage.mockReset()
    mocks.routerPush.mockReset()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false })
    globalThis.localStorage.clear()
  })

  it('arms retry with the timeout copy when the action reports a 408', async () => {
    mocks.sendChatMessage.mockResolvedValue({ ok: false, error: 'CHAT_TIMEOUT', status: 408 })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.sendError).toBe('chat.timeoutError')
    expect(result.current.canRetryLastSend).toBe(true)
    expect(useChatStore.getState().isTyping).toBe(false)
  })

  it('retries the failed send without duplicating the user message', async () => {
    mocks.sendChatMessage
      .mockResolvedValueOnce({ ok: false, error: 'boom', status: 500 })
      .mockResolvedValueOnce({ ok: true, data: makeChatResponse({ aiMessage: 'Recovered' }) })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('log water')
    })
    expect(result.current.canRetryLastSend).toBe(true)

    await act(async () => {
      await result.current.retryLastSend()
    })

    const messages = useChatStore.getState().messages
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({ role: 'ai', content: 'Recovered' })
    expect(result.current.canRetryLastSend).toBe(false)
    expect(result.current.sendError).toBeNull()
  })

  it('does not arm retry when the failure is the monthly message limit', async () => {
    mocks.sendChatMessage.mockResolvedValue({ ok: false, error: 'limit reached', status: 403 })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.sendError).toBe('chat.limitReachedError')
    expect(result.current.canRetryLastSend).toBe(false)
  })
})

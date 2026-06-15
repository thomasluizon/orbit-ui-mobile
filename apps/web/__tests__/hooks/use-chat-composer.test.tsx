import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@orbit/shared/chat'
import type { ChatResponse } from '@orbit/shared/types/chat'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
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
    isTranscribing: false,
    isSupported: true,
    transcript: '',
    error: null,
    toggleRecording: vi.fn(),
    recordingDuration: 0,
  }),
}))

vi.mock('@/app/actions/chat', () => ({
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

const frame = (json: string) => `data: ${json}\n\n`

function sseResponse(...frames: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const sseFrame of frames) {
        controller.enqueue(encoder.encode(sseFrame))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function finalFrame(response: ChatResponse): string {
  return frame(JSON.stringify({ type: 'final', response }))
}

describe('web useChatComposer streaming send', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.routerPush.mockReset()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false })
    globalThis.localStorage.clear()
    vi.stubGlobal('fetch', mocks.fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('streams deltas into a single ai bubble and the final response wins', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"started"}'),
      frame('{"type":"delta","text":"Hel"}'),
      frame('{"type":"delta","text":"lo"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Hello!', correlationId: 'trace-1' })),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hi')
    })

    const messages = useChatStore.getState().messages
    expect(messages.filter((message) => message.role === 'ai')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'Hello!',
      correlationId: 'trace-1',
    })
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it('clears the streamed draft on reset so the final answer is not duplicated', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"delta","text":"Checking"}'),
      frame('{"type":"reset"}'),
      frame('{"type":"round","iteration":1}'),
      frame('{"type":"delta","text":"Done"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Done' })),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('check my goals')
    })

    const aiMessages = useChatStore.getState().messages.filter((message) => message.role === 'ai')
    expect(aiMessages).toHaveLength(1)
    expect(aiMessages[0]?.content).toBe('Done')
  })

  it('arms retry with the timeout copy when the stream goes idle past the watchdog', async () => {
    vi.useFakeTimers()
    mocks.fetch.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      const sendPromise = result.current.sendMessage('hello')
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS)
      await sendPromise
    })

    expect(result.current.sendError).toBe('chat.timeoutError')
    expect(result.current.canRetryLastSend).toBe(true)
    expect(useChatStore.getState().isTyping).toBe(false)
  })

  it('does not arm retry when the stream reports the monthly message limit', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"started"}'),
      frame('{"type":"error","status":403,"error":"limit reached"}'),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.sendError).toBe('chat.limitReachedError')
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it('retries the failed send without duplicating the user message', async () => {
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"started"}'),
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"delta","text":"Recovered"}'),
        finalFrame(makeChatResponse({ aiMessage: 'Recovered' })),
      ))
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

  it('maps a pre-stream http failure through the same classification', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ error: 'limit reached' }, { status: 403 }),
    )
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.sendError).toBe('chat.limitReachedError')
    expect(result.current.canRetryLastSend).toBe(false)
  })
})

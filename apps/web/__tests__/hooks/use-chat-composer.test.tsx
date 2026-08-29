import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@orbit/shared/chat'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { goalKeys, habitKeys, tagKeys } from '@orbit/shared/query'
import type { ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'

const mocks = vi.hoisted(() => ({
  state: {
    profile: undefined as Profile | undefined,
    isRecording: false,
    isTranscribing: false,
    speechSupported: true,
    transcript: '',
    speechError: null as string | null,
  },
  fetch: vi.fn(),
  routerPush: vi.fn(),
  toggleRecording: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.state.profile }),
}))

vi.mock('@/hooks/use-speech-to-text', () => ({
  useSpeechToText: () => ({
    isRecording: mocks.state.isRecording,
    isTranscribing: mocks.state.isTranscribing,
    isSupported: mocks.state.speechSupported,
    transcript: mocks.state.transcript,
    error: mocks.state.speechError,
    toggleRecording: mocks.toggleRecording,
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
import { Composer } from '@/components/shell/composer'

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

function controlledSseResponse() {
  const encoder = new TextEncoder()
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
  })
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    enqueue: (sseFrame: string) => streamController.enqueue(encoder.encode(sseFrame)),
    close: () => streamController.close(),
  }
}

describe('web useChatComposer streaming send', () => {
  beforeEach(() => {
    mocks.state.profile = undefined
    mocks.state.isRecording = false
    mocks.state.isTranscribing = false
    mocks.state.speechSupported = true
    mocks.state.transcript = ''
    mocks.state.speechError = null
    mocks.fetch.mockReset()
    mocks.routerPush.mockReset()
    mocks.toggleRecording.mockReset()
    mocks.queryClient.invalidateQueries.mockReset()
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false, streamingMessageId: null, draft: '', draftHydrated: false })
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

  it('rejects an overlapping send before a second request starts', async () => {
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { result } = renderHook(() => useChatComposer())

    let firstSend!: Promise<void>
    act(() => {
      firstSend = result.current.sendMessage('first')
      stream.enqueue(frame('{"type":"delta","text":"Working"}'))
    })
    await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())

    await act(async () => {
      await result.current.sendMessage('second')
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await firstSend
    })

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('preserves the active streamed message when the composer remounts', async () => {
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const firstComposer = renderHook(() => useChatComposer())

    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = firstComposer.result.current.sendMessage('hello')
      stream.enqueue(frame('{"type":"delta","text":"Working [[or"}'))
    })
    await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())

    const activeMessageId = useChatStore.getState().streamingMessageId
    expect(activeMessageId).not.toBeNull()
    firstComposer.unmount()

    const remountedComposer = renderHook(() => useChatComposer())
    expect(remountedComposer.result.current.streamingMessageId).toBe(activeMessageId)

    await act(async () => {
      stream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Done' })))
      stream.close()
      await sendPromise
    })
    expect(remountedComposer.result.current.streamingMessageId).toBeNull()
  })

  it('keeps a newer stream active when the finalized request finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    const firstStream = controlledSseResponse()
    const secondStream = controlledSseResponse()
    mocks.fetch
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    const { result } = renderHook(() => useChatComposer())

    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = result.current.sendMessage('finish this')
      firstStream.enqueue(frame('{"type":"delta","text":"Working [[or"}'))
      firstStream.enqueue(finalFrame(makeChatResponse({
        aiMessage: 'Final list: [',
        operations: [{
          operationId: 'operation-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
        }],
      })))
      firstStream.close()
    })

    await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Final list: ['))
    expect(useChatStore.getState().streamingMessageId).toBeNull()
    expect(result.current.isSending).toBe(false)

    let secondSendPromise!: Promise<void>
    act(() => {
      secondSendPromise = result.current.sendMessage('start another')
      secondStream.enqueue(frame('{"type":"delta","text":"Still [[or"}'))
    })
    await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())
    const secondDraftId = useChatStore.getState().streamingMessageId

    await act(async () => {
      resolveInvalidations()
      await sendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBe(secondDraftId)

    await act(async () => {
      secondStream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Second final' })))
      secondStream.close()
      await secondSendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBeNull()
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

  it('submits a pasted image with nonblank text through the rendered composer', async () => {
    const pastedImage = new File(['image'], 'pasted.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:pasted-image'),
      revokeObjectURL: vi.fn(),
    })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))

    function ComposerHarness() {
      const { composerProps } = useChatComposer()
      return <Composer {...composerProps} />
    }

    render(<ComposerHarness />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'shell.composer.placeholder' }), {
      clipboardData: {
        items: [{ type: pastedImage.type, getAsFile: () => pastedImage }],
      },
    })

    expect(screen.getByRole('list', { name: 'shell.composer.attach.trayLabel' })).toBeInTheDocument()
    expect(screen.getByText('pasted.jpg')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'shell.composer.placeholder' }), {
      target: { value: 'log my walk' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('log my walk')
    expect(requestBody.get('image')).toBe(pastedImage)
  })

  it('blocks sending while offline and re-enables once back online', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    try {
      const { result } = renderHook(() => useChatComposer())

      act(() => {
        result.current.setInput('hello')
      })

      expect(result.current.isOnline).toBe(false)
      expect(result.current.canSend).toBe(false)

      act(() => {
        Object.defineProperty(globalThis.navigator, 'onLine', {
          configurable: true,
          value: true,
        })
        globalThis.dispatchEvent(new Event('online'))
      })

      expect(result.current.isOnline).toBe(true)
      expect(result.current.canSend).toBe(true)
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'onLine')
    }
  })

  it('states only the allowance at the message limit', () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
      timeZone: 'America/New_York',
    })

    const { result } = renderHook(() => useChatComposer())
    expect(result.current.composerProps.limitReason).toBe(
      'shell.composer.limit.reason:{"allowance":20}',
    )
    expect(result.current.composerProps.limitReason).not.toContain('resetsAt')
    expect(result.current.composerProps.limitReason).not.toContain('midnight')
  })

  it('restores a saved draft into the rendered composer', async () => {
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'saved walk')

    const { result } = renderHook(() => useChatComposer())

    await waitFor(() => expect(result.current.composerProps.value).toBe('saved walk'))
  })

  it('shares a selected Today draft with a newly mounted conversation composer', () => {
    const todayComposer = renderHook(() => useChatComposer())

    act(() => todayComposer.result.current.setInput('Help me create a morning walk habit'))
    const conversationComposer = renderHook(() => useChatComposer())

    expect(conversationComposer.result.current.composerProps.value).toBe(
      'Help me create a morning walk habit',
    )
  })

  it('commits a finished voice transcript and then exposes transcribing', () => {
    mocks.state.isRecording = true
    mocks.state.transcript = 'walked outside'
    const { result, rerender } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('I'))
    mocks.state.isRecording = false
    rerender()
    expect(result.current.composerProps.value).toBe('I walked outside')

    mocks.state.isTranscribing = true
    rerender()
    expect(result.current.composerProps.state).toBe('transcribing')
    expect(result.current.composerProps.onVoice).toBe(mocks.toggleRecording)
  })

  it('clears a new speech permission error after its visible timeout', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(() => useChatComposer())

    mocks.state.speechError = 'microphone denied'
    rerender()
    expect(result.current.sendError).toBe('microphone denied')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(result.current.sendError).toBeNull()
  })

  it('omits voice when speech is unavailable at the account limit', () => {
    mocks.state.speechSupported = false
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
    })

    const { result } = renderHook(() => useChatComposer())

    expect(result.current.composerProps.state).toBe('atLimit')
    expect(result.current.composerProps.onVoice).toBeUndefined()
  })

  it('arms retry when the transport fails before a response', async () => {
    mocks.fetch.mockRejectedValue(new Error('network unavailable'))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('log water')
    })

    expect(result.current.sendError).toBe('chat.sendError')
    expect(result.current.canRetryLastSend).toBe(true)
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('sends a live suggestion label in the transport payload', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    const suggestion = result.current.composerProps.suggestions[0]

    act(() => suggestion.onSelect())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe(suggestion.label)
  })

  it('refreshes every affected list after successful live actions', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse({
      actions: [
        { type: 'CreateHabit', status: 'Success' },
        { type: 'CreateGoal', status: 'Success' },
        { type: 'CreateTag', status: 'Success' },
      ],
      operations: [{
        operationId: 'operation-1',
        sourceName: 'CreateHabit',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        status: 'Succeeded',
      }],
    }))))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('set up my week')
    })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: tagKeys.lists() })
  })

  it('routes a final premium denial to upgrade', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse({
      policyDenials: [{
        operationId: 'operation-1',
        sourceName: 'CreateGoal',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'Yearly Pro plan required',
      }],
    }))))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('make a yearly goal')
    })

    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')
  })

  it('increments the current non-pro usage cache after a final response', async () => {
    mocks.state.profile = createMockProfile({ hasProAccess: false, aiMessagesUsed: 4 })
    let updatedProfile: Profile | undefined
    mocks.queryClient.setQueryData.mockImplementationOnce(
      (
        _queryKey: readonly unknown[],
        updater: Profile | ((current: Profile | undefined) => Profile | undefined),
      ) => {
        updatedProfile = typeof updater === 'function' ? updater(mocks.state.profile) : updater
      },
    )
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('log water')
    })

    expect(updatedProfile?.aiMessagesUsed).toBe(5)
  })

  it('refreshes habits after a confirmed breakdown', () => {
    const { result } = renderHook(() => useChatComposer())

    result.current.handleBreakdownConfirmed()

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.lists(),
    })
  })
})

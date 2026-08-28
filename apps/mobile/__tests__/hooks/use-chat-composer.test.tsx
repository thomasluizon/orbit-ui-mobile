import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@orbit/shared/chat'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'

import { useChatComposer } from '@/hooks/use-chat-composer'
import { useChatStore } from '@/stores/chat-store'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: undefined as Profile | undefined,
    speechError: null as string | null,
    recordingDuration: 0,
  }

  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
  }

  return {
    state,
    queryClient,
    apiClient: vi.fn(),
    openChatStream: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
    routerPush: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/chat-stream', () => ({
  openChatStream: mocks.openChatStream,
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.state.profile }),
}))

vi.mock('@/hooks/use-speech-to-text', () => ({
  useSpeechToText: () => ({
    isRecording: false,
    isTranscribing: false,
    isSupported: true,
    transcript: '',
    error: mocks.state.speechError,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    toggleRecording: vi.fn(),
    recordingDuration: mocks.state.recordingDuration,
  }),
}))

type ComposerApi = ReturnType<typeof useChatComposer>

async function renderComposer(
  options: { isOnline?: boolean; offlineTitle?: string } = {},
): Promise<{ current: ComposerApi }> {
  const ref: { current: ComposerApi | null } = { current: null }

  function Harness() {
    ref.current = useChatComposer({
      isOnline: options.isOnline ?? true,
      offlineTitle: options.offlineTitle ?? 'offline',
    })
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!ref.current) {
    throw new Error('useChatComposer did not render')
  }

  return ref as { current: ComposerApi }
}

function makeChatResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    aiMessage: 'Hi there',
    actions: [],
    ...overrides,
  }
}

const frame = (json: string) => `data: ${json}\n\n`

function finalFrame(response: ChatResponse): string {
  return frame(JSON.stringify({ type: 'final', response }))
}

function sseStreamResponse(...frames: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const sseFrame of frames) {
        controller.enqueue(encoder.encode(sseFrame))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    body,
    json: () => Promise.resolve(null),
  }
}

function controlledSseStreamResponse() {
  const encoder = new TextEncoder()
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
  })
  return {
    response: {
      ok: true,
      status: 200,
      body,
      json: () => Promise.resolve(null),
    },
    enqueue: (sseFrame: string) => streamController.enqueue(encoder.encode(sseFrame)),
    close: () => streamController.close(),
  }
}

function httpErrorResponse(status: number, errorBody: { error?: string; errorCode?: string }) {
  return {
    ok: false,
    status,
    body: null,
    json: () => Promise.resolve(errorBody),
  }
}

describe('mobile useChatComposer', () => {
  beforeEach(() => {
    mocks.state.profile = undefined
    mocks.state.speechError = null
    mocks.state.recordingDuration = 0
    mocks.apiClient.mockReset()
    mocks.openChatStream.mockReset()
    mocks.requestMediaLibraryPermissionsAsync.mockReset()
    mocks.launchImageLibraryAsync.mockReset()
    mocks.routerPush.mockReset()
    mocks.queryClient.invalidateQueries.mockReset()
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false, streamingMessageId: null })
  })

  it('streams deltas into a single ai bubble and the final response wins', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"started"}'),
      frame('{"type":"delta","text":"Logged"}'),
      frame('{"type":"delta","text":" it"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Logged it', correlationId: 'trace-1' })),
    ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('log water')
    })

    const messages = useChatStore.getState().messages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'log water' })
    expect(messages[1]).toMatchObject({
      role: 'ai',
      content: 'Logged it',
      correlationId: 'trace-1',
    })
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(composer.current.canRetryLastSend).toBe(false)
  })

  it('rejects an overlapping send before a second request starts', async () => {
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const composer = await renderComposer()

    let firstSend!: Promise<void>
    await TestRenderer.act(() => {
      firstSend = composer.current.sendMessage('first')
      stream.enqueue(frame('{"type":"delta","text":"Working"}'))
    })
    await vi.waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('second')
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await firstSend
    })

    expect(mocks.openChatStream).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('keeps a newer stream active when the finalized request finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    const firstStream = controlledSseStreamResponse()
    const secondStream = controlledSseStreamResponse()
    mocks.openChatStream
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    const composer = await renderComposer()

    let sendPromise!: Promise<void>
    await TestRenderer.act(() => {
      sendPromise = composer.current.sendMessage('finish this')
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

    await vi.waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Final list: ['))
    expect(useChatStore.getState().streamingMessageId).toBeNull()
    expect(composer.current.isSending).toBe(false)

    let secondSendPromise!: Promise<void>
    await TestRenderer.act(() => {
      secondSendPromise = composer.current.sendMessage('start another')
      secondStream.enqueue(frame('{"type":"delta","text":"Still [[or"}'))
    })
    await vi.waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())
    const secondDraftId = useChatStore.getState().streamingMessageId

    await TestRenderer.act(async () => {
      resolveInvalidations()
      await sendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBe(secondDraftId)

    await TestRenderer.act(async () => {
      secondStream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Second final' })))
      secondStream.close()
      await secondSendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBeNull()
  })

  it('clears the streamed draft on reset so the final answer is not duplicated', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"delta","text":"Checking"}'),
      frame('{"type":"reset"}'),
      frame('{"type":"round","iteration":1}'),
      frame('{"type":"delta","text":"Done"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Done' })),
    ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('check my goals')
    })

    const aiMessages = useChatStore.getState().messages.filter((message) => message.role === 'ai')
    expect(aiMessages).toHaveLength(1)
    expect(aiMessages[0]?.content).toBe('Done')
  })

  it('bumps the local AI usage count for non-pro users', async () => {
    mocks.state.profile = { aiMessagesUsed: 3 } as Profile
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.queryClient.setQueryData).toHaveBeenCalled()
    const firstCall = mocks.queryClient.setQueryData.mock.calls[0]
    const updater = firstCall?.[1] as (
      current: Profile | undefined,
    ) => Profile | undefined
    expect(updater({ aiMessagesUsed: 3 } as Profile)?.aiMessagesUsed).toBe(4)
  })

  it('does not bump usage for pro users', async () => {
    mocks.state.profile = { hasProAccess: true, aiMessagesUsed: 0 } as Profile
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
  })

  it('routes to upgrade when the backend denies with a premium 403 before streaming', async () => {
    mocks.openChatStream.mockResolvedValue(
      httpErrorResponse(403, { error: 'Premium plan required to use AI chat' }),
    )
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')
    expect(composer.current.sendError).toBe('chat.proGate.body')
  })

  it('surfaces the limit error without routing when the stream reports a non-upgrade 403', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"started"}'),
      frame('{"type":"error","status":403,"error":"Daily message limit reached"}'),
    ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.routerPush).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('chat.limitReachedError')
    expect(composer.current.canRetryLastSend).toBe(false)
  })

  it('blocks sending and surfaces the offline title when offline', async () => {
    const composer = await renderComposer({ isOnline: false, offlineTitle: 'You are offline' })

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('You are offline')
  })

  it('aborts an idle stream at the watchdog and arms retry with the timeout copy', async () => {
    vi.useFakeTimers()
    try {
      mocks.openChatStream.mockImplementation(
        (_formData: FormData, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            })
          }),
      )
      const composer = await renderComposer()

      await TestRenderer.act(async () => {
        const sendPromise = composer.current.sendMessage('hello')
        await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS)
        await sendPromise
      })

      expect(composer.current.sendError).toBe('chat.timeoutError')
      expect(composer.current.canRetryLastSend).toBe(true)
      expect(useChatStore.getState().isTyping).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries the failed send without duplicating the user message', async () => {
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"started"}'),
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"delta","text":"Recovered"}'),
        finalFrame(makeChatResponse({ aiMessage: 'Recovered' })),
      ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('log water')
    })
    expect(composer.current.canRetryLastSend).toBe(true)

    await TestRenderer.act(async () => {
      await composer.current.retryLastSend()
    })

    const messages = useChatStore.getState().messages
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({ role: 'ai', content: 'Recovered' })
    expect(composer.current.canRetryLastSend).toBe(false)
    expect(composer.current.sendError).toBeNull()
  })

  it('confirms then executes a pending operation through the API', async () => {
    mocks.apiClient
      .mockResolvedValueOnce({ confirmationToken: 'token-1' })
      .mockResolvedValueOnce({
        operation: {
          operationId: 'op-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
          summary: 'Created',
        },
      })
    const composer = await renderComposer()

    let result: Awaited<ReturnType<ComposerApi['confirmAndExecutePendingOperation']>> | null = null
    await TestRenderer.act(async () => {
      result = await composer.current.confirmAndExecutePendingOperation('pending-1')
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      1,
      API.ai.pendingOperationConfirm('pending-1'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      2,
      API.ai.pendingOperationExecute('pending-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmationToken: 'token-1' }),
      }),
    )
    expect(result).toMatchObject({ ok: true })
    expect(useChatStore.getState().messages[0]).toMatchObject({
      role: 'ai',
      content: 'chat.operationDone',
    })
  })

  it('selects a valid image from the library and lets it be removed', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.selectedImage?.uri).toBe('file:///pic.jpg')
    expect(composer.current.imagePreview).toBe('file:///pic.jpg')
    expect(composer.current.sendError).toBeNull()

    await TestRenderer.act(() => {
      composer.current.removeImage()
    })
    expect(composer.current.selectedImage).toBeNull()
    expect(composer.current.imagePreview).toBeNull()
  })

  it('submits a selected image with nonblank text', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })
    TestRenderer.act(() => composer.current.setInput('log my walk'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })

    expect(mocks.openChatStream).toHaveBeenCalledOnce()
    expect(appendFormPart).toHaveBeenCalledWith('message', 'log my walk')
    expect(appendFormPart).toHaveBeenCalledWith('image', expect.any(Blob), 'pic.jpg')
    appendFormPart.mockRestore()
  })

  it('blocks image selection when the media-library permission is denied', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(mocks.launchImageLibraryAsync).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('chat.imagePermissionError')
    expect(composer.current.selectedImage).toBeNull()
  })

  it('rejects an unsupported image type with the type error copy', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///doc.pdf', mimeType: 'application/pdf', fileName: 'doc.pdf', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.sendError).toBe('chat.imageError')
    expect(composer.current.selectedImage).toBeNull()
  })

  it('does nothing when the image picker is canceled', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.selectedImage).toBeNull()
    expect(composer.current.sendError).toBeNull()
  })

  it('surfaces the speech-to-text error through the send error banner', async () => {
    mocks.state.speechError = 'mic failed'
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await Promise.resolve()
    })

    expect(composer.current.sendError).toBe('mic failed')
  })

  it('formats the recording duration as m:ss', async () => {
    mocks.state.recordingDuration = 65
    const composer = await renderComposer()

    expect(composer.current.recordingTime).toBe('1:05')
  })

  it('flags the AI message limit for a capped non-pro user', async () => {
    mocks.state.profile = {
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
    } as Profile
    const composer = await renderComposer()

    expect(composer.current.atMessageLimit).toBe(true)
    expect(composer.current.showSuggestions).toBe(true)
    expect(composer.current.starterChips.length).toBeGreaterThan(0)
  })

  it('states the reset at account-timezone midnight when the device timezone differs', async () => {
    const previousTimeZone = process.env.TZ
    process.env.TZ = 'Asia/Tokyo'
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
      timeZone: 'America/New_York',
    })

    try {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Tokyo')
      const composer = await renderComposer()
      expect(composer.current.composerProps.limitReason).toBe(
        'shell.composer.limit.reasonWithTime:{"allowance":20,"resetsAt":"12:00 AM"}',
      )
    } finally {
      process.env.TZ = previousTimeZone
    }
  })

  it('states only midnight when the account timezone is absent', async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
      timeZone: null,
    })

    const composer = await renderComposer()
    expect(composer.current.composerProps.limitReason).toBe(
      'shell.composer.limit.reasonAtMidnight:{"allowance":20}',
    )
    expect(composer.current.composerProps.limitReason).not.toContain('resetsAt')
  })

  it('ignores an empty send with nothing typed or attached', async () => {
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('   ')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
    expect(useChatStore.getState().messages).toHaveLength(0)
  })

  it('ignores a send while the assistant is already typing', async () => {
    useChatStore.setState({ isTyping: true })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
  })
})

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { CHAT_SEND_TIMEOUT_MS } from '@orbit/shared/chat'
import type { ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'

import { useChatComposer } from '@/hooks/use-chat-composer'
import { useChatStore } from '@/stores/chat-store'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: undefined as Profile | undefined,
  }

  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
  }

  return {
    state,
    queryClient,
    apiClient: vi.fn(),
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

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.state.profile }),
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

describe('mobile useChatComposer', () => {
  beforeEach(() => {
    mocks.state.profile = undefined
    mocks.apiClient.mockReset()
    mocks.routerPush.mockReset()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false })
  })

  it('appends the user and AI messages on a successful send', async () => {
    mocks.apiClient.mockResolvedValue(makeChatResponse({ aiMessage: 'Logged it' }))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('log water')
    })

    const messages = useChatStore.getState().messages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'log water' })
    expect(messages[1]).toMatchObject({ role: 'ai', content: 'Logged it' })
    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.chat.send,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('bumps the local AI usage count for non-pro users', async () => {
    mocks.state.profile = { aiMessagesUsed: 3 } as Profile
    mocks.apiClient.mockResolvedValue(makeChatResponse())
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
    mocks.apiClient.mockResolvedValue(makeChatResponse())
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
  })

  it('routes to upgrade when the backend denies with a premium 403', async () => {
    mocks.apiClient.mockRejectedValue({
      status: 403,
      data: { error: 'Premium plan required to use AI chat' },
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')
    expect(composer.current.sendError).toBe('Premium plan required to use AI chat')
  })

  it('surfaces the limit error without routing on a non-upgrade 403', async () => {
    mocks.apiClient.mockRejectedValue({
      status: 403,
      data: { error: 'Daily message limit reached' },
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.routerPush).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('chat.limitReachedError')
  })

  it('blocks sending and surfaces the offline title when offline', async () => {
    const composer = await renderComposer({ isOnline: false, offlineTitle: 'You are offline' })

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('You are offline')
  })

  it('aborts a hung send at the shared timeout and arms retry with the timeout copy', async () => {
    vi.useFakeTimers()
    try {
      mocks.apiClient.mockImplementation(
        (_path: string, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            })
          }),
      )
      const composer = await renderComposer()

      await TestRenderer.act(async () => {
        const sendPromise = composer.current.sendMessage('hello')
        await vi.advanceTimersByTimeAsync(CHAT_SEND_TIMEOUT_MS)
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
    mocks.apiClient
      .mockRejectedValueOnce({ status: 500, data: { error: 'boom' } })
      .mockResolvedValueOnce(makeChatResponse({ aiMessage: 'Recovered' }))
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

  it('does not arm retry when the failure is the monthly message limit', async () => {
    mocks.apiClient.mockRejectedValue({
      status: 403,
      data: { error: 'Daily message limit reached' },
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(composer.current.sendError).toBe('chat.limitReachedError')
    expect(composer.current.canRetryLastSend).toBe(false)
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
    expect(useChatStore.getState().messages[0]).toMatchObject({ role: 'ai', content: 'Created' })
  })
})

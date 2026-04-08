import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runQueuedMutation: vi.fn(),
  apiClient: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  runQueuedMutation: mocks.runQueuedMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

describe('performQueuedApiMutation', () => {
  beforeEach(() => {
    mocks.runQueuedMutation.mockReset()
    mocks.apiClient.mockReset()
  })

  it('forwards raw mutation options to runQueuedMutation', async () => {
    mocks.runQueuedMutation.mockResolvedValue(undefined)

    await performQueuedApiMutation({
      type: 'setLanguage',
      scope: 'profile',
      endpoint: '/api/profile/language',
      method: 'PUT',
      payload: { language: 'en' },
      dedupeKey: 'profile-language',
      queuedResult: undefined,
    })

    expect(mocks.runQueuedMutation).toHaveBeenCalledTimes(1)
    expect(mocks.runQueuedMutation.mock.calls[0]?.[0]).toMatchObject({
      mutation: {
        type: 'setLanguage',
        scope: 'profile',
        endpoint: '/api/profile/language',
        method: 'PUT',
        payload: { language: 'en' },
        dedupeKey: 'profile-language',
      },
      queuedResult: undefined,
    })
    expect(typeof mocks.runQueuedMutation.mock.calls[0]?.[0]?.execute).toBe('function')
  })

  it('uses the default API executor when no custom executor is provided', async () => {
    mocks.runQueuedMutation.mockImplementation(async ({ execute }: { execute: (mutation: { endpoint: string; method: string; payload: unknown }) => Promise<unknown> }) => (
      execute({
        endpoint: '/api/profile/timezone',
        method: 'PUT',
        payload: { timeZone: 'America/Sao_Paulo' },
      })
    ))
    mocks.apiClient.mockResolvedValue(undefined)

    await performQueuedApiMutation({
      type: 'setTimeZone',
      scope: 'profile',
      endpoint: '/api/profile/timezone',
      method: 'PUT',
      payload: { timeZone: 'America/Sao_Paulo' },
    })

    expect(mocks.apiClient).toHaveBeenCalledWith('/api/profile/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timeZone: 'America/Sao_Paulo' }),
    })
  })

  it('respects a custom executor override', async () => {
    const execute = vi.fn(async () => 'done')
    mocks.runQueuedMutation.mockImplementation(async ({ execute: forwardedExecute, mutation }: {
      execute: (mutation: { endpoint: string; method: string; payload: unknown }) => Promise<unknown>
      mutation: { endpoint: string; method: string; payload: unknown }
    }) => forwardedExecute(mutation))

    const result = await performQueuedApiMutation({
      type: 'setAiMemory',
      scope: 'profile',
      endpoint: '/api/profile/ai-memory',
      method: 'PUT',
      payload: { enabled: true },
      execute,
      queuedResult: 'queued',
    })

    expect(execute).toHaveBeenCalledWith({
      type: 'setAiMemory',
      scope: 'profile',
      endpoint: '/api/profile/ai-memory',
      method: 'PUT',
      payload: { enabled: true },
    })
    expect(result).toBe('done')
  })

  it('forwards a queued result factory when provided', async () => {
    mocks.runQueuedMutation.mockResolvedValue(undefined)

    const queuedResultFactory = vi.fn((mutationId: string) => ({
      queued: true as const,
      queuedMutationId: mutationId,
      id: 'offline-habit-1',
    }))

    await performQueuedApiMutation<{ id: string }, { id: string; queued: true; queuedMutationId: string }>({
      type: 'createHabit',
      scope: 'habits',
      endpoint: '/api/habits',
      method: 'POST',
      payload: { title: 'Read' },
      queuedResultFactory,
    })

    expect(queuedResultFactory).not.toHaveBeenCalled()
    expect(mocks.runQueuedMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedResultFactory,
      }),
    )
  })
})

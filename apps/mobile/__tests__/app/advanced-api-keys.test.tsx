import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { apiKeyKeys } from '@orbit/shared/query'
import type {
  AgentCapability,
  ApiKey,
  ApiKeyCreateRequest,
} from '@orbit/shared/types'

import { useApiKeyManagement } from '@/app/advanced-api-keys'

const TestRenderer = require('react-test-renderer')

interface QueryResult {
  data?: unknown
  isLoading?: boolean
  error?: unknown
}

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueryData: vi.fn((key: readonly unknown[]) => store.get(JSON.stringify(key))),
    setQueryData: vi.fn((key: readonly unknown[], updater: unknown) => {
      const serialized = JSON.stringify(key)
      const next =
        typeof updater === 'function'
          ? (updater as (old: unknown) => unknown)(store.get(serialized))
          : updater
      store.set(serialized, next)
      return next
    }),
  }
  return {
    store,
    queryClient,
    queryConfigs: [] as Array<{ queryKey: readonly unknown[]; queryFn: () => unknown }>,
    apiKeysResult: { data: [] } as QueryResult,
    capabilitiesResult: { data: [], isLoading: false, error: null } as QueryResult,
    apiClient: vi.fn(),
    performQueuedApiMutation: vi.fn(async () => undefined),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((config: { queryKey: readonly unknown[]; queryFn: () => unknown }) => {
    mocks.queryConfigs.push(config)
    if (config.queryKey.includes('capabilities')) return mocks.capabilitiesResult
    if (config.queryKey.includes('apiKeys')) return mocks.apiKeysResult
    return { data: undefined }
  }),
  useMutation: vi.fn((config: unknown) => config),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

type ApiKeyManagement = ReturnType<typeof useApiKeyManagement>

function apiKey(id: string): ApiKey {
  return { id } as ApiKey
}

function capability(scope: string, displayName: string): AgentCapability {
  return { scope, displayName } as AgentCapability
}

function translate(key: string): string {
  return key
}

function renderApiKeys(
  options: { hasProAccess?: boolean; isOnline?: boolean } = {},
): { current: ApiKeyManagement } {
  const ref: { current: ApiKeyManagement | null } = { current: null }
  function Harness() {
    ref.current = useApiKeyManagement({
      hasProAccess: options.hasProAccess ?? true,
      isOnline: options.isOnline ?? true,
      queryClient: mocks.queryClient as never,
      t: translate,
    })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })
  if (!ref.current) throw new Error('useApiKeyManagement did not render')
  return ref as { current: ApiKeyManagement }
}

function currentKeys(): ApiKey[] {
  return (mocks.store.get(JSON.stringify(apiKeyKeys.lists())) as ApiKey[]) ?? []
}

interface CapturedMutation {
  mutationFn: (variables: unknown) => Promise<unknown>
  onMutate?: (variables: unknown) => Promise<unknown> | unknown
  onError?: (error: unknown, variables: unknown, context: unknown) => void
  onSettled?: (
    data: unknown,
    error: unknown,
    variables: unknown,
    context: unknown,
  ) => void
}

function asMutation(mutation: unknown): CapturedMutation {
  return mutation as CapturedMutation
}

describe('useApiKeyManagement', () => {
  beforeEach(() => {
    mocks.store.clear()
    mocks.queryConfigs = []
    mocks.apiKeysResult = { data: [] }
    mocks.capabilitiesResult = { data: [], isLoading: false, error: null }
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.apiClient.mockReset()
    mocks.performQueuedApiMutation.mockClear()
  })

  it('fetches keys and capabilities from their endpoints', async () => {
    mocks.apiClient.mockResolvedValue([])
    renderApiKeys()

    const listConfig = mocks.queryConfigs.find(
      (config) => config.queryKey.includes('apiKeys') && config.queryKey.includes('list'),
    )
    const capabilitiesConfig = mocks.queryConfigs.find((config) =>
      config.queryKey.includes('capabilities'),
    )
    await listConfig?.queryFn()
    await capabilitiesConfig?.queryFn()

    expect(mocks.apiClient).toHaveBeenCalledWith(API.apiKeys.list)
    expect(mocks.apiClient).toHaveBeenCalledWith(API.ai.capabilities)
  })

  it('wires the revoke mutation to the queued delete endpoint', async () => {
    const hook = renderApiKeys()

    await asMutation(hook.current.revokeKeyMutation).mutationFn('k-1')

    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deleteApiKey',
        endpoint: API.apiKeys.delete('k-1'),
        method: 'DELETE',
        dedupeKey: 'api-key-delete-k-1',
      }),
    )
  })

  it('groups capabilities by scope, joins display names, and sorts alphabetically', () => {
    mocks.capabilitiesResult = {
      data: [
        capability('habits.write', 'Create habit'),
        capability('habits.write', 'Update habit'),
        capability('goals.read', 'List goals'),
      ],
      isLoading: false,
      error: null,
    }
    const hook = renderApiKeys()

    expect(hook.current.scopeOptions).toEqual([
      { scope: 'goals.read', label: 'goals.read', description: 'List goals' },
      {
        scope: 'habits.write',
        label: 'habits.write',
        description: 'Create habit, Update habit',
      },
    ])
  })

  it('caps key creation at the maximum of five keys', () => {
    mocks.apiKeysResult = {
      data: Array.from({ length: 5 }, (_unused, index) => apiKey(String(index))),
    }
    expect(renderApiKeys().current.canCreateKey).toBe(false)

    mocks.apiKeysResult = {
      data: Array.from({ length: 4 }, (_unused, index) => apiKey(String(index))),
    }
    expect(renderApiKeys().current.canCreateKey).toBe(true)
  })

  it('only allows scoped creation when capabilities are loaded and non-empty', () => {
    mocks.capabilitiesResult = {
      data: [capability('goals.read', 'List goals')],
      isLoading: false,
      error: null,
    }
    expect(renderApiKeys().current.canCreateScopedKey).toBe(true)

    mocks.capabilitiesResult = { data: [], isLoading: false, error: null }
    expect(renderApiKeys().current.canCreateScopedKey).toBe(false)

    mocks.capabilitiesResult = {
      data: [capability('goals.read', 'List goals')],
      isLoading: true,
      error: null,
    }
    expect(renderApiKeys().current.canCreateScopedKey).toBe(false)

    mocks.capabilitiesResult = {
      data: [capability('goals.read', 'List goals')],
      isLoading: false,
      error: new Error('down'),
    }
    expect(renderApiKeys().current.canCreateScopedKey).toBe(false)
  })

  it('short-circuits create when offline and never calls the API', async () => {
    const hook = renderApiKeys({ isOnline: false })

    let result: unknown
    const request: ApiKeyCreateRequest = { name: 'CI key' }
    await TestRenderer.act(async () => {
      result = await hook.current.handleCreateKey(request)
    })

    expect(result).toBeNull()
    expect(hook.current.createKeyError).toBe('errors.offline')
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('creates a key online, invalidates the cache, and returns the response', async () => {
    const created = { id: 'k-1', key: 'sk-live' }
    mocks.apiClient.mockResolvedValue(created)
    const hook = renderApiKeys({ isOnline: true })

    const request: ApiKeyCreateRequest = { name: 'CI key', scopes: ['goals.read'] }
    let result: unknown
    await TestRenderer.act(async () => {
      result = await hook.current.handleCreateKey(request)
    })

    expect(result).toBe(created)
    expect(mocks.apiClient).toHaveBeenCalledWith(API.apiKeys.create, {
      method: 'POST',
      body: JSON.stringify(request),
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: apiKeyKeys.all,
    })
    expect(hook.current.createKeyError).toBeNull()
  })

  it('surfaces a create error when the API call throws', async () => {
    mocks.apiClient.mockRejectedValue(new Error('boom'))
    const hook = renderApiKeys({ isOnline: true })

    let result: unknown
    await TestRenderer.act(async () => {
      result = await hook.current.handleCreateKey({ name: 'CI key' })
    })

    expect(result).toBeNull()
    expect(hook.current.createKeyError).toBe('orbitMcp.createKeyError')
  })

  it('optimistically revokes a key and rolls back on error', async () => {
    mocks.store.set(JSON.stringify(apiKeyKeys.lists()), [apiKey('a'), apiKey('b')])
    const hook = renderApiKeys()

    const revokeKeyMutation = asMutation(hook.current.revokeKeyMutation)
    let context: unknown
    await TestRenderer.act(async () => {
      context = await revokeKeyMutation.onMutate?.('a')
    })
    expect(currentKeys().map((key) => key.id)).toEqual(['b'])

    TestRenderer.act(() => {
      revokeKeyMutation.onError?.(new Error('boom'), 'a', context)
    })
    expect(currentKeys().map((key) => key.id)).toEqual(['a', 'b'])
  })

  it('clears the revoking id and invalidates on settle when online', () => {
    const hook = renderApiKeys({ isOnline: true })

    TestRenderer.act(() => {
      hook.current.setRevokingKeyId('a')
    })
    expect(hook.current.revokingKeyId).toBe('a')

    TestRenderer.act(() => {
      asMutation(hook.current.revokeKeyMutation).onSettled?.(undefined, null, 'a', undefined)
    })

    expect(hook.current.revokingKeyId).toBeNull()
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: apiKeyKeys.all,
    })
  })
})

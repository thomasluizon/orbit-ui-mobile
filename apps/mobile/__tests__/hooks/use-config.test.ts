import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { configKeys } from '@orbit/shared/query'
import { DEFAULT_CONFIG, type AppConfig } from '@orbit/shared/types/config'

const mocks = vi.hoisted(() => {
  const state = {
    data: undefined as AppConfig | undefined,
    lastOptions: null as {
      queryKey: readonly unknown[]
      queryFn: () => Promise<AppConfig>
    } | null,
  }

  return {
    state,
    apiClient: vi.fn(),
    useQuery: vi.fn((options: { queryKey: readonly unknown[]; queryFn: () => Promise<AppConfig> }) => {
      state.lastOptions = options
      return {
        data: state.data,
        isLoading: false,
        isError: false,
        error: null,
      }
    }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

import { useConfig } from '@/hooks/use-config'

describe('mobile useConfig', () => {
  beforeEach(() => {
    mocks.state.data = undefined
    mocks.state.lastOptions = null
    mocks.apiClient.mockReset()
    mocks.useQuery.mockClear()
  })

  it('uses the shared config query key and falls back to DEFAULT_CONFIG', () => {
    const result = useConfig()

    expect(mocks.state.lastOptions?.queryKey).toEqual(configKeys.detail())
    expect(result.config).toEqual(DEFAULT_CONFIG)
  })

  it('returns fetched config when the api call succeeds', async () => {
    const config = createMockConfig()
    mocks.apiClient.mockResolvedValue(config)

    useConfig()
    const response = await mocks.state.lastOptions?.queryFn()

    expect(mocks.apiClient).toHaveBeenCalledWith(API.config.get)
    expect(response).toEqual(config)
  })

  it('returns DEFAULT_CONFIG when the api call fails', async () => {
    mocks.apiClient.mockRejectedValue(new Error('offline'))

    useConfig()
    const response = await mocks.state.lastOptions?.queryFn()

    expect(response).toEqual(DEFAULT_CONFIG)
  })
})

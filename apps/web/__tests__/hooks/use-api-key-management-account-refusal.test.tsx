import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const { createApiKey } = vi.hoisted(() => ({ createApiKey: vi.fn() }))
vi.mock('@/lib/actions/api-keys', () => ({ createApiKey, revokeApiKey: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useApiKeyManagement } from '@/hooks/use-api-key-management'

describe('API key account refusal', () => {
  it('does not show generic retry or invalidate keys after account replacement', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    createApiKey.mockRejectedValueOnce(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useApiKeyManagement({
      hasProAccess: false, queryClient, t: (key) => key,
    }), { wrapper })

    await act(async () => {
      expect(await result.current.handleCreateKey({ name: 'Test', scopes: ['read_habits'] })).toBeNull()
    })
    expect(result.current.createKeyError).toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
  })
})

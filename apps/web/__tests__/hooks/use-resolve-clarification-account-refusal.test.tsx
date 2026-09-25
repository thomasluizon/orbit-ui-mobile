import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const { resolveClarification } = vi.hoisted(() => ({ resolveClarification: vi.fn() }))
vi.mock('@/app/actions/chat', () => ({ resolveClarification }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useResolveClarification } from '@/hooks/use-resolve-clarification'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
}

describe('clarification account refusal', () => {
  it('rejects an account refusal instead of returning a resolved 409', async () => {
    resolveClarification.mockResolvedValueOnce({
      ok: false, error: 'Account changed', status: 409,
      code: 'ACCOUNT_CHANGED', sessionRefreshFailed: false,
    })
    const { result } = renderHook(() => useResolveClarification(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ operationId: 'op-1', value: 'daily' }))
        .rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    })
  })

  it('still returns a real already-resolved conflict', async () => {
    resolveClarification.mockResolvedValueOnce({
      ok: false, error: 'Already resolved', status: 409, sessionRefreshFailed: false,
    })
    const { result } = renderHook(() => useResolveClarification(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ operationId: 'op-1', value: 'daily' }))
        .resolves.toMatchObject({ ok: false, status: 409 })
    })
  })
})

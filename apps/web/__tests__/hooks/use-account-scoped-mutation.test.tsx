import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { bindAccountServerAction } from '@/lib/client-action'
import { toast } from 'sonner'
import { setApiFetchTranslate } from '@/lib/api-fetch'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const account = vi.hoisted(() => ({ id: 'account-a' as string | null, generation: 1 }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => account.id,
  getAccountGeneration: () => account.generation,
  useAuthStore: { getState: () => ({ recoverSessionRefreshFailure: async () => {} }) },
}))

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

describe('useAccountScopedMutation', () => {
  beforeEach(() => {
    account.id = 'account-a'
    account.generation = 1
    vi.mocked(toast.error).mockClear()
    setApiFetchTranslate((key) => key)
  })

  it('keeps the click account through an asynchronous optimistic step', async () => {
    const gate = deferred()
    const entered = deferred()
    const seenAccounts: Array<string | null> = []
    const boundAction = bindAccountServerAction(async (
      _input: string,
      intendedAccountId: string | null,
    ) => {
      seenAccounts.push(intendedAccountId)
      return { ok: true as const, data: intendedAccountId }
    })
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: (input: string) => boundAction(input),
      onMutate: async () => {
        entered.release()
        await gate.promise
        queryClient.setQueryData(['habits'], 'account-a optimistic row')
      },
    }), { wrapper })

    act(() => { result.current.mutate('delete') })
    await entered.promise
    account.id = 'account-b'
    account.generation = 2
    queryClient.setQueryData(['habits'], 'account-b rows')
    await act(async () => { gate.release(); await waitFor(() => expect(seenAccounts).toEqual(['account-a'])) })

    expect(queryClient.getQueryData(['habits'])).not.toBe('account-a optimistic row')
  })

  it('invalidates retained data after a same-account generation change', async () => {
    const gate = deferred()
    const entered = deferred()
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async () => { entered.release(); await gate.promise },
    }), { wrapper })

    act(() => { result.current.mutate() })
    await entered.promise
    account.generation = 2
    await act(async () => { gate.release(); await waitFor(() => expect(invalidate).toHaveBeenCalled()) })
  })

  it('clears optimistic data and reports an account refusal without local error state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    queryClient.setQueryData(['habits'], 'optimistic account-a row')
    const onError = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async () => { throw Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }) },
      onError,
    }), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    })

    expect(queryClient.getQueryData(['habits'])).toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('errors.api.accountChanged', expect.objectContaining({ id: 'account-changed' }))
  })
})

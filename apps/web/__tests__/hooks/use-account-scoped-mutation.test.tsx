import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

const account = vi.hoisted(() => ({ id: 'account-a' as string | null, generation: 1 }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => account.id,
  getAccountGeneration: () => account.generation,
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
  })

  it('keeps the click account through an asynchronous optimistic step', async () => {
    const gate = deferred()
    const entered = deferred()
    const seenAccounts: Array<string | null> = []
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async (_input: string, intendedAccountId) => {
        seenAccounts.push(intendedAccountId)
        return intendedAccountId
      },
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
})

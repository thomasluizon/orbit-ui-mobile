import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const heldAccount = { id: 'account-a' as string | null }

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => heldAccount.id,
}))

const { useAccountScopedMutation } = await import('@/hooks/use-account-scoped-mutation')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useAccountScopedMutation', () => {
  beforeEach(() => {
    heldAccount.id = 'account-a'
  })

  it('carries the account the tab held when mutate was called', async () => {
    const seenAccounts: (string | null)[] = []
    const { result } = renderHook(
      () => useAccountScopedMutation({
        mutationFn: (habitId: string, intendedAccountId) => {
          seenAccounts.push(intendedAccountId)
          return Promise.resolve(habitId)
        },
      }),
      { wrapper: createWrapper() },
    )

    result.current.mutate('habit-1')

    await waitFor(() => expect(seenAccounts).toEqual(['account-a']))
  })

  it('reads the account before onMutate awaits, not after', async () => {
    let releaseOnMutate: (() => void) | undefined
    const onMutateReached = new Promise<void>((resolve) => {
      releaseOnMutate = resolve
    })
    const seenAccounts: (string | null)[] = []

    const { result } = renderHook(
      () => useAccountScopedMutation({
        mutationFn: (habitId: string, intendedAccountId) => {
          seenAccounts.push(intendedAccountId)
          return Promise.resolve(habitId)
        },
        onMutate: async () => {
          await onMutateReached
          return undefined
        },
      }),
      { wrapper: createWrapper() },
    )

    result.current.mutate('habit-1')

    heldAccount.id = 'account-b'
    releaseOnMutate?.()

    await waitFor(() => expect(seenAccounts).toEqual(['account-a']))
  })

  it('hands every callback the caller variables, without the account wrapper', async () => {
    const seen: Record<string, unknown> = {}
    const { result } = renderHook(
      () => useAccountScopedMutation({
        mutationFn: (habitId: string) => Promise.resolve(`logged:${habitId}`),
        onMutate: (variables) => {
          seen.onMutate = variables
          return { snapshot: 'previous' }
        },
        onSuccess: (data, variables) => {
          seen.onSuccessData = data
          seen.onSuccess = variables
        },
        onSettled: (_data, _error, variables, onMutateResult) => {
          seen.onSettled = variables
          seen.onSettledContext = onMutateResult
        },
      }),
      { wrapper: createWrapper() },
    )

    result.current.mutate('habit-1')

    await waitFor(() => expect(seen.onSettled).toBe('habit-1'))
    expect(seen.onMutate).toBe('habit-1')
    expect(seen.onSuccess).toBe('habit-1')
    expect(seen.onSuccessData).toBe('logged:habit-1')
    expect(seen.onSettledContext).toEqual({ snapshot: 'previous' })
  })

  it('hands a per-call onSuccess the caller variables too', async () => {
    const perCallSuccess = vi.fn()
    const { result } = renderHook(
      () => useAccountScopedMutation({
        mutationFn: (habitId: string) => Promise.resolve(habitId),
      }),
      { wrapper: createWrapper() },
    )

    result.current.mutate('habit-1', { onSuccess: perCallSuccess })

    await waitFor(() => expect(perCallSuccess).toHaveBeenCalled())
    expect(perCallSuccess.mock.calls[0]?.[1]).toBe('habit-1')
  })

  it('reports the caller variables rather than the account wrapper', async () => {
    const { result } = renderHook(
      () => useAccountScopedMutation({
        mutationFn: (habitId: string) => Promise.resolve(habitId),
      }),
      { wrapper: createWrapper() },
    )

    await result.current.mutateAsync('habit-1')

    await waitFor(() => expect(result.current.variables).toBe('habit-1'))
  })

  it('carries a null account when the tab holds none', async () => {
    heldAccount.id = null
    const seenAccounts: (string | null)[] = []
    const { result } = renderHook(
      () => useAccountScopedMutation({
        mutationFn: (habitId: string, intendedAccountId) => {
          seenAccounts.push(intendedAccountId)
          return Promise.resolve(habitId)
        },
      }),
      { wrapper: createWrapper() },
    )

    await result.current.mutateAsync('habit-1')

    expect(seenAccounts).toEqual([null])
  })
})

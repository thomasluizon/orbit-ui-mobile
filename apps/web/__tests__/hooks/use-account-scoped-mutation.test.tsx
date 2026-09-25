import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const heldAccount = { id: 'account-a' as string | null }
const accountGeneration = { current: 0 }
const showPersistentError = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError }) }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => heldAccount.id,
}))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => accountGeneration.current }))

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
    accountGeneration.current = 0
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

  it('keeps a refused account A rollback out of account B cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const onSettled = vi.fn()
    queryClient.setQueryData(['profile'], 'account-a-profile')
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async (_id: string) => { throw Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED', status: 409 }) },
      onError: () => queryClient.setQueryData(['profile'], 'account-a-profile'),
      onSettled,
    }), { wrapper })

    result.current.mutate('habit-1')
    heldAccount.id = 'account-b'
    queryClient.clear()
    queryClient.setQueryData(['profile'], 'account-b-profile')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData(['profile'])).toBe('account-b-profile')
    expect(onSettled).not.toHaveBeenCalled()
    expect(showPersistentError).toHaveBeenCalledWith('errors.api.accountChanged', 'common.dismiss', 'errorScreen.reload')
  })

  it('removes an optimistic write resumed after another account loaded', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    let releaseCancel: (() => void) | undefined
    const cancelFinished = new Promise<void>((resolve) => { releaseCancel = resolve })
    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async () => undefined,
      onMutate: async () => {
        await cancelFinished
        queryClient.setQueryData(['templates'], (old: string[] | undefined) =>
          [...(old ?? []), 'account-a-placeholder'])
      },
    }), { wrapper })

    result.current.mutate(undefined)
    heldAccount.id = 'account-b'
    accountGeneration.current += 1
    queryClient.clear()
    queryClient.setQueryData(['templates'], ['account-b-template'])
    releaseCancel?.()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData<string[]>(['templates']) ?? []).not.toContain('account-a-placeholder')
  })

  it('reconciles a completed write after re-login to the same account', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    queryClient.setQueryData(['goals'], ['old-goal'])
    let releaseWrite: (() => void) | undefined
    const writeFinished = new Promise<void>((resolve) => { releaseWrite = resolve })
    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async () => { await writeFinished },
      onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['goals'] }) },
    }), { wrapper })

    result.current.mutate(undefined)
    accountGeneration.current += 1
    releaseWrite?.()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryState(['goals'])?.isInvalidated).toBe(true)
  })

  it('removes optimistic account A cache when the cookie changed before this tab learned', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    queryClient.setQueryData(['profile'], 'account-a-profile')
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    const { result } = renderHook(() => useAccountScopedMutation({
      mutationFn: async (_id: string) => { throw Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED', status: 409 }) },
      onError: () => queryClient.setQueryData(['profile'], 'account-a-profile'),
    }), { wrapper })

    result.current.mutate('habit-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
    expect(showPersistentError).toHaveBeenCalledWith('errors.api.accountChanged', 'common.dismiss', 'errorScreen.reload')
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

  it('passes null intent through when the tab has no account to compare', async () => {
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

    await expect(result.current.mutateAsync('habit-1')).resolves.toBe('habit-1')

    expect(seenAccounts).toEqual([null])
  })
})

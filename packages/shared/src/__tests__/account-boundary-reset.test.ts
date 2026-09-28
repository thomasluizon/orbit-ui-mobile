import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { describe, expect, it, vi } from 'vitest'
import { resetAccountQueries } from '../query/reset-account-queries'

describe('account boundary reset', () => {
  it('removes unobserved data while notifying disabled observers', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['unobserved'], 'account-a')
    const observer = new QueryObserver(queryClient, {
      queryKey: ['disabled'],
      queryFn: async () => 'account-b',
      enabled: false,
      initialData: 'account-a',
    })
    const seen: Array<string | undefined> = []
    const unsubscribe = observer.subscribe((result) => seen.push(result.data))
    try {
      await resetAccountQueries(queryClient, 'signed-in')
      expect(queryClient.getQueryData(['unobserved'])).toBeUndefined()
      expect(observer.getCurrentResult().data).toBeUndefined()
      expect(seen).toContain(undefined)
    } finally {
      unsubscribe()
    }
  })

  it('settles a mounted observer whose first fetch was cancelled', async () => {
    const queryClient = new QueryClient()
    let answer: (value: string) => void = () => {}
    const firstAnswer = new Promise<string>((resolve) => { answer = resolve })
    const queryFn = vi.fn()
      .mockImplementationOnce(() => firstAnswer)
      .mockResolvedValueOnce('account-b')
    const observer = new QueryObserver(queryClient, { queryKey: ['habits'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    try {
      expect(observer.getCurrentResult().fetchStatus).toBe('fetching')
      const reset = resetAccountQueries(queryClient, 'signed-in')
      answer('account-a')
      await reset
      expect(observer.getCurrentResult()).toMatchObject({
        status: 'success', fetchStatus: 'idle', data: 'account-b',
      })
      expect(queryFn).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe()
    }
  })

  it('empties signed-out observers without starting another request', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['inactive'], 'account-a')
    const queryFn = vi.fn(async () => 'account-a')
    const observer = new QueryObserver(queryClient, {
      queryKey: ['profile'], queryFn, initialData: 'account-a', staleTime: 300000,
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await resetAccountQueries(queryClient, 'signed-out')
      expect(queryClient.getQueryData(['inactive'])).toBeUndefined()
      expect(observer.getCurrentResult()).toMatchObject({
        status: 'pending', fetchStatus: 'idle', data: undefined,
      })
      expect(queryFn).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it('never emits previous account initial data and fetches the held account', async () => {
    const queryClient = new QueryClient()
    let answer: (value: string) => void = () => {}
    const nextAccount = new Promise<string>((resolve) => { answer = resolve })
    const queryFn = vi.fn(() => nextAccount)
    const observer = new QueryObserver(queryClient, {
      queryKey: ['profile'],
      queryFn,
      initialData: 'account-a',
      staleTime: 300000,
    })
    const seen: Array<string | undefined> = []
    const unsubscribe = observer.subscribe((result) => seen.push(result.data))
    try {
      const reset = resetAccountQueries(queryClient, 'signed-in')
      expect(observer.getCurrentResult().data).toBeUndefined()
      answer('account-b')
      await reset
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('account-b'))
      expect(seen).not.toContain('account-a')
      expect(queryFn).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribe()
    }
  })
})

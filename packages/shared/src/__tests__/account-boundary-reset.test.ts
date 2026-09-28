import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { describe, expect, it, vi } from 'vitest'
import { resetAccountQueries } from '../query/reset-account-queries'

describe('account boundary reset', () => {
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
      const reset = resetAccountQueries(queryClient)
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
      const reset = resetAccountQueries(queryClient)
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

import React from 'react'
import TestRenderer from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDismissCalendarSuggestion, useRunCalendarSyncNow, useSetCalendarAutoSync } from '@/hooks/use-calendar-auto-sync'
import { advanceAccountGeneration } from '@/lib/session-epoch'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const apiClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client', () => ({ apiClient }))

describe('mobile calendar mutation account scope', () => {
  beforeEach(() => { apiClient.mockReset() })

  it.each([true, false])('lets the next account toggle while the previous %s response is pending', async (succeeds) => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    let mutation!: ReturnType<typeof useSetCalendarAutoSync>
    function Probe() {
      mutation = useSetCalendarAutoSync()
      return null
    }
    let finishFirst!: (value?: unknown) => void
    let failFirst!: (error: Error) => void
    let finishSecond!: (value?: unknown) => void
    apiClient
      .mockImplementationOnce(() => new Promise((resolve, reject) => { finishFirst = resolve; failFirst = reject }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve }))

    let tree!: { unmount: () => void }
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>) as unknown as { unmount: () => void }
      await Promise.resolve()
    })
    let first!: Promise<void>
    await TestRenderer.act(async () => { first = mutation.mutateAsync({ enabled: true }); await Promise.resolve() })
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))

    await TestRenderer.act(async () => { advanceAccountGeneration(); await Promise.resolve() })
    await vi.waitFor(() => expect(mutation.isPending).toBe(false))
    let second!: Promise<void>
    await TestRenderer.act(async () => { second = mutation.mutateAsync({ enabled: false }); await Promise.resolve() })
    expect(apiClient).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))

    await TestRenderer.act(async () => {
      if (succeeds) finishFirst(undefined)
      else failFirst(new Error('old failure'))
      await first.catch(() => undefined)
    })
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))
    await TestRenderer.act(async () => { finishSecond(undefined); await second })
    await vi.waitFor(() => expect(mutation.isPending).toBe(false))
    await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() })
  })

  it('retires a pending manual sync without invalidating the next account cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let mutation!: ReturnType<typeof useRunCalendarSyncNow>
    function Probe() { mutation = useRunCalendarSyncNow(); return null }
    let finishFirst!: (value: unknown) => void
    apiClient.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
    let tree!: { unmount: () => void }
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>) as unknown as { unmount: () => void }
      await Promise.resolve()
    })
    let first!: Promise<unknown>
    await TestRenderer.act(async () => { first = mutation.mutateAsync(); await Promise.resolve() })
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))
    await TestRenderer.act(async () => { advanceAccountGeneration(); await Promise.resolve() })
    await vi.waitFor(() => expect(mutation.isPending).toBe(false))
    await TestRenderer.act(async () => {
      finishFirst({ newSuggestions: 1, reconciledHabits: 0, status: 'Idle' })
      await first
    })
    expect(invalidate).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() })
  })

  it('retires a pending suggestion dismissal before the next account dismisses', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    let mutation!: ReturnType<typeof useDismissCalendarSuggestion>
    function Probe() { mutation = useDismissCalendarSuggestion(); return null }
    let finishFirst!: (value?: unknown) => void
    let finishSecond!: (value?: unknown) => void
    apiClient
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve }))
    let tree!: { unmount: () => void }
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>) as unknown as { unmount: () => void }
      await Promise.resolve()
    })
    let first!: Promise<void>
    await TestRenderer.act(async () => { first = mutation.mutateAsync({ id: 'sugg-1' }); await Promise.resolve() })
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))
    await TestRenderer.act(async () => { advanceAccountGeneration(); await Promise.resolve() })
    await vi.waitFor(() => expect(mutation.isPending).toBe(false))
    let second!: Promise<void>
    await TestRenderer.act(async () => { second = mutation.mutateAsync({ id: 'sugg-2' }); await Promise.resolve() })
    expect(apiClient).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))
    await TestRenderer.act(async () => { finishFirst(undefined); await first })
    await vi.waitFor(() => expect(mutation.isPending).toBe(true))
    await TestRenderer.act(async () => { finishSecond(undefined); await second })
    await vi.waitFor(() => expect(mutation.isPending).toBe(false))
    await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() })
  })
})

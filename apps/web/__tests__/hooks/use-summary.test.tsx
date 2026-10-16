import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dailySummaryResponseSchema, type DailySummaryResponse } from '@orbit/shared/types/daily-summary'
import { useSummary } from '@/hooks/use-summary'

const mocks = vi.hoisted(() => ({ fetchSummary: vi.fn() }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: (...args: unknown[]) => mocks.fetchSummary(...args) }))

const payload = { summary: 'Your habits are ready for today.', insight: '', fromCache: false }
const options = { date: '2026-08-29', locale: 'pt-BR', hasProAccess: true, aiSummaryEnabled: true }
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function SummaryQueryProvider({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
beforeEach(() => { mocks.fetchSummary.mockReset() })

describe('daily summary query adapter', () => {
  it('loads and validates the producer-shaped daily summary through the BFF', async () => {
    let finish!: (response: DailySummaryResponse) => void
    mocks.fetchSummary.mockImplementation(() => new Promise<DailySummaryResponse>((resolve) => { finish = resolve }))
    const { result } = renderHook(() => useSummary(options), { wrapper: wrapper() })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.summary).toBeNull()
    await act(async () => finish(dailySummaryResponseSchema.parse(payload)))
    await waitFor(() => expect(result.current.summary).toBe(payload.summary))
    expect(mocks.fetchSummary).toHaveBeenCalledWith('/api/habits/summary?dateFrom=2026-08-29&dateTo=2026-08-29&language=pt-BR', dailySummaryResponseSchema, { handlesError: true })
    expect(result.current.isLoading).toBe(false)
  })

  it('exposes an error and recovers through an explicit retry', async () => {
    mocks.fetchSummary.mockRejectedValueOnce(new Error('Summary unavailable')).mockResolvedValueOnce(payload)
    const { result } = renderHook(() => useSummary(options), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.error?.message).toBe('Summary unavailable'))
    expect(result.current.summary).toBeNull()
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.summary).toBe(payload.summary))
    expect(result.current.error).toBeNull()
  })

  it.each([{ hasProAccess: false }, { aiSummaryEnabled: false }, { date: '' }])('does not request a gated summary: %j', (gate) => {
    const { result } = renderHook(() => useSummary({ ...options, ...gate }), { wrapper: wrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.summary).toBeNull()
    expect(mocks.fetchSummary).not.toHaveBeenCalled()
  })

  it('switches cache entries when the date and language change', async () => {
    mocks.fetchSummary.mockResolvedValueOnce(payload).mockResolvedValueOnce({ ...payload, summary: 'Another day.' })
    const { result, rerender } = renderHook((current) => useSummary(current), { wrapper: wrapper(), initialProps: options })
    await waitFor(() => expect(result.current.summary).toBe(payload.summary))
    rerender({ ...options, date: '2026-08-30', locale: 'en' })
    expect(result.current.summary).toBeNull()
    await waitFor(() => expect(result.current.summary).toBe('Another day.'))
    expect(mocks.fetchSummary).toHaveBeenLastCalledWith('/api/habits/summary?dateFrom=2026-08-30&dateTo=2026-08-30&language=en', dailySummaryResponseSchema, { handlesError: true })
  })
})

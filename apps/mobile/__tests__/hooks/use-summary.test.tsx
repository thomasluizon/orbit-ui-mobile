import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dailySummaryResponseSchema } from '@orbit/shared/types/daily-summary'
import { useSummary } from '@/hooks/use-summary'

const mocks = vi.hoisted(() => ({ fetchSummary: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.fetchSummary(...args) }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const payload = { summary: 'Your habits are ready for today.', insight: '', fromCache: false }
const options = { date: '2026-08-29', locale: 'pt-BR', timeZone: 'UTC', hasProAccess: true, aiSummaryEnabled: true }
type SummaryTree = ReturnType<typeof TestRenderer.create> & { unmount: () => void }
async function mountSummary(overrides = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  let result!: ReturnType<typeof useSummary>
  function Harness() { result = useSummary({ ...options, ...overrides }); return null }
  let tree!: SummaryTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) as SummaryTree })
  return { current: () => result, unmount: () => TestRenderer.act(() => tree.unmount()) }
}
beforeEach(() => { mocks.fetchSummary.mockReset() })

describe('daily summary query adapter', () => {
  it('loads a producer-shaped response through the direct API adapter', async () => {
    mocks.fetchSummary.mockResolvedValue(dailySummaryResponseSchema.parse(payload))
    const query = await mountSummary()
    try {
      await vi.waitFor(() => expect(query.current().summary).toBe(payload.summary))
      expect(mocks.fetchSummary).toHaveBeenCalledWith('/api/habits/summary?dateFrom=2026-08-29&dateTo=2026-08-29&language=pt-BR', undefined, dailySummaryResponseSchema)
      expect(query.current().isLoading).toBe(false)
    } finally { await query.unmount() }
  })

  it('exposes errors and recovers through an explicit retry', async () => {
    mocks.fetchSummary.mockRejectedValueOnce(new Error('Summary unavailable')).mockResolvedValueOnce(payload)
    const query = await mountSummary()
    try {
      await vi.waitFor(() => expect(query.current().error?.message).toBe('Summary unavailable'))
      expect(query.current().summary).toBeNull()
      await TestRenderer.act(async () => { await query.current().refetch() })
      await vi.waitFor(() => expect(query.current().summary).toBe(payload.summary))
      expect(query.current().error).toBeNull()
    } finally { await query.unmount() }
  })

  it.each([{ hasProAccess: false }, { aiSummaryEnabled: false }, { date: '' }])('does not request a gated summary: %j', async (gate) => {
    const query = await mountSummary(gate)
    try {
      expect(query.current().isLoading).toBe(false)
      expect(query.current().summary).toBeNull()
      expect(mocks.fetchSummary).not.toHaveBeenCalled()
    } finally { await query.unmount() }
  })
})

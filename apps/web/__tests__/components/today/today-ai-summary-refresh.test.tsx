import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { dailySummaryResponseSchema } from '@orbit/shared/types/daily-summary'
import { habitKeys } from '@orbit/shared/query'
import { TodayAISummary } from '@/components/today/today-ai-summary'

const mocks = vi.hoisted(() => ({ fetchSummary: vi.fn() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, timeZone: 'America/Sao_Paulo' }) }),
}))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: (...args: unknown[]) => mocks.fetchSummary(...args) }))

afterEach(() => { vi.useRealTimers(); mocks.fetchSummary.mockReset() })

describe('daily summary account-time refresh', () => {
  it('refreshes at the account bucket boundary and uses the account bucket cache key', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T13:59:00Z'))
    const morning = dailySummaryResponseSchema.parse({ summary: 'Morning guidance.', insight: '', fromCache: false })
    const afternoon = { ...morning, summary: 'Afternoon guidance.' }
    mocks.fetchSummary.mockResolvedValueOnce(morning).mockResolvedValue(afternoon)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const page = render(<QueryClientProvider client={client}><TodayAISummary date="2026-08-29" /></QueryClientProvider>)
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(screen.getByText(morning.summary)).toBeInTheDocument()
      expect(client.getQueryCache().findAll({ queryKey: habitKeys.summaryPrefix() }).map((query) => query.queryKey.at(-1))).toEqual(['morning'])
      await act(async () => { await vi.advanceTimersByTimeAsync(59_998) })
      expect(mocks.fetchSummary).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(1_001) })
      expect(mocks.fetchSummary.mock.calls.length).toBeGreaterThan(1)
      expect(screen.getByText(afternoon.summary)).toBeInTheDocument()
      expect(client.getQueryCache().findAll({ queryKey: habitKeys.summaryPrefix() }).map((query) => query.queryKey.at(-1))).toContain('afternoon')
    } finally { page.unmount(); client.clear() }
  })
})

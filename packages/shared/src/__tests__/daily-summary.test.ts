import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailySummaryQueryOptions } from '../query/daily-summary'
import { habitKeys } from '../query/keys'
import { dailySummaryResponseSchema } from '../types/daily-summary'

const options = { date: '2026-08-29', locale: 'pt-BR', hasProAccess: true, aiSummaryEnabled: true }
const payload = { summary: 'Your habits are ready for today.', insight: '', fromCache: false }
afterEach(() => vi.useRealTimers())

describe('daily summary query contract', () => {
  it('keeps summaries under the habit invalidation prefix and refreshes at the next time bucket', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 10, 59))
    const fetchSummary = vi.fn(async () => dailySummaryResponseSchema.parse(payload))
    const query = dailySummaryQueryOptions(options, fetchSummary)
    expect(query.queryKey).toEqual([...habitKeys.summaryPrefix(), options.date, options.date, options.locale, 'morning'])
    expect(query.refetchInterval()).toBe(60_000)
    expect(await query.queryFn()).toEqual(payload)
    vi.setSystemTime(new Date(2026, 7, 29, 11, 0))
    expect(dailySummaryQueryOptions(options, fetchSummary).queryKey.at(-1)).toBe('afternoon')
  })

  it('rejects a malformed summary at the API boundary', () => {
    expect(dailySummaryResponseSchema.safeParse({ ...payload, summary: null }).success).toBe(false)
  })
})

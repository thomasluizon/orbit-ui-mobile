import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serverAuthFetch = vi.fn()

vi.mock('@/lib/server-fetch', () => ({ serverAuthFetch }))

const { loadTodayInitialHabits } = await import('@/app/(app)/today-initial-data')

describe('Today initial habits', () => {
  beforeEach(() => {
    serverAuthFetch.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preloads the same dated query used by the Today client', async () => {
    serverAuthFetch.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 50,
      totalCount: 0,
      totalPages: 1,
    })

    await expect(loadTodayInitialHabits(undefined)).resolves.toEqual({
      dateStr: '2026-08-29',
      items: [],
    })
    expect(serverAuthFetch).toHaveBeenCalledWith(
      '/api/habits?dateFrom=2026-08-29&dateTo=2026-08-29&includeOverdue=true',
      { cache: 'no-store' },
      expect.anything(),
    )
  })

  it('preloads a selected past day without overdue habits', async () => {
    serverAuthFetch.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 50,
      totalCount: 0,
      totalPages: 1,
    })

    await loadTodayInitialHabits('2026-08-20')

    expect(serverAuthFetch).toHaveBeenCalledWith(
      '/api/habits?dateFrom=2026-08-20&dateTo=2026-08-20',
      { cache: 'no-store' },
      expect.anything(),
    )
  })

  it('leaves the client query in charge when the preload fails', async () => {
    serverAuthFetch.mockRejectedValue(new Error('unavailable'))

    await expect(loadTodayInitialHabits(undefined)).resolves.toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { API } from '@orbit/shared/api'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'

const mocks = vi.hoisted(() => ({ serverAuthFetch: vi.fn() }))

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-account-id': 'account-a' }) }))
vi.mock('@/lib/server-fetch', () => ({ serverAuthFetch: mocks.serverAuthFetch }))
vi.mock('@/app/(app)/today-page-client', () => ({
  TodayPageClient: ({ initialToday, initialHabits, initialProfile, serverAccountId }: {
    initialToday: string
    initialHabits: { items: unknown[] } | null
    initialProfile: { name: string } | null
    serverAccountId: string | null
  }) => (
    <div data-testid="today-server-result">
      {`${initialToday}:${initialHabits?.items.length ?? 'missing'}:${initialProfile?.name ?? 'missing'}:${serverAccountId ?? 'missing'}`}
    </div>
  ),
}))

const { default: TodayPage } = await import('@/app/(app)/page')

describe('Today server page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    mocks.serverAuthFetch.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it('passes the selected day, habits, and account profile into the rendered client page', async () => {
    mocks.serverAuthFetch.mockImplementation(async (url: string) =>
      url === API.profile.get
        ? profileFixture
        : { items: [], page: 1, pageSize: 50, totalCount: 0, totalPages: 1 })

    const page = await TodayPage({ searchParams: Promise.resolve({ date: ['2026-08-20', '2026-08-21'] }) })

    expect(renderToString(page)).toContain(`2026-08-29:0:${profileFixture.name}:account-a`)
    expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
      '/api/habits?dateFrom=2026-08-20&dateTo=2026-08-20',
      { cache: 'no-store' },
      expect.anything(),
    )
    expect(mocks.serverAuthFetch).toHaveBeenCalledWith(API.profile.get, { cache: 'no-store' }, expect.anything())
  })

  it('keeps the habits preload when the profile request fails', async () => {
    mocks.serverAuthFetch.mockImplementation(async (url: string) => {
      if (url === API.profile.get) throw new Error('Profile unavailable')
      return { items: [], page: 1, pageSize: 50, totalCount: 0, totalPages: 1 }
    })

    const page = await TodayPage({ searchParams: Promise.resolve({}) })

    expect(renderToString(page)).toContain('2026-08-29:0:missing:account-a')
  })
})

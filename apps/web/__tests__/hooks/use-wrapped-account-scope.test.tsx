import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { useWrapped } from '@/hooks/use-wrapped'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const LEGACY_KEY = 'orbit_wrapped_year_seen'

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), reportEvent: vi.fn() }))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.useQuery,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useReportEvent: () => ({ mutate: mocks.reportEvent }),
}))

function renderYearWrapped() {
  return renderHook(() => useWrapped('year', { active: true }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  localStorage.clear()
  mocks.useQuery.mockReturnValue({
    data: createMockRecap({
      goalCompletions: 3,
      metrics: createMockRetrospectiveMetrics({ totalCompletions: 20, activeDays: 12 }),
    }),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  mocks.useQuery.mockReset()
  mocks.reportEvent.mockReset()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('reports the Wrapped achievement for the next account on a browser the previous one used', async () => {
  const { unmount } = renderYearWrapped()
  expect(mocks.reportEvent).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(buildAccountScopedStorageKey(LEGACY_KEY, 'user-1'))).toBe('1')
  unmount()

  await replaceAccountWith('user-2')
  renderYearWrapped()

  expect(mocks.reportEvent).toHaveBeenCalledTimes(2)
  expect(localStorage.getItem(buildAccountScopedStorageKey(LEGACY_KEY, 'user-2'))).toBe('1')
})

it('reports it once per account, not once per visit', () => {
  const first = renderYearWrapped()
  first.unmount()
  renderYearWrapped()

  expect(mocks.reportEvent).toHaveBeenCalledTimes(1)
})

it('gives the pre-rename flag to the account signed in now and then consumes it', () => {
  localStorage.setItem(LEGACY_KEY, '1')

  renderYearWrapped()

  expect(mocks.reportEvent).not.toHaveBeenCalled()
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  expect(localStorage.getItem(buildAccountScopedStorageKey(LEGACY_KEY, 'user-1'))).toBe('1')
})

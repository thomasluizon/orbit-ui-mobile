import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __setOrbitWidgetModuleForTests,
  syncWidgetData,
} from '@/lib/orbit-widget'

const mocks = vi.hoisted(() => ({
  apiClientWithAuthorizingToken: vi.fn(),
  getToken: vi.fn(),
  refreshPersistentReminder: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClientWithAuthorizingToken: mocks.apiClientWithAuthorizingToken,
}))
vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/lib/persistent-reminder', () => ({
  refreshPersistentReminder: mocks.refreshPersistentReminder,
}))

function tokenFor(accountId: string): string {
  const payload = btoa(JSON.stringify({ sub: accountId, email: `${accountId}@example.com` }))
  return `header.${payload}.signature`
}

describe('syncWidgetData account ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __setOrbitWidgetModuleForTests({
      saveToken: vi.fn(),
      clearToken: vi.fn(),
      syncTheme: vi.fn(),
      syncWidgetData: vi.fn(),
    })
  })

  it('does not refresh the reminder after the signed-in account changes', async () => {
    const authorizingToken = tokenFor('first-account')
    mocks.getToken
      .mockResolvedValueOnce(authorizingToken)
      .mockResolvedValueOnce(tokenFor('second-account'))
    mocks.apiClientWithAuthorizingToken.mockResolvedValue({
      data: { currentStreak: 8, items: [] },
      authorizingToken,
    })

    await syncWidgetData()

    expect(mocks.refreshPersistentReminder).toHaveBeenCalledWith(
      { currentStreak: 8, items: [] },
      authorizingToken,
    )
  })
})

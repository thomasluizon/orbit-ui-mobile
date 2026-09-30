import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __setOrbitWidgetModuleForTests,
  syncWidgetData,
} from '@/lib/orbit-widget'
import type { OrbitWidgetModuleType } from '../../modules/orbit-widget/src/OrbitWidget.types'

const mocks = vi.hoisted(() => ({
  apiClientWithAuthorizingToken: vi.fn(),
  getToken: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClientWithAuthorizingToken: mocks.apiClientWithAuthorizingToken,
}))
vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))

function tokenFor(accountId: string): string {
  const payload = btoa(JSON.stringify({ sub: accountId, email: `${accountId}@example.com` }))
  return `header.${payload}.signature`
}

describe('syncWidgetData account ownership', () => {
  let widgetModule: OrbitWidgetModuleType

  beforeEach(() => {
    vi.clearAllMocks()
    widgetModule = {
      saveToken: vi.fn(),
      clearToken: vi.fn(),
      syncTheme: vi.fn(),
      syncWidgetData: vi.fn(),
    }
    __setOrbitWidgetModuleForTests(widgetModule)
  })

  it('labels the widget payload with the token that authorised its fetch', async () => {
    const authorizingToken = tokenFor('first-account')
    mocks.getToken.mockResolvedValue(authorizingToken)
    mocks.apiClientWithAuthorizingToken.mockResolvedValue({
      data: { currentStreak: 8, items: [] },
      authorizingToken,
    })

    await syncWidgetData()

    expect(widgetModule.syncWidgetData).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ currentStreak: 8, items: [] }),
      authorizingToken,
    )
  })

  it('sends nothing to the widget when the payload has no authorising account', async () => {
    mocks.getToken.mockResolvedValue(tokenFor('first-account'))
    mocks.apiClientWithAuthorizingToken.mockResolvedValue({
      data: { currentStreak: 8, items: [] },
      authorizingToken: null,
    })

    await syncWidgetData()

    expect(widgetModule.syncWidgetData).not.toHaveBeenCalled()
  })

  it('fetches nothing while signed out', async () => {
    mocks.getToken.mockResolvedValue(null)

    await syncWidgetData()

    expect(mocks.apiClientWithAuthorizingToken).not.toHaveBeenCalled()
    expect(widgetModule.syncWidgetData).not.toHaveBeenCalled()
  })
})

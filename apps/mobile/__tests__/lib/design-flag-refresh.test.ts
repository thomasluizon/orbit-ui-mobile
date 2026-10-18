import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfigResponse } from '@orbit/shared/__tests__/factories'
import { configCache } from '@/lib/config-cache'
import { refreshDesignFlag, subscribeToDesignFlag } from '@/lib/design-flag-refresh'

const mocks = vi.hoisted(() => ({ request: vi.fn(), remember: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.request }))
vi.mock('@/lib/design-bundle', () => ({ rememberAccountDesign: mocks.remember }))

let unsubscribe: () => void

beforeEach(() => {
  vi.clearAllMocks()
  mocks.remember.mockResolvedValue(undefined)
  configCache.setAccount(null)
  configCache.setAccount('account-a')
  unsubscribe = subscribeToDesignFlag()
})
afterEach(() => {
  unsubscribe()
  configCache.setAccount(null)
})

describe('design flag refresh through the account config producer', () => {
  it.each([true, false])('persists the resolved %s flag for the current account', async enabled => {
    mocks.request.mockResolvedValue(createMockConfigResponse({ redesign: { enabled, planRequirement: null } }))
    await refreshDesignFlag()
    expect(mocks.remember).toHaveBeenLastCalledWith('account-a', enabled)
  })

  it('ignores a response that arrives after sign-out', async () => {
    let finish!: (response: unknown) => void
    mocks.request.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const refresh = refreshDesignFlag()
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
    configCache.setAccount(null)
    finish(createMockConfigResponse({ redesign: { enabled: true, planRequirement: null } }))
    await refresh
    expect(mocks.remember).not.toHaveBeenCalled()
  })

  it('does not assign an old account response to a newly signed-in account', async () => {
    let finish!: (response: unknown) => void
    mocks.request.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const refresh = refreshDesignFlag()
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
    configCache.setAccount('account-b')
    finish(createMockConfigResponse({ redesign: { enabled: true, planRequirement: null } }))
    await refresh
    expect(mocks.remember).not.toHaveBeenCalled()
    mocks.request.mockResolvedValue(createMockConfigResponse({ redesign: { enabled: false, planRequirement: null } }))
    await refreshDesignFlag()
    expect(mocks.remember).toHaveBeenLastCalledWith('account-b', false)
  })

  it('keeps the last saved choice on a failed refresh and skips signed-out requests', async () => {
    mocks.request.mockRejectedValue(new Error('offline'))
    await refreshDesignFlag()
    expect(mocks.remember).not.toHaveBeenCalled()
    configCache.setAccount(null)
    await refreshDesignFlag()
    expect(mocks.request).toHaveBeenCalledOnce()
  })
})

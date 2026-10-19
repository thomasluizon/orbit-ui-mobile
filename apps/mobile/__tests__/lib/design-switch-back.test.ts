import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { createMockConfigResponse } from '@orbit/shared/__tests__/factories'
import { launchAccountDesign, rememberAccountDesign } from '@/lib/design-bundle'
import { BUNDLE_DESIGN } from '@/lib/design-bundle-identity'
import { refreshDesignFlag, subscribeToDesignFlag } from '@/lib/design-flag-refresh'
import { configCache } from '@/lib/config-cache'

const updates = vi.hoisted(() => ({
  claimed: false,
  fetch: vi.fn(),
  reload: vi.fn(),
  headers: vi.fn(),
  request: vi.fn(),
}))

vi.mock('expo-updates', () => ({
  isEnabled: true,
  setUpdateRequestHeadersOverride: updates.headers,
  fetchUpdateAsync: updates.fetch,
  reloadAsync: updates.reload,
}))
vi.mock('../../modules/orbit-design-bundle', () => ({
  claimDesignBundleLaunch: () => {
    if (updates.claimed) return false
    updates.claimed = true
    return true
  },
}))
vi.mock('@/lib/api-client', () => ({ apiClient: updates.request }))

let unsubscribe: () => void
beforeEach(async () => {
  vi.clearAllMocks()
  updates.claimed = false
  updates.fetch.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false, manifest: {} })
  updates.reload.mockResolvedValue(undefined)
  configCache.setAccount(null)
  configCache.setAccount('a')
  await rememberAccountDesign('a', true)
  unsubscribe = subscribeToDesignFlag()
})
afterEach(() => {
  unsubscribe()
  configCache.setAccount(null)
})

describe('redesign bundle switch-back', () => {
  it('declares the redesign identity and stays on it with the saved flag on', async () => {
    expect(BUNDLE_DESIGN).toBe('redesign')
    expect(await launchAccountDesign('a')).toBe(false)
    expect(updates.fetch).not.toHaveBeenCalled()
    expect(updates.reload).not.toHaveBeenCalled()
  })

  it.each(['flag off', 'signed out', 'missing flag'])('selects legacy once when %s', async scenario => {
    await rememberAccountDesign('a', false)
    const account = scenario === 'signed out' ? null : scenario === 'missing flag' ? 'unknown' : 'a'
    expect(await launchAccountDesign(account)).toBe(true)
    expect(await launchAccountDesign(account)).toBe(false)
    expect(updates.headers).toHaveBeenCalledExactlyOnceWith({
      'expo-channel-name': 'legacy', 'orbit-design-launch': 'selected',
    })
    expect(updates.fetch).toHaveBeenCalledOnce()
    expect(updates.reload).toHaveBeenCalledOnce()
  })

  it.each(['offline', 'fetch failure'])('keeps the running redesign on %s', async failure => {
    await rememberAccountDesign('a', false)
    updates.fetch.mockRejectedValue(new Error(failure))
    expect(await launchAccountDesign('a')).toBe(false)
    expect(await launchAccountDesign('a')).toBe(false)
    expect(updates.fetch).toHaveBeenCalledOnce()
    expect(updates.reload).not.toHaveBeenCalled()
  })

  it('stores a refreshed off flag under the legacy bundle key and applies it next launch', async () => {
    expect(await SecureStore.getItemAsync('design_bundle_000061')).toBe('redesign')
    expect(await launchAccountDesign('a')).toBe(false)
    updates.request.mockResolvedValue(createMockConfigResponse({ redesign: { enabled: false, planRequirement: null } }))
    await refreshDesignFlag()
    await vi.waitFor(async () => {
      expect(await SecureStore.getItemAsync('design_bundle_000061')).toBe('legacy')
    })
    expect(await launchAccountDesign('a')).toBe(false)
    updates.claimed = false
    expect(await launchAccountDesign('a')).toBe(true)
    expect(updates.reload).toHaveBeenCalledOnce()
  })

  it('keeps the saved flag after a failed config refresh', async () => {
    updates.request.mockRejectedValue(new Error('offline'))
    await refreshDesignFlag()
    expect(await SecureStore.getItemAsync('design_bundle_000061')).toBe('redesign')
    expect(await launchAccountDesign('a')).toBe(false)
    expect(updates.reload).not.toHaveBeenCalled()
  })
})

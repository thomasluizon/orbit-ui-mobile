import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureError } from '@/lib/sentry'
import { launchAccountDesign, rememberAccountDesign } from '@/lib/design-bundle'

const updates = vi.hoisted(() => ({
  enabled: true,
  design: 'legacy',
  claimed: false,
  fetch: vi.fn(),
  reload: vi.fn(),
  headers: vi.fn(),
}))

vi.mock('expo-updates', () => ({
  get isEnabled() { return updates.enabled },
  setUpdateRequestHeadersOverride: updates.headers,
  fetchUpdateAsync: updates.fetch,
  reloadAsync: updates.reload,
}))
vi.mock('@/lib/design-bundle-identity', () => ({ get BUNDLE_DESIGN() { return updates.design } }))
vi.mock('../../modules/orbit-design-bundle', () => ({
  claimDesignBundleLaunch: () => {
    if (updates.claimed) return false
    updates.claimed = true
    return true
  },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

beforeEach(async () => {
  vi.clearAllMocks()
  updates.enabled = true
  updates.design = 'legacy'
  updates.claimed = false
  updates.fetch.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false, manifest: {} })
  updates.reload.mockResolvedValue(undefined)
  await rememberAccountDesign('account-a', false)
  await rememberAccountDesign('account-b', false)
})

describe('account design at launch', () => {
  it('fetches the redesign channel and reloads once when the saved flag is on', async () => {
    await rememberAccountDesign('account-a', true)
    expect(await launchAccountDesign('account-a')).toBe(true)
    expect(updates.headers).toHaveBeenCalledWith({ 'expo-channel-name': 'redesign', 'orbit-design-launch': 'selected' })
    expect(updates.fetch).toHaveBeenCalledOnce()
    expect(updates.reload).toHaveBeenCalledOnce()
  })

  it('keeps the embedded legacy bundle when the flag is off', async () => {
    expect(await launchAccountDesign('account-a')).toBe(false)
    expect(updates.fetch).not.toHaveBeenCalled()
    expect(updates.reload).not.toHaveBeenCalled()
  })

  it('fetches legacy when the redesign bundle starts with the flag off', async () => {
    updates.design = 'redesign'
    expect(await launchAccountDesign('account-a')).toBe(true)
    expect(updates.headers).toHaveBeenCalledWith({ 'expo-channel-name': 'legacy', 'orbit-design-launch': 'selected' })
    expect(updates.reload).toHaveBeenCalledOnce()
  })

  it.each(['offline', 'fetch failure'])('keeps the embedded bundle on %s', async message => {
    await rememberAccountDesign('account-a', true)
    const failure = new Error(message)
    updates.fetch.mockRejectedValue(failure)
    expect(await launchAccountDesign('account-a')).toBe(false)
    expect(updates.reload).not.toHaveBeenCalled()
    expect(captureError).toHaveBeenCalledWith(failure)
  })

  it('does not reload when the channel has no compatible update', async () => {
    await rememberAccountDesign('account-a', true)
    updates.fetch.mockResolvedValue({ isNew: false, isRollBackToEmbedded: false })
    expect(await launchAccountDesign('account-a')).toBe(false)
    expect(updates.reload).not.toHaveBeenCalled()
  })

  it('returns to legacy on the next signed-out launch', async () => {
    await rememberAccountDesign('account-a', true)
    expect(await launchAccountDesign(null)).toBe(false)
    expect(updates.headers).not.toHaveBeenCalled()
    expect(updates.reload).not.toHaveBeenCalled()
  })

  it('never borrows another account flag', async () => {
    await rememberAccountDesign('account-a', true)
    expect(await launchAccountDesign('account-b')).toBe(false)
    expect(updates.fetch).not.toHaveBeenCalled()
  })

  it('does not loop across JavaScript reloads in the same native process', async () => {
    await rememberAccountDesign('account-a', true)
    await launchAccountDesign('account-a')
    vi.resetModules()
    const reloaded = await import('@/lib/design-bundle')
    expect(await reloaded.launchAccountDesign('account-a')).toBe(false)
    expect(updates.fetch).toHaveBeenCalledOnce()
    expect(updates.reload).toHaveBeenCalledOnce()
  })

  it('applies a refreshed flag only on a later cold launch', async () => {
    await launchAccountDesign('account-a')
    await rememberAccountDesign('account-a', true)
    expect(await launchAccountDesign('account-a')).toBe(false)
    updates.claimed = false
    expect(await launchAccountDesign('account-a')).toBe(true)
    expect(updates.reload).toHaveBeenCalledOnce()
  })

  it('leaves development builds on their own bundle', async () => {
    updates.enabled = false
    await rememberAccountDesign('account-a', true)
    expect(await launchAccountDesign('account-a')).toBe(false)
    expect(updates.fetch).not.toHaveBeenCalled()
  })
})

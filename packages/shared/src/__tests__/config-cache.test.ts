import { describe, expect, it, vi } from 'vitest'
import { createConfigCache } from '../query/config-cache'
import { resolveFlag } from '../utils/config'
import { createMockConfigResponse } from './factories'

const enabledResponse = () => createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } })
function createStorage() {
  let stored: string | null = null
  return {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: string) => { stored = value }),
    clear: vi.fn(async () => { stored = null }),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

describe('account config cache', () => {
  it('restores a last good value across process instances and retains it after failure', async () => {
    const storage = createStorage()
    const original = createConfigCache(vi.fn(), storage)
    original.setAccount('account-a')
    await original.fetch(original.getSnapshot(), async () => enabledResponse())
    const restored = createConfigCache(vi.fn(), storage)
    restored.setAccount('account-a')
    await expect(restored.fetch(restored.getSnapshot(), async () => { throw new Error('offline') })).rejects.toThrow('offline')
    expect(resolveFlag(restored.getSnapshot().config, 'analytics')).toBe(true)
  })

  it('cannot restore the old account when a switch returns to it', async () => {
    const storage = createStorage()
    const cache = createConfigCache(vi.fn(), storage)
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => enabledResponse())
    cache.setAccount('account-b')
    cache.setAccount('account-a')
    await expect(cache.fetch(cache.getSnapshot(), async () => { throw new Error('offline') })).rejects.toThrow('offline')
    expect(resolveFlag(cache.getSnapshot().config, 'analytics')).toBe(false)
    await expect(storage.read()).resolves.toBeNull()
  })

  it('discards a response from an earlier session of the same account', async () => {
    const response = deferred<unknown>()
    const cache = createConfigCache(vi.fn())
    cache.setAccount('account-a')
    const oldFetch = cache.fetch(cache.getSnapshot(), () => response.promise)
    await Promise.resolve()
    cache.setAccount(null)
    cache.setAccount('account-a')
    response.resolve(enabledResponse())
    await oldFetch
    expect(cache.getSnapshot().config).toBeUndefined()
  })

  it.each(['abort', 'supersede'])('keeps the latest config when an older response completes after %s', async (invalidation) => {
    const storage = createStorage()
    const cache = createConfigCache(vi.fn(), storage)
    const disabled = createMockConfigResponse({ analytics: { enabled: false, planRequirement: null } })
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => disabled)
    const olderResponse = deferred<unknown>()
    const controller = new AbortController()
    const olderFetch = cache.fetch(cache.getSnapshot(), () => olderResponse.promise, controller.signal)
    await Promise.resolve()
    if (invalidation === 'abort') controller.abort()
    else await cache.fetch(cache.getSnapshot(), async () => disabled)

    olderResponse.resolve(enabledResponse())
    await olderFetch

    expect(resolveFlag(cache.getSnapshot().config, 'analytics')).toBe(false)
    await expect(storage.read()).resolves.toBe(JSON.stringify({ accountId: 'account-a', config: cache.getSnapshot().config }))
  })

  it.each(['abort', 'supersede'])('rechecks ownership before a queued save after %s', async (invalidation) => {
    const storage = createStorage()
    const pendingSave = deferred<void>()
    const cache = createConfigCache(vi.fn(), {
      ...storage,
      write: async (value) => { await pendingSave.promise; await storage.write(value) },
    })
    const disabled = createMockConfigResponse({ analytics: { enabled: false, planRequirement: null } })
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => disabled)
    const lastGood = JSON.stringify({ accountId: 'account-a', config: cache.getSnapshot().config })
    const controller = new AbortController()
    await cache.fetch(cache.getSnapshot(), async () => enabledResponse(), controller.signal)
    const newerResponse = deferred<unknown>()
    const newerFetch = invalidation === 'supersede'
      ? cache.fetch(cache.getSnapshot(), () => newerResponse.promise)
      : Promise.resolve()
    if (invalidation === 'abort') controller.abort()

    pendingSave.resolve()
    await vi.waitFor(async () => {
      await expect(storage.read()).resolves.toBe(lastGood)
      expect(storage.write).toHaveBeenCalledTimes(1)
    })
    newerResponse.resolve(disabled)
    await newerFetch
    await vi.waitFor(async () => {
      await expect(storage.read()).resolves.toBe(lastGood)
      expect(storage.write).toHaveBeenCalledTimes(invalidation === 'supersede' ? 2 : 1)
    })
  })

  it('does not publish a persisted read that completes after switching accounts', async () => {
    const read = deferred<string | null>()
    const storage = createStorage()
    storage.read.mockReturnValueOnce(read.promise)
    const cache = createConfigCache(vi.fn(), storage)
    cache.setAccount('account-a')
    const request = vi.fn(async () => enabledResponse())
    const oldFetch = cache.fetch(cache.getSnapshot(), request)
    await Promise.resolve()
    cache.setAccount('account-b')
    read.resolve(JSON.stringify({ accountId: 'account-a', config: enabledResponse() }))
    await oldFetch
    expect(cache.getSnapshot().config).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('serializes a pending save before sign-out deletion', async () => {
    const save = deferred<void>()
    const storage = createStorage()
    storage.write.mockImplementationOnce(() => save.promise)
    const cache = createConfigCache(vi.fn(), storage)
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => enabledResponse())
    cache.setAccount(null)
    save.resolve()
    await vi.waitFor(() => expect(storage.clear).toHaveBeenCalled())
    await expect(storage.read()).resolves.toBeNull()
    expect(cache.getSnapshot().config).toBeUndefined()
  })

  it('reports corrupt persisted config and still fetches valid config', async () => {
    const storage = createStorage()
    await storage.write('{invalid')
    const report = vi.fn()
    const cache = createConfigCache(report, storage)
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => enabledResponse())
    expect(resolveFlag(cache.getSnapshot().config, 'analytics')).toBe(true)
    expect(report).toHaveBeenCalled()
  })

  it('keeps a fetched value in memory even if persistence fails', async () => {
    const storage = createStorage()
    storage.write.mockRejectedValueOnce(new Error('storage unavailable'))
    const report = vi.fn()
    const cache = createConfigCache(report, storage)
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => enabledResponse())
    await vi.waitFor(() => expect(report).toHaveBeenCalled())
    expect(resolveFlag(cache.getSnapshot().config, 'analytics')).toBe(true)
  })

  it('fetches valid config even when both persistent reads and deletion fail', async () => {
    const storage = createStorage()
    storage.read.mockRejectedValue(new Error('storage unavailable'))
    storage.clear.mockRejectedValue(new Error('storage unavailable'))
    const report = vi.fn()
    const cache = createConfigCache(report, storage)
    cache.setAccount('account-a')
    await cache.fetch(cache.getSnapshot(), async () => enabledResponse())
    expect(resolveFlag(cache.getSnapshot().config, 'analytics')).toBe(true)
    expect(report).toHaveBeenCalled()
  })

})

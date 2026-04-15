import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAppStoreLookup, isVersionOutdated } from '@/lib/version-check'

describe('isVersionOutdated', () => {
  it('returns true when current is strictly older than latest', () => {
    expect(isVersionOutdated('1.0.0', '1.0.1')).toBe(true)
    expect(isVersionOutdated('1.0.0', '1.1.0')).toBe(true)
    expect(isVersionOutdated('1.9.9', '2.0.0')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isVersionOutdated('1.2.0', '1.2.0')).toBe(false)
    expect(isVersionOutdated('3.4.5', '3.4.5')).toBe(false)
  })

  it('returns false when current is newer than latest', () => {
    expect(isVersionOutdated('2.0.0', '1.9.9')).toBe(false)
    expect(isVersionOutdated('1.1.0', '1.0.9')).toBe(false)
  })

  it('pads shorter versions with zeros', () => {
    expect(isVersionOutdated('1.0', '1.0.1')).toBe(true)
    expect(isVersionOutdated('1.0.0', '1.0')).toBe(false)
    expect(isVersionOutdated('1', '1.0.0')).toBe(false)
  })

  it('ignores non-numeric suffix segments', () => {
    expect(isVersionOutdated('1.0.0-beta', '1.0.0')).toBe(false)
    expect(isVersionOutdated('1.0.0', '1.0.0-rc1')).toBe(false)
    expect(isVersionOutdated('1.0.0-beta', '1.0.1')).toBe(true)
  })

  it('handles empty or malformed versions defensively', () => {
    expect(isVersionOutdated('', '1.0.0')).toBe(true)
    expect(isVersionOutdated('1.0.0', '')).toBe(false)
  })
})

describe('getAppStoreLookup', () => {
  const fetchMock = vi.fn()
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    fetchMock.mockReset()
  })

  it('returns version and trackViewUrl from the iTunes response', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resultCount: 1,
          results: [{ version: '1.1.9', trackViewUrl: 'https://apps.apple.com/app/id12345' }],
        }),
    })

    const result = await getAppStoreLookup('org.useorbit.app')
    expect(result).toEqual({
      version: '1.1.9',
      storeUrl: 'https://apps.apple.com/app/id12345',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns null when no results are returned', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resultCount: 0, results: [] }),
    })
    expect(await getAppStoreLookup('org.useorbit.app')).toBeNull()
  })

  it('returns null when the response is not ok', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve(null) })
    expect(await getAppStoreLookup('org.useorbit.app')).toBeNull()
  })

  it('returns null when fetch rejects', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await getAppStoreLookup('org.useorbit.app')).toBeNull()
  })

  it('tolerates a missing trackViewUrl by returning null storeUrl', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resultCount: 1, results: [{ version: '1.0.0' }] }),
    })
    expect(await getAppStoreLookup('org.useorbit.app')).toEqual({
      version: '1.0.0',
      storeUrl: null,
    })
  })
})

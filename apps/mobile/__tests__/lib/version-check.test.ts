import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractVersionFromHtml,
  getPlayStoreVersion,
  isVersionOutdated,
} from '@/lib/version-check'

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

describe('extractVersionFromHtml', () => {
  it('parses softwareVersion JSON field', () => {
    const html = '<html>{"softwareVersion":"2.3.4"}</html>'
    expect(extractVersionFromHtml(html)).toBe('2.3.4')
  })

  it('falls back to Current Version label', () => {
    const html = '<div>Current Version</div><div>1.5.2</div>'
    expect(extractVersionFromHtml(html)).toBe('1.5.2')
  })

  it('returns null when no version can be parsed', () => {
    expect(extractVersionFromHtml('<html>nothing here</html>')).toBeNull()
  })
})

describe('getPlayStoreVersion', () => {
  const fetchMock = vi.fn()
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    fetchMock.mockReset()
  })

  it('returns the parsed version when the fetch succeeds', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"softwareVersion":"1.2.3"}'),
    })

    const result = await getPlayStoreVersion('org.useorbit.app')
    expect(result).toBe('1.2.3')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns null when the response is not ok', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({ ok: false, text: () => Promise.resolve('') })
    expect(await getPlayStoreVersion('org.useorbit.app')).toBeNull()
  })

  it('returns null when fetch rejects', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await getPlayStoreVersion('org.useorbit.app')).toBeNull()
  })
})

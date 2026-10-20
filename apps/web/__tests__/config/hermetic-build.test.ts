import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => {
  const spawnSync = vi.fn(() => ({ status: 0 }))
  return { spawnSync, default: { spawnSync } }
})

describe('hermetic build origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it.each([
    [undefined, 'http://127.0.0.1:3000'],
    ['3100', 'http://127.0.0.1:3100'],
  ])('builds with the layout origin when LAYOUT_PORT=%s', async (port, expectedOrigin) => {
    vi.resetModules()
    vi.stubEnv('LAYOUT_PORT', port)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://deployment.example.com')

    await import('../../scripts/build-hermetic.mjs')

    const build = vi.mocked(spawnSync).mock.calls.find(([, argumentsList]) => argumentsList?.includes('build'))
    expect(build?.[2]?.env?.NEXT_PUBLIC_SITE_URL).toBe(expectedOrigin)
  })
})

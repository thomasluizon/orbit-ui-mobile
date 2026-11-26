import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('skips the TypeScript pass of next build, which the Checks job runs', async () => {
    vi.resetModules()

    await import('../../scripts/build-hermetic.mjs')

    const build = vi.mocked(spawnSync).mock.calls.find(([, argumentsList]) => argumentsList?.includes('build'))
    expect(build?.[2]?.env?.ORBIT_HERMETIC_BUILD).toBe('1')
  })

  it('generates the Next route types before tsc, because the hermetic build skips the validator that uses them', () => {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'))

    expect(manifest.scripts['type-check']).toBe('next typegen && tsc --noEmit')
  })
})

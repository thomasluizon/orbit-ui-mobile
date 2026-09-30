import { afterEach, describe, expect, it, vi } from 'vitest'

import { getAppVersion } from '@/lib/app-version'

describe('getAppVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the short commit of the served build', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '3f9c2ab5d1e04b7a9c1f2e3d4c5b6a7980f1e2d3')

    expect(getAppVersion()).toBe('3f9c2ab')
  })

  it('returns null when the build carries an empty commit', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '')

    expect(getAppVersion()).toBeNull()
  })

  it('returns null when the build carries no commit', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', undefined)

    expect(getAppVersion()).toBeNull()
  })
})

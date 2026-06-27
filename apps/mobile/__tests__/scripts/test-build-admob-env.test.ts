import { describe, expect, it } from 'vitest'

const { resolveTestBuildAdMobEnv } = require('../../scripts/test-build-admob-env.js') as {
  resolveTestBuildAdMobEnv: (
    baseEnv: Record<string, string | undefined>,
  ) => Record<string, string | undefined>
}

describe('resolveTestBuildAdMobEnv', () => {
  it('forces Google test ad units for local builds', () => {
    const resolved = resolveTestBuildAdMobEnv({ EXPO_PUBLIC_ADMOB_USE_TEST_IDS: 'false' })
    expect(resolved.EXPO_PUBLIC_ADMOB_USE_TEST_IDS).toBe('true')
  })

  it('does not throw when production AdMob IDs are absent', () => {
    expect(() => resolveTestBuildAdMobEnv({})).not.toThrow()
  })

  it('does not force the production EAS build profile', () => {
    const resolved = resolveTestBuildAdMobEnv({})
    expect(resolved.EAS_BUILD_PROFILE).toBeUndefined()
  })
})

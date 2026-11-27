import { describe, expect, it } from 'vitest'
import { isSentryBuildSilent } from '../next.config'

describe('isSentryBuildSilent', () => {
  it('stays silent in a local build with no CI variable and no token', () => {
    expect(isSentryBuildSilent({})).toBe(true)
    expect(isSentryBuildSilent({ SENTRY_AUTH_TOKEN: '' })).toBe(true)
  })

  it('logs the source map upload in a build that has the token', () => {
    expect(isSentryBuildSilent({ SENTRY_AUTH_TOKEN: 'token' })).toBe(false)
  })

  it('logs in a CI build', () => {
    expect(isSentryBuildSilent({ CI: 'true' })).toBe(false)
  })
})

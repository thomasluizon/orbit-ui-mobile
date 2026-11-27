import { describe, expect, it } from 'vitest'
import { isSentryBuildSilent } from '../next.config'

describe('isSentryBuildSilent', () => {
  it('stays silent in a local build with no CI variable, no token and no release SHA', () => {
    expect(isSentryBuildSilent({})).toBe(true)
    expect(isSentryBuildSilent({ SENTRY_AUTH_TOKEN: '', NEXT_PUBLIC_WEB_COMMIT_SHA: '' })).toBe(true)
  })

  it('logs the source map upload in a build that has the token', () => {
    expect(isSentryBuildSilent({ SENTRY_AUTH_TOKEN: 'token' })).toBe(false)
  })

  it('logs the missing token in a release build that has no token', () => {
    expect(isSentryBuildSilent({ NEXT_PUBLIC_WEB_COMMIT_SHA: 'c026c4f5a26a0fde48a22fc90804306bca3a66fa' })).toBe(false)
  })

  it('logs in a CI build', () => {
    expect(isSentryBuildSilent({ CI: 'true' })).toBe(false)
  })
})

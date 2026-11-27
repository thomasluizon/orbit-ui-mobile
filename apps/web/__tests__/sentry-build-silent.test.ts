import { describe, expect, it, vi } from 'vitest'
import { handleSentryBuildError, isSentryBuildSilent } from '../next.config'

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

describe('handleSentryBuildError', () => {
  it('throws the upload error when the build has a token', () => {
    const error = new Error('SSL peer certificate or SSH remote key was not OK')
    expect(() => handleSentryBuildError({ SENTRY_AUTH_TOKEN: 'token' }, error)).toThrow(error)
  })

  it('logs the error and lets the build pass when it has no token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('no token')
    expect(() => handleSentryBuildError({}, error)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(error)
    warn.mockRestore()
  })
})

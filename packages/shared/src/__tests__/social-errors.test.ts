import { describe, expect, it } from 'vitest'
import { createApiClientError, getSocialErrorKey } from '../utils'

describe('getSocialErrorKey', () => {
  it('maps a 429 rate limit to the social rate-limited key', () => {
    expect(getSocialErrorKey(createApiClientError(429, null, 'rate'))).toBe(
      'social.errors.rateLimited',
    )
  })

  it('maps the common add-friend rejection codes to specific keys', () => {
    expect(
      getSocialErrorKey(createApiClientError(409, { errorCode: 'ALREADY_FRIENDS' }, 'x')),
    ).toBe('social.errors.alreadyFriends')
    expect(getSocialErrorKey(createApiClientError(409, { errorCode: 'HANDLE_TAKEN' }, 'x'))).toBe(
      'social.errors.handleTaken',
    )
    expect(
      getSocialErrorKey(createApiClientError(400, { errorCode: 'FRIEND_LIMIT_REACHED' }, 'x')),
    ).toBe('social.errors.friendLimitReached')
    expect(getSocialErrorKey(createApiClientError(404, { errorCode: 'USER_NOT_FOUND' }, 'x'))).toBe(
      'social.errors.userNotFound',
    )
  })

  it('falls back to the generic key for unknown failures', () => {
    expect(getSocialErrorKey(new Error('boom'))).toBe('social.errors.generic')
    expect(getSocialErrorKey(createApiClientError(500, null, 'x'))).toBe('social.errors.generic')
  })
})

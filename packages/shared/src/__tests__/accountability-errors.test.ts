import { describe, expect, it } from 'vitest'
import { createApiClientError, getAccountabilityErrorKey } from '../utils'

describe('getAccountabilityErrorKey', () => {
  it('maps a 429 rate limit to the buddies rate-limited key', () => {
    expect(getAccountabilityErrorKey(createApiClientError(429, null, 'rate'))).toBe(
      'social.buddies.errors.rateLimited',
    )
  })

  it('maps the pairing and check-in rejection codes to specific keys', () => {
    expect(
      getAccountabilityErrorKey(createApiClientError(403, { errorCode: 'NOT_FRIENDS' }, 'x')),
    ).toBe('social.buddies.errors.notFriends')
    expect(
      getAccountabilityErrorKey(createApiClientError(409, { errorCode: 'ALREADY_PAIRED' }, 'x')),
    ).toBe('social.buddies.errors.alreadyPaired')
    expect(
      getAccountabilityErrorKey(createApiClientError(409, { errorCode: 'PAIR_LIMIT_REACHED' }, 'x')),
    ).toBe('social.buddies.errors.pairLimitReached')
    expect(
      getAccountabilityErrorKey(createApiClientError(409, { errorCode: 'ALREADY_CHECKED_IN' }, 'x')),
    ).toBe('social.buddies.errors.alreadyCheckedIn')
  })

  it('falls back to the generic key for unknown failures', () => {
    expect(getAccountabilityErrorKey(new Error('boom'))).toBe('social.buddies.errors.generic')
    expect(getAccountabilityErrorKey(createApiClientError(500, null, 'x'))).toBe(
      'social.buddies.errors.generic',
    )
  })
})

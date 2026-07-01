import { extractBackendErrorCode, extractBackendStatus } from './error-utils'

/**
 * Maps a failed accountability-buddy API call to a `social.buddies.errors.*` i18n key: a 429 rate
 * limit and the common pairing/check-in rejections get specific copy; everything else falls back to
 * a generic message. Both platforms resolve the returned key through their own translator so the
 * wording stays identical.
 */
export function getAccountabilityErrorKey(error: unknown): string {
  if (extractBackendStatus(error) === 429) return 'social.buddies.errors.rateLimited'

  switch (extractBackendErrorCode(error)) {
    case 'NOT_FRIENDS':
      return 'social.buddies.errors.notFriends'
    case 'ALREADY_PAIRED':
      return 'social.buddies.errors.alreadyPaired'
    case 'PAIR_LIMIT_REACHED':
      return 'social.buddies.errors.pairLimitReached'
    case 'ALREADY_CHECKED_IN':
      return 'social.buddies.errors.alreadyCheckedIn'
    default:
      return 'social.buddies.errors.generic'
  }
}

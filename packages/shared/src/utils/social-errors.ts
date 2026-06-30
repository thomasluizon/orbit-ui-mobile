import { extractBackendErrorCode, extractBackendStatus } from './error-utils'

/**
 * Maps a failed social API call to a `social.errors.*` i18n key: a 429 rate limit and the common
 * add-friend rejections get specific copy; everything else falls back to a generic message. Both
 * platforms resolve the returned key through their own translator so the wording stays identical.
 */
export function getSocialErrorKey(error: unknown): string {
  if (extractBackendStatus(error) === 429) return 'social.errors.rateLimited'

  switch (extractBackendErrorCode(error)) {
    case 'ALREADY_FRIENDS':
      return 'social.errors.alreadyFriends'
    case 'HANDLE_TAKEN':
      return 'social.errors.handleTaken'
    case 'FRIEND_LIMIT_REACHED':
      return 'social.errors.friendLimitReached'
    case 'USER_NOT_FOUND':
      return 'social.errors.userNotFound'
    default:
      return 'social.errors.generic'
  }
}

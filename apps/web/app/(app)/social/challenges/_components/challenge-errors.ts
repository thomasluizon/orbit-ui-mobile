import { extractBackendErrorCode, extractBackendStatus } from '@orbit/shared/utils'

/**
 * Maps a failed challenge create/join call to a `challenges.errors.*` i18n key: a 429 rate limit and
 * the common create/join rejections get specific copy; everything else falls back to a generic
 * message. Both platforms resolve the returned key through their own translator so wording matches.
 */
export function getChallengeErrorKey(error: unknown): string {
  if (extractBackendStatus(error) === 429) return 'challenges.errors.rateLimited'

  switch (extractBackendErrorCode(error)) {
    case 'CHALLENGE_FULL':
      return 'challenges.errors.challengeFull'
    case 'ALREADY_JOINED_CHALLENGE':
      return 'challenges.errors.alreadyJoined'
    case 'CHALLENGE_CLOSED':
      return 'challenges.errors.closed'
    case 'INVALID_JOIN_CODE':
      return 'challenges.errors.invalidCode'
    default:
      return 'challenges.errors.generic'
  }
}

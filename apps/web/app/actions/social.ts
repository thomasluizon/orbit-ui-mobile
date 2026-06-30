'use server'

import { API } from '@orbit/shared/api'
import type { ReportReason } from '@orbit/shared/types/social'
import { extractBackendErrorCode, extractBackendStatus } from '@orbit/shared/utils'
import { serverAuthFetch } from '@/lib/server-fetch'

/**
 * Result envelope returned by every social Server Action. Errors are caught here and reduced to a
 * serializable `{ status, code }` so the calling hook can rebuild a typed error on the client —
 * thrown errors would otherwise be redacted crossing the Server Action boundary, losing the 429
 * rate-limit signal the UI needs.
 */
export type SocialActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null }

async function runSocialAction<T>(operation: () => Promise<T>): Promise<SocialActionResult<T>> {
  try {
    return { ok: true, data: await operation() }
  } catch (error: unknown) {
    return {
      ok: false,
      status: extractBackendStatus(error) ?? 500,
      code: extractBackendErrorCode(error) ?? null,
    }
  }
}

export async function sendFriendRequest(input: {
  handle?: string
  referralCode?: string
}): Promise<SocialActionResult<{ id: string }>> {
  return runSocialAction(() =>
    serverAuthFetch(API.friends.requests, { method: 'POST', body: JSON.stringify(input) }),
  )
}

export async function acceptFriendRequest(
  friendshipId: string,
): Promise<SocialActionResult<null>> {
  return runSocialAction(() =>
    serverAuthFetch(API.friends.acceptRequest(friendshipId), { method: 'POST' }),
  )
}

export async function removeFriend(friendUserId: string): Promise<SocialActionResult<null>> {
  return runSocialAction(() =>
    serverAuthFetch(API.friends.remove(friendUserId), { method: 'DELETE' }),
  )
}

export async function sendCheer(input: {
  recipientId: string
  note?: string
}): Promise<SocialActionResult<{ id: string }>> {
  return runSocialAction(() =>
    serverAuthFetch(API.friends.cheers, { method: 'POST', body: JSON.stringify(input) }),
  )
}

export async function blockUser(blockedUserId: string): Promise<SocialActionResult<null>> {
  return runSocialAction(() =>
    serverAuthFetch(API.friends.block, {
      method: 'POST',
      body: JSON.stringify({ blockedUserId }),
    }),
  )
}

export async function reportUser(input: {
  reportedUserId: string
  reason: ReportReason
  details?: string
  cheerId?: string
}): Promise<SocialActionResult<{ id: string }>> {
  return runSocialAction(() =>
    serverAuthFetch(API.friends.report, { method: 'POST', body: JSON.stringify(input) }),
  )
}

export async function setHandle(handle: string): Promise<SocialActionResult<null>> {
  return runSocialAction(() =>
    serverAuthFetch(API.profile.handle, { method: 'PUT', body: JSON.stringify({ handle }) }),
  )
}

export async function setSocialOptIn(enabled: boolean): Promise<SocialActionResult<null>> {
  return runSocialAction(() =>
    serverAuthFetch(API.profile.socialOptIn, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  )
}

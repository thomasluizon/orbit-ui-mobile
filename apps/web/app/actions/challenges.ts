'use server'

import { API } from '@orbit/shared/api'
import type {
  CreateChallengeRequest,
  JoinChallengeRequest,
  SetChallengeHabitsRequest,
} from '@orbit/shared/types/challenge'
import { extractBackendErrorCode, extractBackendStatus } from '@orbit/shared/utils'
import { serverAuthFetch } from '@/lib/server-fetch'

/**
 * Result envelope returned by every challenge Server Action. Errors are reduced to a serializable
 * `{ status, code }` so the calling hook can rebuild a typed error on the client — thrown errors are
 * redacted crossing the Server Action boundary, losing the backend error code the UI maps to copy.
 */
export type ChallengeActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null }

async function runChallengeAction<T>(
  operation: () => Promise<T>,
): Promise<ChallengeActionResult<T>> {
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

export async function createChallenge(
  input: CreateChallengeRequest,
): Promise<ChallengeActionResult<{ id: string }>> {
  return runChallengeAction(() =>
    serverAuthFetch(API.challenges.create, { method: 'POST', body: JSON.stringify(input) }),
  )
}

export async function joinChallenge(
  input: JoinChallengeRequest,
): Promise<ChallengeActionResult<null>> {
  return runChallengeAction(() =>
    serverAuthFetch(API.challenges.join, { method: 'POST', body: JSON.stringify(input) }),
  )
}

export async function leaveChallenge(challengeId: string): Promise<ChallengeActionResult<null>> {
  return runChallengeAction(() =>
    serverAuthFetch(API.challenges.leave(challengeId), { method: 'DELETE' }),
  )
}

export async function setChallengeHabits(
  challengeId: string,
  input: SetChallengeHabitsRequest,
): Promise<ChallengeActionResult<null>> {
  return runChallengeAction(() =>
    serverAuthFetch(API.challenges.setHabits(challengeId), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  )
}

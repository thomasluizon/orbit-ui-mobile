'use server'

import { API } from '@orbit/shared/api'
import type {
  AcceptAccountabilityPairRequest,
  CheckInAccountabilityRequest,
  InviteAccountabilityBuddyRequest,
  SetAccountabilityHabitsRequest,
} from '@orbit/shared/types/accountability'
import { extractBackendErrorCode, extractBackendStatus } from '@orbit/shared/utils'
import { serverAuthFetch } from '@/lib/server-fetch'
import type { SocialActionResult } from './social'

async function runAccountabilityAction<T>(
  operation: () => Promise<T>,
): Promise<SocialActionResult<T>> {
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

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the runAccountabilityAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function inviteAccountabilityBuddy(
  input: InviteAccountabilityBuddyRequest,
): Promise<SocialActionResult<{ id: string }>> {
  return runAccountabilityAction(() =>
    serverAuthFetch(API.accountability.pairs, { method: 'POST', body: JSON.stringify(input) }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the runAccountabilityAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function acceptAccountabilityPair(
  pairId: string,
  input: AcceptAccountabilityPairRequest,
): Promise<SocialActionResult<null>> {
  return runAccountabilityAction(() =>
    serverAuthFetch(API.accountability.accept(pairId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the runAccountabilityAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function endAccountabilityPair(pairId: string): Promise<SocialActionResult<null>> {
  return runAccountabilityAction(() =>
    serverAuthFetch(API.accountability.end(pairId), { method: 'DELETE' }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the runAccountabilityAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function setAccountabilityHabits(
  pairId: string,
  input: SetAccountabilityHabitsRequest,
): Promise<SocialActionResult<null>> {
  return runAccountabilityAction(() =>
    serverAuthFetch(API.accountability.habits(pairId), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the runAccountabilityAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function checkInAccountability(
  pairId: string,
  input: CheckInAccountabilityRequest,
): Promise<SocialActionResult<{ id: string }>> {
  return runAccountabilityAction(() =>
    serverAuthFetch(API.accountability.checkIns(pairId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

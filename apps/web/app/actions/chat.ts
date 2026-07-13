'use server'

import { API, MAX_CLARIFICATION_VALUE_LENGTH } from '@orbit/shared/api'
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  PendingAgentOperationConfirmation,
} from '@orbit/shared'
import { serverAuthFetch } from '@/lib/server-fetch'

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; code?: string }

export type PendingOperationActionResult<T> = ActionResult<T>

async function wrapServerAction<T>(fn: () => Promise<T>): Promise<PendingOperationActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
      ? ((error as { status: number }).status)
      : 500
    const code = typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined

    return { ok: false, error: message, status, code }
  }
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function confirmPendingOperation(
  id: string,
): Promise<PendingOperationActionResult<PendingAgentOperationConfirmation>> {
  return wrapServerAction(() =>
    serverAuthFetch<PendingAgentOperationConfirmation>(API.ai.pendingOperationConfirm(id), {
      method: 'POST',
    }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function issuePendingOperationStepUp(
  id: string,
  language: string,
): Promise<PendingOperationActionResult<AgentStepUpChallenge>> {
  return wrapServerAction(() =>
    serverAuthFetch<AgentStepUpChallenge>(API.ai.pendingOperationStepUp(id), {
      method: 'POST',
      body: JSON.stringify({ language }),
    }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function verifyPendingOperationStepUp(
  id: string,
  challengeId: string,
  code: string,
): Promise<PendingOperationActionResult<{ id: string } | null>> {
  return wrapServerAction(() =>
    serverAuthFetch<{ id: string } | null>(API.ai.pendingOperationVerifyStepUp(id), {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function executePendingOperation(
  id: string,
  confirmationToken: string,
): Promise<PendingOperationActionResult<AgentExecuteOperationResponse>> {
  return wrapServerAction(() =>
    serverAuthFetch<AgentExecuteOperationResponse>(API.ai.pendingOperationExecute(id), {
      method: 'POST',
      body: JSON.stringify({ confirmationToken }),
    }),
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthFetch enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function resolveClarification(
  operationId: string,
  value: string,
): Promise<PendingOperationActionResult<AgentExecuteOperationResponse>> {
  if (!UUID_RE.test(operationId)) {
    return { ok: false, error: 'Invalid operationId', status: 400 }
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_CLARIFICATION_VALUE_LENGTH) {
    return { ok: false, error: 'Invalid value', status: 400 }
  }

  return wrapServerAction(() =>
    serverAuthFetch<AgentExecuteOperationResponse>(API.ai.clarificationResolve(operationId), {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  )
}

'use server'

import { API, MAX_CLARIFICATION_VALUE_LENGTH } from '@orbit/shared/api'
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  PendingAgentOperationConfirmation,
  PendingOperationRevisionResult,
  RevisePendingOperationRequest,
} from '@orbit/shared'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export type PendingOperationActionResult<T> = ServerActionResult<T>

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthMutate enforces auth (resolveServerSession throws 401 before any request); RD cannot trace the call nested in wrapServerAction. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function revisePendingOperation(
  id: string,
  request: RevisePendingOperationRequest,
  intendedAccountId: string | null,
): Promise<PendingOperationActionResult<PendingOperationRevisionResult>> {
  return wrapServerAction(() =>
    serverAuthMutate<PendingOperationRevisionResult>(API.ai.pendingOperationRevise(id), {
      method: 'POST',
      body: JSON.stringify(request),
    }, intendedAccountId),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthMutate enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function confirmPendingOperation(
  id: string,
  intendedAccountId: string | null,
): Promise<PendingOperationActionResult<PendingAgentOperationConfirmation>> {
  return wrapServerAction(() =>
    serverAuthMutate<PendingAgentOperationConfirmation>(API.ai.pendingOperationConfirm(id), {
      method: 'POST',
    }, intendedAccountId),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthMutate enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function issuePendingOperationStepUp(
  id: string,
  language: string,
  intendedAccountId: string | null,
): Promise<PendingOperationActionResult<AgentStepUpChallenge>> {
  return wrapServerAction(() =>
    serverAuthMutate<AgentStepUpChallenge>(API.ai.pendingOperationStepUp(id), {
      method: 'POST',
      body: JSON.stringify({ language }),
    }, intendedAccountId),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthMutate enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function verifyPendingOperationStepUp(
  id: string,
  challengeId: string,
  code: string,
  intendedAccountId: string | null,
): Promise<PendingOperationActionResult<{ id: string } | null>> {
  return wrapServerAction(() =>
    serverAuthMutate<{ id: string } | null>(API.ai.pendingOperationVerifyStepUp(id), {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }, intendedAccountId),
  )
}

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthMutate enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function executePendingOperation(
  id: string,
  confirmationToken: string,
  intendedAccountId: string | null,
): Promise<PendingOperationActionResult<AgentExecuteOperationResponse>> {
  return wrapServerAction(() =>
    serverAuthMutate<AgentExecuteOperationResponse>(API.ai.pendingOperationExecute(id), {
      method: 'POST',
      body: JSON.stringify({ confirmationToken }),
    }, intendedAccountId),
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// react-doctor-disable-next-line server-auth-actions -- FP: serverAuthMutate enforces auth (resolveServerSession throws 401 before any request); RD can't trace the call nested in the wrapServerAction closure. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export async function resolveClarification(
  operationId: string,
  value: string,
  intendedAccountId: string | null,
): Promise<PendingOperationActionResult<AgentExecuteOperationResponse>> {
  if (!UUID_RE.test(operationId)) {
    return {
      ok: false,
      error: 'Invalid operationId',
      status: 400,
      sessionRefreshFailed: false,
    }
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_CLARIFICATION_VALUE_LENGTH) {
    return {
      ok: false,
      error: 'Invalid value',
      status: 400,
      sessionRefreshFailed: false,
    }
  }

  return wrapServerAction(() =>
    serverAuthMutate<AgentExecuteOperationResponse>(API.ai.clarificationResolve(operationId), {
      method: 'POST',
      body: JSON.stringify({ value }),
    }, intendedAccountId),
  )
}

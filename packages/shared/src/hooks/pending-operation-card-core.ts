import type { AgentExecuteOperationResponse } from '../types/ai'

export type PendingOperationExecutionResult = {
  ok: boolean
  error?: string
  response?: AgentExecuteOperationResponse
}

export type PreparedPendingOperationStepUp = {
  challengeId: string
  confirmationToken: string
}

export type PendingOperationStepUpPreparationResult =
  | { ok: true; challengeId: string; confirmationToken: string }
  | { ok: false; error?: string }

export type PendingOperationCardStatus = 'done' | 'failed' | undefined

export interface PendingOperationAuthorizationState {
  sourceId: string
  sourceFingerprint: string | null | undefined
  confirmOpen: boolean
  preparedStepUp: PreparedPendingOperationStepUp | undefined
  closingStepUp: PreparedPendingOperationStepUp | undefined
  status: PendingOperationCardStatus
  dismissed: boolean
}

export function createPendingOperationAuthorizationState(
  sourceId: string,
  sourceFingerprint: string | null | undefined,
): PendingOperationAuthorizationState {
  return { sourceId, sourceFingerprint, confirmOpen: false, preparedStepUp: undefined, closingStepUp: undefined, status: undefined, dismissed: false }
}

export function matchesPendingOperationAuthorization(
  current: Pick<PendingOperationAuthorizationState, 'sourceId' | 'sourceFingerprint'>,
  sourceId: string,
  sourceFingerprint: string | null | undefined,
): boolean {
  return current.sourceId === sourceId && current.sourceFingerprint === sourceFingerprint
}

export function reconcilePendingOperationAuthorizationState(
  current: PendingOperationAuthorizationState,
  sourceId: string,
  sourceFingerprint: string | null | undefined,
): PendingOperationAuthorizationState {
  if (matchesPendingOperationAuthorization(current, sourceId, sourceFingerprint)) return current
  return {
    ...createPendingOperationAuthorizationState(sourceId, sourceFingerprint),
    closingStepUp: current.preparedStepUp ?? current.closingStepUp,
  }
}

export function getPendingOperationExecutionStatus(
  result: PendingOperationExecutionResult,
): Exclude<PendingOperationCardStatus, undefined> {
  return result.ok && result.response?.operation.status === 'Succeeded' ? 'done' : 'failed'
}

export function getPreparedPendingOperationStepUp(
  result: PendingOperationStepUpPreparationResult,
): PreparedPendingOperationStepUp | undefined {
  return result.ok
    ? { challengeId: result.challengeId, confirmationToken: result.confirmationToken }
    : undefined
}

export function getPendingOperationVerificationResult(
  result: PendingOperationExecutionResult,
  genericError: string,
): { status: Exclude<PendingOperationCardStatus, undefined>; error?: never }
  | { status?: never; error: string } {
  return result.ok
    ? { status: getPendingOperationExecutionStatus(result) }
    : { error: result.error ?? genericError }
}

export function getPendingOperationCardPresentation(
  riskClass: string,
  confirmationRequirement: string,
  busy: boolean,
  status: PendingOperationCardStatus,
): { destructive: boolean; action: 'none' | 'stepUp' | 'buttons'; frameState: 'acting' | 'partiallyFailed' | 'resting' } {
  return {
    destructive: riskClass === 'Destructive',
    action: status ? 'none' : confirmationRequirement === 'StepUp' ? 'stepUp' : 'buttons',
    frameState: busy ? 'acting' : status === 'failed' ? 'partiallyFailed' : 'resting',
  }
}

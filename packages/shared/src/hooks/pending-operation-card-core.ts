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

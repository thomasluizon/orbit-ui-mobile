import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPendingOperationAuthorizationState, reconcilePendingOperationAuthorizationState, matchesPendingOperationAuthorization, getPendingOperationExecutionStatus, getPendingOperationVerificationResult, getPreparedPendingOperationStepUp, type PendingOperationExecutionResult, type PreparedPendingOperationStepUp, type PendingOperationStepUpPreparationResult, type PendingOperationCardStatus } from '@orbit/shared/hooks'
import type { AgentOperationResult } from '@orbit/shared/types/ai'

interface PendingOperationCardState {
  busy: boolean
  confirmOpen: boolean
  dismissed: boolean
  preparedStepUp: PreparedPendingOperationStepUp | undefined
  closingStepUp: PreparedPendingOperationStepUp | undefined
  status: PendingOperationCardStatus
  completedOperation: AgentOperationResult | undefined
  canRetry: boolean
  completeStepUp: (result: PendingOperationExecutionResult) => void
  closeStepUp: () => void
  clearClosingStepUp: () => void
  dismiss: () => void
  execute: () => Promise<void>
  isCurrent: () => boolean
  setConfirmOpen: Dispatch<SetStateAction<boolean>>
  startStepUp: () => Promise<void>
}

interface PendingOperationStepUpVerificationState {
  code: string
  error: string | undefined
  setCode: Dispatch<SetStateAction<string>>
  verifying: boolean
  verify: () => Promise<void>
}

export function usePendingOperationCardState({
  pendingOperationId,
  previewFingerprint,
  authorizationVersion = 0,
  settledState,
  onConfirmExecute,
  onPrepareStepUp,
}: Readonly<{
  pendingOperationId: string
  previewFingerprint?: string | null
  authorizationVersion?: number
  settledState?: Partial<Pick<PendingOperationCardState, 'status' | 'completedOperation' | 'canRetry' | 'dismissed'>>
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
}>): PendingOperationCardState {
  const [busy, setBusy] = useState(false)
  const [authorization, setAuthorization] = useState(() =>
    createPendingOperationAuthorizationState(pendingOperationId, previewFingerprint, authorizationVersion, settledState))
  const synchronized = reconcilePendingOperationAuthorizationState(
    authorization, pendingOperationId, previewFingerprint, authorizationVersion)
  if (synchronized !== authorization) setAuthorization(synchronized)
  const sourceRef = useRef({ sourceId: pendingOperationId, sourceFingerprint: previewFingerprint, authorizationVersion })
  useLayoutEffect(() => {
    sourceRef.current = { sourceId: pendingOperationId, sourceFingerprint: previewFingerprint, authorizationVersion }
  }, [pendingOperationId, previewFingerprint, authorizationVersion])
  const isCurrent = useCallback(() =>
    matchesPendingOperationAuthorization(sourceRef.current, pendingOperationId, previewFingerprint, authorizationVersion),
  [pendingOperationId, previewFingerprint, authorizationVersion])

  const setConfirmOpen = useCallback<Dispatch<SetStateAction<boolean>>>((open) => {
    if (!isCurrent()) return
    setAuthorization((current) => ({
      ...current,
      confirmOpen: typeof open === 'function' ? open(current.confirmOpen) : open,
    }))
  }, [isCurrent])

  const execute = useCallback(async () => {
    if (!isCurrent()) return
    setBusy(true)
    try {
      const result = await onConfirmExecute(pendingOperationId)
      if (isCurrent()) setAuthorization((current) => ({
        ...current, status: getPendingOperationExecutionStatus(result), completedOperation: result.response?.operation,
        canRetry: !result.ok,
      }))
    } finally {
      setBusy(false)
    }
  }, [isCurrent, onConfirmExecute, pendingOperationId])

  const startStepUp = useCallback(async () => {
    if (!isCurrent() || synchronized.closingStepUp) return
    setBusy(true)
    try {
      const result = await onPrepareStepUp(pendingOperationId)
      const prepared = getPreparedPendingOperationStepUp(result)
      if (isCurrent()) setAuthorization((current) => ({
        ...current, preparedStepUp: prepared, status: prepared ? current.status : 'failed',
        canRetry: !prepared,
      }))
    } finally {
      setBusy(false)
    }
  }, [isCurrent, onPrepareStepUp, pendingOperationId, synchronized.closingStepUp])

  const completeStepUp = useCallback((result: PendingOperationExecutionResult) => {
    if (isCurrent()) setAuthorization((current) => ({
      ...current, preparedStepUp: undefined, status: getPendingOperationExecutionStatus(result), completedOperation: result.response?.operation,
      canRetry: !result.ok,
    }))
  }, [isCurrent])
  const clearClosingStepUp = useCallback(() => {
    setAuthorization((current) => current.closingStepUp === synchronized.closingStepUp
      ? { ...current, closingStepUp: undefined } : current)
  }, [synchronized.closingStepUp])

  return {
    busy: busy || synchronized.closingStepUp !== undefined,
    confirmOpen: synchronized.confirmOpen,
    dismissed: synchronized.dismissed,
    preparedStepUp: synchronized.preparedStepUp,
    closingStepUp: synchronized.closingStepUp,
    status: synchronized.status,
    completedOperation: synchronized.completedOperation,
    canRetry: synchronized.canRetry,
    completeStepUp,
    clearClosingStepUp,
    closeStepUp: () => { if (isCurrent()) setAuthorization((current) => ({ ...current, preparedStepUp: undefined })) },
    dismiss: () => { if (isCurrent()) setAuthorization((current) => ({ ...current, dismissed: true })) },
    execute,
    isCurrent,
    setConfirmOpen,
    startStepUp,
  }
}

export function usePendingOperationStepUpVerification({
  genericError,
  onCompleted,
  onVerify,
  pendingOperationId,
  prepared,
}: Readonly<{
  genericError: string
  onCompleted: (result: PendingOperationExecutionResult) => void
  onVerify: (
    id: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<PendingOperationExecutionResult>
  pendingOperationId: string
  prepared: PreparedPendingOperationStepUp
}>): PendingOperationStepUpVerificationState {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [verifying, setVerifying] = useState(false)

  const verify = useCallback(async () => {
    setVerifying(true)
    setError(undefined)
    try {
      const result = await onVerify(
        pendingOperationId,
        prepared.challengeId,
        code,
        prepared.confirmationToken,
      )
      const outcome = getPendingOperationVerificationResult(result, genericError)
      if (outcome.error !== undefined) setError(outcome.error)
      else onCompleted(result)
    } finally {
      setVerifying(false)
    }
  }, [code, genericError, onCompleted, onVerify, pendingOperationId, prepared])

  return { code, error, setCode, verifying, verify }
}

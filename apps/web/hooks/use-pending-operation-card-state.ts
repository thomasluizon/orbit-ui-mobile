'use client'

import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPendingOperationAuthorizationState, reconcilePendingOperationAuthorizationState, matchesPendingOperationAuthorization, getPendingOperationExecutionStatus, getPendingOperationVerificationResult, getPreparedPendingOperationStepUp, type PendingOperationExecutionResult, type PreparedPendingOperationStepUp, type PendingOperationStepUpPreparationResult, type PendingOperationCardStatus } from '@orbit/shared/hooks'

interface PendingOperationCardState {
  busy: boolean
  confirmOpen: boolean
  dismissed: boolean
  preparedStepUp: PreparedPendingOperationStepUp | undefined
  closingStepUp: PreparedPendingOperationStepUp | undefined
  status: PendingOperationCardStatus
  completeStepUp: (status: Exclude<PendingOperationCardStatus, undefined>) => void
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
  onConfirmExecute,
  onPrepareStepUp,
}: Readonly<{
  pendingOperationId: string
  previewFingerprint?: string | null
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
}>): PendingOperationCardState {
  const [busy, setBusy] = useState(false)
  const [authorization, setAuthorization] = useState(() =>
    createPendingOperationAuthorizationState(pendingOperationId, previewFingerprint))
  const synchronized = reconcilePendingOperationAuthorizationState(
    authorization, pendingOperationId, previewFingerprint)
  if (synchronized !== authorization) setAuthorization(synchronized)
  const sourceRef = useRef({ sourceId: pendingOperationId, sourceFingerprint: previewFingerprint })
  useLayoutEffect(() => {
    sourceRef.current = { sourceId: pendingOperationId, sourceFingerprint: previewFingerprint }
  }, [pendingOperationId, previewFingerprint])
  const isCurrent = useCallback(() =>
    matchesPendingOperationAuthorization(sourceRef.current, pendingOperationId, previewFingerprint),
  [pendingOperationId, previewFingerprint])

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
      if (isCurrent()) setAuthorization((current) => ({ ...current, status: getPendingOperationExecutionStatus(result) }))
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
      }))
    } finally {
      setBusy(false)
    }
  }, [isCurrent, onPrepareStepUp, pendingOperationId, synchronized.closingStepUp])

  const completeStepUp = useCallback((nextStatus: Exclude<PendingOperationCardStatus, undefined>) => {
    if (isCurrent()) setAuthorization((current) => ({ ...current, preparedStepUp: undefined, status: nextStatus }))
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
  onCompleted: (status: Exclude<PendingOperationCardStatus, undefined>) => void
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
      else onCompleted(outcome.status)
    } finally {
      setVerifying(false)
    }
  }, [code, genericError, onCompleted, onVerify, pendingOperationId, prepared])

  return { code, error, setCode, verifying, verify }
}

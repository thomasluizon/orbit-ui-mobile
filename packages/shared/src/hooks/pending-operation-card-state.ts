import { useCallback, useState } from 'react'
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

export function usePendingOperationCardState({
  pendingOperationId,
  onConfirmExecute,
  onPrepareStepUp,
}: Readonly<{
  pendingOperationId: string
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
}>) {
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<PendingOperationCardStatus>()
  const [dismissed, setDismissed] = useState(false)
  const [preparedStepUp, setPreparedStepUp] = useState<PreparedPendingOperationStepUp>()

  const execute = useCallback(async () => {
    setBusy(true)
    try {
      setStatus(getPendingOperationExecutionStatus(await onConfirmExecute(pendingOperationId)))
    } finally {
      setBusy(false)
    }
  }, [onConfirmExecute, pendingOperationId])

  const startStepUp = useCallback(async () => {
    setBusy(true)
    try {
      const result = await onPrepareStepUp(pendingOperationId)
      if (result.ok) {
        setPreparedStepUp({
          challengeId: result.challengeId,
          confirmationToken: result.confirmationToken,
        })
      } else {
        setStatus('failed')
      }
    } finally {
      setBusy(false)
    }
  }, [onPrepareStepUp, pendingOperationId])

  const completeStepUp = useCallback((nextStatus: Exclude<PendingOperationCardStatus, undefined>) => {
    setPreparedStepUp(undefined)
    setStatus(nextStatus)
  }, [])

  return {
    busy,
    confirmOpen,
    dismissed,
    preparedStepUp,
    status,
    completeStepUp,
    closeStepUp: () => setPreparedStepUp(undefined),
    dismiss: () => setDismissed(true),
    execute,
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
}>) {
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
      if (!result.ok) {
        setError(result.error ?? genericError)
        return
      }
      onCompleted(getPendingOperationExecutionStatus(result))
    } finally {
      setVerifying(false)
    }
  }, [code, genericError, onCompleted, onVerify, pendingOperationId, prepared])

  return { code, error, setCode, verifying, verify }
}

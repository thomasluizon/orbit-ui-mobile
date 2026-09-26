import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { getPendingOperationExecutionStatus, getPendingOperationVerificationResult, getPreparedPendingOperationStepUp, type PendingOperationExecutionResult, type PreparedPendingOperationStepUp, type PendingOperationStepUpPreparationResult, type PendingOperationCardStatus } from '@orbit/shared/hooks'

interface PendingOperationCardState {
  busy: boolean
  confirmOpen: boolean
  dismissed: boolean
  preparedStepUp: PreparedPendingOperationStepUp | undefined
  status: PendingOperationCardStatus
  completeStepUp: (status: Exclude<PendingOperationCardStatus, undefined>) => void
  closeStepUp: () => void
  dismiss: () => void
  execute: () => Promise<void>
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
  onConfirmExecute,
  onPrepareStepUp,
}: Readonly<{
  pendingOperationId: string
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
}>): PendingOperationCardState {
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
      const prepared = getPreparedPendingOperationStepUp(result)
      if (prepared) setPreparedStepUp(prepared)
      else setStatus('failed')
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

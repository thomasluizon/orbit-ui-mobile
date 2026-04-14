'use client'

import { useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse, PendingAgentOperation } from '@orbit/shared/types/ai'

type PendingOperationExecutionResult = {
  ok: boolean
  error?: string
  response?: AgentExecuteOperationResponse
}

interface PendingOperationCardProps {
  pendingOperation: PendingAgentOperation
  onConfirmExecute: (pendingOperationId: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; challengeId?: string; confirmationToken?: string }>
  onVerifyStepUp: (
    pendingOperationId: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<PendingOperationExecutionResult>
}

function formatRiskLabel(riskClass: PendingAgentOperation['riskClass']): string {
  switch (riskClass) {
    case 'High':
      return 'High risk'
    case 'Destructive':
      return 'Destructive'
    default:
      return 'Low risk'
  }
}

function resolveExecutionError(
  result: PendingOperationExecutionResult,
  fallback: string,
): string {
  return (
    result.error ??
    result.response?.operation.policyReason ??
    result.response?.policyDenial?.reason ??
    result.response?.operation.summary ??
    fallback
  )
}

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardProps>) {
  const t = useTranslations()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null)

  const needsStepUp = pendingOperation.confirmationRequirement === 'StepUp'
  const riskLabel = useMemo(
    () => formatRiskLabel(pendingOperation.riskClass),
    [pendingOperation.riskClass],
  )
  const primaryActionLabel = isLoading
    ? t('common.loading')
    : needsStepUp
      ? t('auth.sendCode')
      : t('common.confirm')

  async function handleStart() {
    setIsLoading(true)
    setError(null)

    try {
      if (needsStepUp) {
        const result = await onPrepareStepUp(pendingOperation.id)
        if (!result.ok || !result.challengeId || !result.confirmationToken) {
          setError(result.error ?? t('chat.sendError'))
          return
        }

        setChallengeId(result.challengeId)
        setConfirmationToken(result.confirmationToken)
        return
      }

      const result = await onConfirmExecute(pendingOperation.id)
      if (!result.ok) {
        setError(result.error ?? t('chat.sendError'))
        return
      }

      if (result.response && result.response.operation.status !== 'Succeeded') {
        setError(resolveExecutionError(result, t('chat.sendError')))
        return
      }

      setSuccessMessage(pendingOperation.summary)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleVerify() {
    if (!challengeId || !confirmationToken || verificationCode.trim().length === 0) {
      setError(t('auth.genericError'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await onVerifyStepUp(
        pendingOperation.id,
        challengeId,
        verificationCode.trim(),
        confirmationToken,
      )

      if (!result.ok) {
        setError(result.error ?? t('chat.sendError'))
        return
      }

      if (result.response && result.response.operation.status !== 'Succeeded') {
        setError(resolveExecutionError(result, t('chat.sendError')))
        return
      }

      setSuccessMessage(pendingOperation.summary)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-amber-500/25 bg-amber-500/8 p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-300">
          <ShieldAlert className="size-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">
              {pendingOperation.displayName}
            </p>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              {riskLabel}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-text-secondary">
            {pendingOperation.summary}
          </p>

          {challengeId && !successMessage && (
            <div className="space-y-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))
                }
                placeholder="123456"
                className="w-full rounded-[var(--radius-lg)] border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary"
              />
              <button
                type="button"
                className="rounded-[var(--radius-lg)] bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                onClick={() => {
                  void handleVerify()
                }}
                disabled={isLoading || verificationCode.trim().length < 6}
              >
                {isLoading ? t('common.loading') : t('auth.verify')}
              </button>
            </div>
          )}

          {!challengeId && !successMessage && (
            <button
              type="button"
              className="rounded-[var(--radius-lg)] bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
              onClick={() => {
                void handleStart()
              }}
              disabled={isLoading}
            >
              {primaryActionLabel}
            </button>
          )}

          {challengeId && !successMessage && (
            <p className="text-[11px] text-text-muted">
              {t('auth.codeSent')}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {successMessage && (
            <p className="text-xs font-medium text-emerald-400">{successMessage}</p>
          )}
        </div>
      </div>
    </div>
  )
}

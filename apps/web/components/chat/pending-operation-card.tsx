'use client'

import { useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse, PendingAgentOperation } from '@orbit/shared/types/ai'
import {
  getAgentCapabilityLabelKey,
  getAgentPolicyReasonKey,
} from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'

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

function getRiskLabelKey(
  riskClass: PendingAgentOperation['riskClass'],
): 'chat.pendingOp.risk.high' | 'chat.pendingOp.risk.destructive' | 'chat.pendingOp.risk.low' {
  switch (riskClass) {
    case 'High':
      return 'chat.pendingOp.risk.high'
    case 'Destructive':
      return 'chat.pendingOp.risk.destructive'
    default:
      return 'chat.pendingOp.risk.low'
  }
}

function resolveExecutionError(
  result: PendingOperationExecutionResult,
  translate: (key: string) => string,
  fallback: string,
): string {
  const reasonKey = getAgentPolicyReasonKey(
    result.response?.operation.policyReason ?? result.response?.policyDenial?.reason,
  )
  if (reasonKey) return translate(reasonKey)
  return result.error ?? fallback
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
  const [dismissed, setDismissed] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  const needsStepUp = pendingOperation.confirmationRequirement === 'StepUp'
  const riskLabel = t(getRiskLabelKey(pendingOperation.riskClass))
  const capabilityLabelKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  const operationName = capabilityLabelKey ? t(capabilityLabelKey) : pendingOperation.displayName
  const operationSummary = t('chat.pendingOp.summary', { name: operationName })
  const primaryActionLabel = needsStepUp ? t('auth.sendCode') : t('common.confirm')
  const loadingSpinner = isLoading ? <Loader2 className="size-3.5 animate-spin" /> : undefined

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
        setError(resolveExecutionError(result, t, t('chat.sendError')))
        return
      }

      setSuccessMessage(t('chat.pendingOp.confirmed'))
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
        setError(resolveExecutionError(result, t, t('chat.sendError')))
        return
      }

      setSuccessMessage(t('chat.pendingOp.confirmed'))
    } finally {
      setIsLoading(false)
    }
  }

  if (dismissed) {
    return null
  }

  return (
    <div
      data-testid="pending-op-card"
      className="rounded-[16px] bg-[var(--bg-card)]"
      style={{
        padding: '14px 16px',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'translateY(-4px)' : 'none',
        transition:
          'opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
      }}
      onTransitionEnd={(event) => {
        if (isExiting && event.target === event.currentTarget && event.propertyName === 'opacity') {
          setDismissed(true)
        }
      }}
    >
      <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
        <div
          className="shrink-0 flex items-center justify-center rounded-[12px] bg-[var(--bg-elev)]"
          style={{ width: 42, height: 42 }}
          aria-hidden="true"
        >
          <ShieldAlert size={20} strokeWidth={1.8} color="var(--status-overdue)" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {operationName}
            </p>
            <Badge tone="amber">{riskLabel}</Badge>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {operationSummary}
          </p>
        </div>
      </div>

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
            placeholder={t('common.codePlaceholder')}
            className="w-full rounded-[14px] bg-[var(--bg-field)] px-4 py-3 text-sm text-[var(--fg-1)] outline-none transition-[box-shadow] duration-[var(--dur-fast)] shadow-[inset_0_0_0_1px_var(--hairline)] focus:shadow-[inset_0_0_0_2px_var(--primary)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          />
          <div className="flex gap-2">
            <PillButton
              className="flex-1 py-[11px]! text-[14px]!"
              disabled={isLoading || verificationCode.trim().length < 6}
              leading={loadingSpinner}
              onClick={() => {
                void handleVerify()
              }}
            >
              {t('auth.verify')}
            </PillButton>
          </div>
          <p className="text-[11px] text-[var(--fg-3)]">
            {t('auth.codeSent')}
          </p>
        </div>
      )}

      {!challengeId && !successMessage && (
        <div className="flex gap-2">
          <PillButton
            className="flex-1 py-[11px]! text-[14px]!"
            disabled={isLoading}
            dataTestId="pending-op-confirm"
            leading={loadingSpinner}
            onClick={() => {
              void handleStart()
            }}
          >
            {primaryActionLabel}
          </PillButton>
          <PillButton
            variant="ghost"
            className="py-[11px]! text-[14px]! px-[18px]!"
            disabled={isLoading}
            dataTestId="pending-op-cancel"
            onClick={() => setIsExiting(true)}
          >
            {t('common.cancel')}
          </PillButton>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--status-bad)]" style={{ marginTop: 10 }}>{error}</p>
      )}

      {successMessage && (
        <p className="text-xs font-medium text-[var(--status-done)]">{successMessage}</p>
      )}
    </div>
  )
}

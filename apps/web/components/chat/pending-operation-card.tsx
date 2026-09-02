'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse, PendingAgentOperation } from '@orbit/shared/types/ai'
import { getAgentCapabilityLabelKey } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OtpInput } from '@/components/ui/otp-input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'

type ExecutionResult = { ok: boolean; error?: string; response?: AgentExecuteOperationResponse }
type PreparedStepUp = { challengeId: string; confirmationToken: string }
type StepUpPreparationResult = { ok: true; challengeId: string; confirmationToken: string } | { ok: false; error?: string }

function StepUpVerificationSheet({
  pendingOperationId,
  prepared,
  onClose,
  onCompleted,
  onVerify,
}: Readonly<{
  pendingOperationId: string
  prepared: PreparedStepUp
  onClose: () => void
  onCompleted: (status: 'done' | 'failed') => void
  onVerify: (id: string, challengeId: string, code: string, confirmationToken: string) => Promise<ExecutionResult>
}>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [verifying, setVerifying] = useState(false)

  const verify = async () => {
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
        setError(result.error ?? t('stepUp.genericError'))
        return
      }
      const status = result.response?.operation.status === 'Succeeded' ? 'done' : 'failed'
      closeSheet(() => onCompleted(status))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Sheet
      ref={sheetRef}
      title={t('stepUp.title')}
      onClose={onClose}
      actions={<>
        <Button size="sm" variant="ghost" onClick={() => closeSheet()}>{t('common.cancel')}</Button>
        <Button size="sm" loading={verifying} disabled={code.length !== 6} onClick={() => void verify()}>{t('stepUp.confirm')}</Button>
      </>}
    >
      <OtpInput label={t('stepUp.codeLabel')} value={code} onChange={setCode} error={error} hint={t('stepUp.codeHint')} disabled={verifying} />
      <p className="text-sm text-[var(--fg-3)]">{t('stepUp.neverShare')}</p>
    </Sheet>
  )
}

export function PendingOperationCard({ pendingOperation, onConfirmExecute, onPrepareStepUp, onVerifyStepUp }: Readonly<{
  pendingOperation: PendingAgentOperation
  onConfirmExecute: (id: string) => Promise<ExecutionResult>
  onPrepareStepUp: (id: string) => Promise<StepUpPreparationResult>
  onVerifyStepUp: (id: string, challengeId: string, code: string, confirmationToken: string) => Promise<ExecutionResult>
}>) {
  const t = useTranslations()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<'done' | 'failed' | undefined>()
  const [dismissed, setDismissed] = useState(false)
  const [preparedStepUp, setPreparedStepUp] = useState<PreparedStepUp>()
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  const name = capabilityKey ? t(capabilityKey) : t('chat.operation.unknown')
  const destructive = pendingOperation.riskClass === 'Destructive'
  const risk = t(`chat.operation.risk.${pendingOperation.riskClass.toLowerCase()}`)
  const execute = async () => {
    setBusy(true)
    try {
      const result = await onConfirmExecute(pendingOperation.id)
      setStatus(result.ok && result.response?.operation.status === 'Succeeded' ? 'done' : 'failed')
    } finally {
      setBusy(false)
    }
  }
  if (dismissed) return null
  const startStepUp = async () => {
    setBusy(true)
    try {
      const result = await onPrepareStepUp(pendingOperation.id)
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
  }
  const items = [{ id: pendingOperation.id, label: name, meta: t('chat.operation.pending'), status, irreversible: destructive && status == null }]
  return <>
    <BlockFrame state={busy ? 'acting' : status === 'failed' ? 'partiallyFailed' : 'resting'} title={t('chat.operation.pendingTitle')} items={items} risk={<Badge variant="outline">{risk}</Badge>} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.operation.confirmNote')} actions={status ? undefined : pendingOperation.confirmationRequirement === 'StepUp' ? (
      <StepUp message={t('chat.operation.stepUpMessage')} actionLabel={t('chat.operation.stepUpAction')} onAction={() => void startStepUp()} busy={busy} />
    ) : <><Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>{t('common.cancel')}</Button><Button size="sm" variant={destructive ? 'destructive' : 'primary'} onClick={() => destructive ? setConfirmOpen(true) : void execute()}>{t('chat.operation.approve')}</Button></>} />
    <ConfirmSheet open={confirmOpen} title={t('chat.operation.confirmTitle')} message={t('chat.operation.confirmBody')} confirmLabel={t('chat.operation.confirm')} destructive onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void execute() }} />
    {preparedStepUp ? <StepUpVerificationSheet
      pendingOperationId={pendingOperation.id}
      prepared={preparedStepUp}
      onClose={() => setPreparedStepUp(undefined)}
      onCompleted={(nextStatus) => {
        setPreparedStepUp(undefined)
        setStatus(nextStatus)
      }}
      onVerify={onVerifyStepUp}
    /> : null}
  </>
}

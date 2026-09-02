import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentExecuteOperationResponse, PendingAgentOperation } from '@orbit/shared/types/ai'
import { getAgentCapabilityLabelKey } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { StepUp } from '@/components/ui/step-up'

type ExecutionResult = { ok: boolean; error?: string; response?: AgentExecuteOperationResponse }

export function PendingOperationCard({ pendingOperation, onConfirmExecute, onPrepareStepUp }: Readonly<{
  pendingOperation: PendingAgentOperation
  onConfirmExecute: (id: string) => Promise<ExecutionResult>
  onPrepareStepUp: (id: string) => Promise<{ ok: boolean; error?: string }>
  onVerifyStepUp: (...arguments_: never[]) => Promise<ExecutionResult>
}>) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<'done' | 'failed' | undefined>()
  const [dismissed, setDismissed] = useState(false)
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
      if (!result.ok) setStatus('failed')
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
  </>
}

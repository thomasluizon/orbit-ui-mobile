import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  usePendingOperationCardState,
  usePendingOperationStepUpVerification,
  type PendingOperationExecutionResult,
  type PendingOperationStepUpPreparationResult,
  type PreparedPendingOperationStepUp,
} from '@orbit/shared/hooks'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import { getAgentCapabilityLabelKey } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OtpInput } from '@/components/ui/otp-input'
import { Button } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'

interface PendingOperationCardProps {
  pendingOperation: PendingAgentOperation
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
  onVerifyStepUp: (
    id: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<PendingOperationExecutionResult>
}

function StepUpVerificationSheet({
  pendingOperationId,
  prepared,
  onClose,
  onCompleted,
  onVerify,
}: Readonly<{
  pendingOperationId: string
  prepared: PreparedPendingOperationStepUp
  onClose: () => void
  onCompleted: (status: 'done' | 'failed') => void
  onVerify: PendingOperationCardProps['onVerifyStepUp']
}>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const completed = (status: 'done' | 'failed') => closeSheet(() => onCompleted(status))
  const { code, error, setCode, verifying, verify } = usePendingOperationStepUpVerification({
    genericError: t('stepUp.genericError'),
    onCompleted: completed,
    onVerify,
    pendingOperationId,
    prepared,
  })

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
      <Text>{t('stepUp.neverShare')}</Text>
    </Sheet>
  )
}

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardProps>) {
  const { t } = useTranslation()
  const card = usePendingOperationCardState({
    pendingOperationId: pendingOperation.id,
    onConfirmExecute,
    onPrepareStepUp,
  })
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  const name = capabilityKey ? t(capabilityKey) : t('chat.operation.unknown')
  const destructive = pendingOperation.riskClass === 'Destructive'
  const risk = t(`chat.operation.risk.${pendingOperation.riskClass.toLowerCase()}`)

  if (card.dismissed) return null

  const items = [{
    id: pendingOperation.id,
    label: name,
    meta: t('chat.operation.pending'),
    status: card.status,
    irreversible: destructive && card.status == null,
  }]
  const state = card.busy
    ? 'acting'
    : card.status === 'failed'
      ? 'partiallyFailed'
      : 'resting'
  let actions: React.ReactNode
  if (!card.status && pendingOperation.confirmationRequirement === 'StepUp') {
    actions = <StepUp message={t('chat.operation.stepUpMessage')} actionLabel={t('chat.operation.stepUpAction')} onAction={() => void card.startStepUp()} busy={card.busy} />
  } else if (!card.status) {
    actions = <>
      <Button size="sm" variant="ghost" onClick={card.dismiss}>{t('common.cancel')}</Button>
      <Button size="sm" variant={destructive ? 'destructive' : 'primary'} onClick={() => destructive ? card.setConfirmOpen(true) : void card.execute()}>{t('chat.operation.approve')}</Button>
    </>
  }

  return <>
    <BlockFrame state={state} title={t('chat.operation.pendingTitle')} items={items} risk={<Badge variant="outline">{risk}</Badge>} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.operation.confirmNote')} actions={actions} />
    <ConfirmSheet open={card.confirmOpen} title={t('chat.operation.confirmTitle')} message={t('chat.operation.confirmBody')} confirmLabel={t('chat.operation.confirm')} destructive onCancel={() => card.setConfirmOpen(false)} onConfirm={() => { card.setConfirmOpen(false); void card.execute() }} />
    {card.preparedStepUp ? <StepUpVerificationSheet
      pendingOperationId={pendingOperation.id}
      prepared={card.preparedStepUp}
      onClose={card.closeStepUp}
      onCompleted={card.completeStepUp}
      onVerify={onVerifyStepUp}
    /> : null}
  </>
}

import type { ElementType, ReactNode } from 'react'
import {
  usePendingOperationCardState,
  usePendingOperationStepUpVerification,
  type PendingOperationExecutionResult,
  type PendingOperationStepUpPreparationResult,
  type PreparedPendingOperationStepUp,
} from '../hooks/pending-operation-card-state'
import type { PendingAgentOperation } from '../types/ai'
import { getAgentCapabilityLabelKey } from '../utils/agent-pending-operation'

type Translate = (key: string, values?: Record<string, string | number>) => string

interface PendingOperationCardAdapter {
  Badge: ElementType
  BlockFrame: ElementType
  Button: ElementType
  ConfirmSheet: ElementType
  OtpInput: ElementType
  PrivacyText: ElementType
  Sheet: ElementType
  StepUp: ElementType
  useSheetHost: () => {
    sheetRef: unknown
    closeSheet: (onClosed?: () => void) => void
  }
  useTranslate: () => Translate
}

export interface PendingOperationCardProps {
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

type PendingOperationCardComponent = (
  props: Readonly<PendingOperationCardProps>,
) => ReactNode

interface StepUpVerificationSheetProps {
  pendingOperationId: string
  prepared: PreparedPendingOperationStepUp
  onClose: () => void
  onCompleted: (status: 'done' | 'failed') => void
  onVerify: PendingOperationCardProps['onVerifyStepUp']
}

export function createPendingOperationCard(
  adapter: PendingOperationCardAdapter,
): PendingOperationCardComponent {
  const {
    Badge,
    BlockFrame,
    Button,
    ConfirmSheet,
    OtpInput,
    PrivacyText,
    Sheet,
    StepUp,
  } = adapter

  function StepUpVerificationSheet({
    pendingOperationId,
    prepared,
    onClose,
    onCompleted,
    onVerify,
  }: Readonly<StepUpVerificationSheetProps>) {
    const t = adapter.useTranslate()
    const { sheetRef, closeSheet } = adapter.useSheetHost()
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
        <PrivacyText>{t('stepUp.neverShare')}</PrivacyText>
      </Sheet>
    )
  }

  function PendingOperationCard({
    pendingOperation,
    onConfirmExecute,
    onPrepareStepUp,
    onVerifyStepUp,
  }: Readonly<PendingOperationCardProps>): ReactNode {
    const t = adapter.useTranslate()
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
    let actions: ReactNode
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

  return PendingOperationCard
}

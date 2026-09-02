'use client'

import { useTranslations } from 'next-intl'
import {
  SharedPendingOperationCard,
  type PendingOperationCardRenderers,
} from '@orbit/shared/chat'
import {
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
  const t = useTranslations()
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
      <p className="text-sm text-[var(--fg-3)]">{t('stepUp.neverShare')}</p>
    </Sheet>
  )
}

const pendingOperationRenderers = {
  blockFrame: (props) => <BlockFrame {...props} />,
  button: ({ label, ...props }) => <Button size="sm" {...props}>{label}</Button>,
  confirmSheet: (props) => <ConfirmSheet {...props} />,
  risk: (label) => <Badge variant="outline">{label}</Badge>,
  stepUp: (props) => <StepUp {...props} />,
  verification: (props) => <StepUpVerificationSheet {...props} />,
} satisfies PendingOperationCardRenderers

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardProps>) {
  const t = useTranslations()
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)

  return <SharedPendingOperationCard
    pendingOperation={pendingOperation}
    onConfirmExecute={onConfirmExecute}
    onPrepareStepUp={onPrepareStepUp}
    onVerifyStepUp={onVerifyStepUp}
    render={pendingOperationRenderers}
    labels={{
      approve: t('chat.operation.approve'),
      cancel: t('common.cancel'),
      confirm: t('chat.operation.confirm'),
      confirmBody: t('chat.operation.confirmBody'),
      confirmNote: t('chat.operation.confirmNote'),
      confirmTitle: t('chat.operation.confirmTitle'),
      irreversible: t('chat.operation.irreversible'),
      name: capabilityKey ? t(capabilityKey) : t('chat.operation.unknown'),
      pending: t('chat.operation.pending'),
      pendingTitle: t('chat.operation.pendingTitle'),
      risk: t(`chat.operation.risk.${pendingOperation.riskClass.toLowerCase()}`),
      stepUpAction: t('chat.operation.stepUpAction'),
      stepUpMessage: t('chat.operation.stepUpMessage'),
    }}
  />
}

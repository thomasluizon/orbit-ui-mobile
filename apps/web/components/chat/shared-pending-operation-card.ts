import { createElement, Fragment, type ReactNode } from 'react'
import { usePendingOperationCardState } from '@/hooks/use-pending-operation-card-state'
import { renderPendingOperationCard, type PendingOperationCardLabels, type PendingOperationCardRenderers as CoreRenderers, type PendingOperationVerificationProps } from '@orbit/shared/chat'
import type { PendingOperationExecutionResult, PendingOperationStepUpPreparationResult, RevisePendingOperation } from '@orbit/shared/hooks'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import { usePendingOperationRevision } from '@/hooks/use-pending-operation-revision'

export type { PendingOperationButtonSpec, PendingOperationConfirmSheetProps, PendingOperationVerificationProps } from '@orbit/shared/chat'

export type PendingOperationCardRenderers = Omit<CoreRenderers<ReactNode>, 'fragment'>

export interface PendingOperationCardProps {
  labels: PendingOperationCardLabels
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onRevise?: RevisePendingOperation
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
  onVerifyStepUp: PendingOperationVerificationProps['onVerify']
  pendingOperation: PendingAgentOperation
  render: PendingOperationCardRenderers
}

export type PendingOperationCardAdapterProps = Pick<
  PendingOperationCardProps,
  'onConfirmExecute' | 'onPrepareStepUp' | 'onVerifyStepUp' | 'onRevise' | 'pendingOperation'
>

export function SharedPendingOperationCard({
  labels,
  onConfirmExecute,
  onRevise,
  onPrepareStepUp,
  onVerifyStepUp,
  pendingOperation,
  render,
}: Readonly<PendingOperationCardProps>): ReactNode {
  const revision = usePendingOperationRevision(pendingOperation, onRevise)
  const card = usePendingOperationCardState({
    pendingOperationId: pendingOperation.id,
    previewFingerprint: revision.operation.previewFingerprint,
    onConfirmExecute,
    onPrepareStepUp,
  })

  return renderPendingOperationCard({
    card: { ...card, revision },
    labels,
    onVerifyStepUp: (...args) => card.preparedStepUp && card.isCurrent()
      ? onVerifyStepUp(...args) : Promise.resolve({ ok: false }),
    pendingOperation: revision.operation,
    render: {
      ...render,
      fragment: (...children: ReactNode[]) => createElement(Fragment, null, ...children),
    },
  })
}

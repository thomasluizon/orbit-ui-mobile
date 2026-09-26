import { createElement, Fragment, type ReactNode } from 'react'
import { usePendingOperationCardState } from '@/hooks/use-pending-operation-card-state'
import { renderPendingOperationCard, type PendingOperationCardLabels, type PendingOperationCardRenderers as CoreRenderers, type PendingOperationVerificationProps } from '@orbit/shared/chat'
import type { PendingOperationExecutionResult, PendingOperationStepUpPreparationResult } from '@orbit/shared/hooks'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'

export type { PendingOperationButtonSpec, PendingOperationConfirmSheetProps, PendingOperationVerificationProps } from '@orbit/shared/chat'

export type PendingOperationCardRenderers = Omit<CoreRenderers<ReactNode>, 'fragment'>

export interface PendingOperationCardProps {
  labels: PendingOperationCardLabels
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
  onVerifyStepUp: PendingOperationVerificationProps['onVerify']
  pendingOperation: PendingAgentOperation
  render: PendingOperationCardRenderers
}

export type PendingOperationCardAdapterProps = Pick<
  PendingOperationCardProps,
  'onConfirmExecute' | 'onPrepareStepUp' | 'onVerifyStepUp' | 'pendingOperation'
>

export function SharedPendingOperationCard({
  labels,
  onConfirmExecute,
  onPrepareStepUp,
  onVerifyStepUp,
  pendingOperation,
  render,
}: Readonly<PendingOperationCardProps>): ReactNode {
  const card = usePendingOperationCardState({
    pendingOperationId: pendingOperation.id,
    onConfirmExecute,
    onPrepareStepUp,
  })

  return renderPendingOperationCard({
    card,
    labels,
    onVerifyStepUp,
    pendingOperation,
    render: {
      ...render,
      fragment: (...children: ReactNode[]) => createElement(Fragment, null, ...children),
    },
  })
}

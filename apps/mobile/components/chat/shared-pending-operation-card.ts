'use client'

import { createElement, Fragment, type ReactNode } from 'react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import type { StepUpProps } from '@orbit/shared/contracts/overlay'
import { usePendingOperationCardState } from '@/hooks/use-pending-operation-card-state'
import type { PendingOperationExecutionResult, PendingOperationStepUpPreparationResult, PreparedPendingOperationStepUp } from '@orbit/shared/hooks'
import type { PendingOperationCardLabels } from '@orbit/shared/chat'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'

export interface PendingOperationButtonSpec {
  disabled?: boolean
  label: string
  loading?: boolean
  onClick: () => void
  variant?: 'destructive' | 'ghost' | 'primary'
}

export interface PendingOperationConfirmSheetProps {
  confirmLabel: string
  destructive: boolean
  message: string
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}

export interface PendingOperationVerificationProps {
  onClose: () => void
  onCompleted: (status: 'done' | 'failed') => void
  onVerify: PendingOperationCardProps['onVerifyStepUp']
  pendingOperationId: string
  prepared: PreparedPendingOperationStepUp
}

export interface PendingOperationCardRenderers {
  blockFrame: (props: BlockFrameProps) => ReactNode
  button: (spec: PendingOperationButtonSpec) => ReactNode
  confirmSheet: (props: PendingOperationConfirmSheetProps) => ReactNode
  risk: (label: string) => ReactNode
  stepUp: (props: StepUpProps) => ReactNode
  verification: (props: PendingOperationVerificationProps) => ReactNode
}

export interface PendingOperationCardProps {
  labels: PendingOperationCardLabels
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
  onVerifyStepUp: (
    id: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<PendingOperationExecutionResult>
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

  if (card.dismissed) return null

  const destructive = pendingOperation.riskClass === 'Destructive'
  let actions: ReactNode
  if (!card.status && pendingOperation.confirmationRequirement === 'StepUp') {
    actions = render.stepUp({
      message: labels.stepUpMessage,
      actionLabel: labels.stepUpAction,
      onAction: () => void card.startStepUp(),
      busy: card.busy,
    })
  } else if (!card.status) {
    actions = createElement(
      Fragment,
      null,
      render.button({ label: labels.cancel, variant: 'ghost', onClick: card.dismiss }),
      render.button({
        label: labels.approve,
        variant: destructive ? 'destructive' : 'primary',
        onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
      }),
    )
  }

  const blockFrame = render.blockFrame({
    state: card.busy ? 'acting' : card.status === 'failed' ? 'partiallyFailed' : 'resting',
    title: labels.pendingTitle,
    items: [{
      id: pendingOperation.id,
      label: labels.name,
      meta: labels.pending,
      status: card.status,
      irreversible: destructive && card.status == null,
    }],
    risk: render.risk(labels.risk),
    irreversibleLabel: labels.irreversible,
    confirmNote: labels.confirmNote,
    actions,
  })
  const confirmSheet = render.confirmSheet({
    open: card.confirmOpen,
    title: labels.confirmTitle,
    message: labels.confirmBody,
    confirmLabel: labels.confirm,
    destructive: true,
    onCancel: () => card.setConfirmOpen(false),
    onConfirm: () => {
      card.setConfirmOpen(false)
      void card.execute()
    },
  })
  const verification = card.preparedStepUp
    ? render.verification({
        pendingOperationId: pendingOperation.id,
        prepared: card.preparedStepUp,
        onClose: card.closeStepUp,
        onCompleted: card.completeStepUp,
        onVerify: onVerifyStepUp,
      })
    : null

  return createElement(Fragment, null, blockFrame, confirmSheet, verification)
}

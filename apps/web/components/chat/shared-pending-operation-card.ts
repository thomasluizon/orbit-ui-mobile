import { createElement, Fragment, useLayoutEffect, useRef, type ReactNode } from 'react'
import { usePendingOperationCardState } from '@/hooks/use-pending-operation-card-state'
import { renderPendingOperationCard, type PendingOperationCardLabels, type PendingOperationCardRenderers as CoreRenderers, type PendingOperationVerificationProps } from '@orbit/shared/chat'
import type { PendingOperationExecutionResult, PendingOperationStepUpPreparationResult, RefreshPendingOperation, RevisePendingOperation } from '@orbit/shared/hooks'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import { usePendingOperationRevision } from '@/hooks/use-pending-operation-revision'

export type { PendingOperationButtonSpec, PendingOperationConfirmSheetProps, PendingOperationVerificationProps } from '@orbit/shared/chat'

export type PendingOperationCardRenderers = Omit<CoreRenderers<ReactNode>, 'fragment'>

export interface PendingOperationCardProps {
  labels: PendingOperationCardLabels
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onRevise?: RevisePendingOperation
  onRefresh?: RefreshPendingOperation
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
  onVerifyStepUp: PendingOperationVerificationProps['onVerify']
  pendingOperation: PendingAgentOperation
  render: PendingOperationCardRenderers
}

export type PendingOperationCardAdapterProps = Pick<
  PendingOperationCardProps,
  'onConfirmExecute' | 'onPrepareStepUp' | 'onVerifyStepUp' | 'onRevise' | 'onRefresh' | 'pendingOperation'
>

export function SharedPendingOperationCard({
  labels,
  onConfirmExecute,
  onRevise,
  onRefresh,
  onPrepareStepUp,
  onVerifyStepUp,
  pendingOperation,
  render,
}: Readonly<PendingOperationCardProps>): ReactNode {
  const revision = usePendingOperationRevision(pendingOperation, onRevise, onRefresh)
  const card = usePendingOperationCardState({
    pendingOperationId: pendingOperation.id,
    previewFingerprint: revision.operation.previewFingerprint,
    onConfirmExecute: async (id) => {
      const result = await onConfirmExecute(id)
      if (result.stale) revision.markStale()
      return result
    },
    onPrepareStepUp: async (id) => {
      const result = await onPrepareStepUp(id)
      if (!result.ok && result.stale) revision.markStale()
      return result
    },
  })
  const staleRef = useRef(revision.stale)
  useLayoutEffect(() => { staleRef.current = revision.stale }, [revision.stale])

  return renderPendingOperationCard({
    card: {
      ...card, revision,
      confirmOpen: card.confirmOpen && !revision.stale,
      preparedStepUp: revision.stale ? undefined : card.preparedStepUp,
      execute: async () => { if (!staleRef.current) await card.execute() },
      startStepUp: async () => { if (!staleRef.current) await card.startStepUp() },
      setConfirmOpen: (open) => { if (!staleRef.current) card.setConfirmOpen(open) },
    },
    labels,
    onVerifyStepUp: async (...args) => {
      if (staleRef.current || !card.preparedStepUp || !card.isCurrent()) return { ok: false }
      const result = await onVerifyStepUp(...args)
      if (result.stale) revision.markStale()
      return result
    },
    pendingOperation: revision.operation,
    render: {
      ...render,
      fragment: (...children: ReactNode[]) => createElement(Fragment, null, ...children),
    },
  })
}

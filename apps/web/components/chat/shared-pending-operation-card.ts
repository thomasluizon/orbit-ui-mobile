import { createElement, Fragment, useLayoutEffect, useRef, type ReactNode } from 'react'
import { usePendingOperationCardState } from '@/hooks/use-pending-operation-card-state'
import { pendingOperationExecutionPatch, renderPendingOperationCard, type PendingOperationCardLabels, type PendingOperationCardRenderers as CoreRenderers, type PendingOperationVerificationProps, type PendingOperationMessageState } from '@orbit/shared/chat'
import type { PendingOperationExecutionResult, PendingOperationStepUpPreparationResult, RefreshPendingOperation, RevisePendingOperation } from '@orbit/shared/hooks'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import { usePendingOperationRevision } from '@/hooks/use-pending-operation-revision'

export type { PendingOperationButtonSpec, PendingOperationConfirmSheetProps, PendingOperationVerificationProps } from '@orbit/shared/chat'

export type PendingOperationCardRenderers = Omit<CoreRenderers<ReactNode>, 'fragment'>

export interface PendingOperationCardProps {
  labels: (operation: PendingAgentOperation) => PendingOperationCardLabels
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>
  onRevise?: RevisePendingOperation
  onRefresh?: RefreshPendingOperation
  onOpenTarget?: (entityId: string, actionType: string) => void
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>
  onVerifyStepUp: PendingOperationVerificationProps['onVerify']
  pendingOperation: PendingAgentOperation
  focusTitleOnMount?: boolean
  savedState?: PendingOperationMessageState
  onStateChange?: (patch: PendingOperationMessageState) => void
  render: PendingOperationCardRenderers
}

export type PendingOperationCardAdapterProps = Pick<
  PendingOperationCardProps,
  'onConfirmExecute' | 'onPrepareStepUp' | 'onVerifyStepUp' | 'onRevise' | 'onRefresh' | 'onOpenTarget' | 'pendingOperation' | 'focusTitleOnMount' | 'savedState' | 'onStateChange'
>

export function SharedPendingOperationCard({
  labels,
  onConfirmExecute,
  onRevise,
  onRefresh,
  onOpenTarget,
  onPrepareStepUp,
  onVerifyStepUp,
  pendingOperation,
  focusTitleOnMount,
  savedState,
  onStateChange,
  render,
}: Readonly<PendingOperationCardProps>): ReactNode {
  const revision = usePendingOperationRevision(savedState?.operation ?? pendingOperation, onRevise, onRefresh, onStateChange, savedState)
  const card = usePendingOperationCardState({
    pendingOperationId: pendingOperation.id,
    previewFingerprint: revision.operation.previewFingerprint,
    authorizationVersion: revision.authorizationVersion,
    settledState: savedState,
    onConfirmExecute: async (id) => {
      const result = await onConfirmExecute(id)
      if (result.stale) { revision.markStale(); onStateChange?.({ stale: true }) }
      if (!result.stale) onStateChange?.(pendingOperationExecutionPatch(result))
      return result
    },
    onPrepareStepUp: async (id) => {
      const result = await onPrepareStepUp(id)
      if (!result.ok && result.stale) { revision.markStale(); onStateChange?.({ stale: true }) }
      if (!result.ok && !result.stale) onStateChange?.({ status: 'failed', canRetry: true })
      return result
    },
  })
  const staleRef = useRef(revision.stale)
  useLayoutEffect(() => { staleRef.current = revision.stale }, [revision.stale])

  return renderPendingOperationCard({
    card: {
      ...card, revision, onOpenTarget, focusTitleOnMount,
      completeStepUp: (result) => { card.completeStepUp(result); onStateChange?.(pendingOperationExecutionPatch(result)) },
      dismiss: () => { card.dismiss(); onStateChange?.({ dismissed: true }) },
      confirmOpen: card.confirmOpen && !revision.stale,
      preparedStepUp: revision.stale ? undefined : card.preparedStepUp,
      closingStepUp: revision.stale ? card.preparedStepUp ?? card.closingStepUp : card.closingStepUp,
      clearClosingStepUp: () => {
        if (revision.stale && card.preparedStepUp) card.closeStepUp()
        else card.clearClosingStepUp()
      },
      execute: async () => { if (!staleRef.current) await card.execute() },
      startStepUp: async () => { if (!staleRef.current) await card.startStepUp() },
      setConfirmOpen: (open) => { if (!staleRef.current) card.setConfirmOpen(open) },
    },
    labels: labels(revision.operation),
    onVerifyStepUp: async (...args) => {
      if (staleRef.current || !card.preparedStepUp || !card.isCurrent()) return { ok: false }
      const result = await onVerifyStepUp(...args)
      if (result.stale) { revision.markStale(); onStateChange?.({ stale: true }) }
      return result
    },
    pendingOperation: revision.operation,
    render: {
      ...render,
      fragment: (...children: ReactNode[]) => createElement(Fragment, null, ...children),
    },
  })
}

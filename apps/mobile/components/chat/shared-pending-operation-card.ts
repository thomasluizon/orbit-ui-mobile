'use client'

import { createElement, Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  const [parentChoiceFocus, setParentChoiceFocus] = useState<{ request: number; shouldFocus: () => boolean; sourceId: string; sourceFingerprint: string | null | undefined; authorizationVersion: number }>()
  const chooseParent = async (itemId: string, value: unknown, ownsFocus?: () => boolean) => {
    const accepted = await revision.chooseParent(itemId, value)
    if (accepted && ownsFocus?.()) setParentChoiceFocus((current) => ({ request: (current?.request ?? 0) + 1, shouldFocus: ownsFocus, sourceId: pendingOperation.id, sourceFingerprint: pendingOperation.previewFingerprint, authorizationVersion: revision.authorizationVersion + 1 }))
    return accepted
  }
  const approvalBlocked = revision.stale || revision.busy || revision.hasTitleDrafts || revision.hasRequiredChoices
  const approvalBlockedRef = useRef(approvalBlocked)
  useLayoutEffect(() => { approvalBlockedRef.current = approvalBlocked }, [approvalBlocked])

  return renderPendingOperationCard({
    card: {
      ...card, revision: { ...revision, chooseParent }, onOpenTarget, focusTitleOnMount, parentChoiceFocus: parentChoiceFocus?.sourceId === pendingOperation.id && parentChoiceFocus.sourceFingerprint === pendingOperation.previewFingerprint && parentChoiceFocus.authorizationVersion === revision.authorizationVersion ? parentChoiceFocus : undefined,
      completeStepUp: (result) => { card.completeStepUp(result); onStateChange?.(pendingOperationExecutionPatch(result)) },
      dismiss: () => { card.dismiss(); onStateChange?.({ dismissed: true }) },
      confirmOpen: card.confirmOpen && !revision.stale,
      preparedStepUp: revision.stale ? undefined : card.preparedStepUp,
      closingStepUp: revision.stale ? card.preparedStepUp ?? card.closingStepUp : card.closingStepUp,
      clearClosingStepUp: () => {
        if (revision.stale && card.preparedStepUp) card.closeStepUp()
        else card.clearClosingStepUp()
      },
      execute: async () => { if (!approvalBlockedRef.current) await card.execute() },
      startStepUp: async () => { if (!approvalBlockedRef.current) await card.startStepUp() },
      setConfirmOpen: (open) => { if (!open || !approvalBlockedRef.current) card.setConfirmOpen(open) },
    },
    labels: labels(revision.operation),
    onVerifyStepUp: async (...args) => {
      if (approvalBlockedRef.current || !card.preparedStepUp || !card.isCurrent()) return { ok: false }
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

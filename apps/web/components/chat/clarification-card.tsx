'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ClarificationRequest, PendingAgentOperation } from '@orbit/shared/types'
import type { MessageBubbleProps, PendingOperationMessageState } from '@orbit/shared/chat'
import { useChatCardOperation } from '@/hooks/use-chat-card-operation'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { safeT } from '@/lib/i18n'
import { BlockFrame } from '@/components/ui/block-frame'
import { ActionRow } from '@/components/ui/action-row'
import { Button } from '@/components/ui/pill-button'
import { PendingOperationCard } from './pending-operation-card'

type ClarificationCardProps = Readonly<{ clarificationRequest: ClarificationRequest; entityName?: string | null; pendingOperation?: PendingAgentOperation; savedState?: PendingOperationMessageState; onPreview?: (operation: PendingAgentOperation) => void; onStateChange?: (operationId: string, patch: PendingOperationMessageState) => void } & Pick<MessageBubbleProps,
  'onPendingOperationRevise' | 'onPendingOperationRefresh' | 'onPendingOperationConfirmExecute' | 'onPendingOperationPrepareStepUp' | 'onPendingOperationVerifyStepUp' | 'onActionChipClick'>>

export function ClarificationCard({ clarificationRequest, entityName, pendingOperation: savedPreview, savedState, onPreview, onStateChange, onPendingOperationRevise, onPendingOperationRefresh, onPendingOperationConfirmExecute, onPendingOperationPrepareStepUp, onPendingOperationVerifyStepUp, onActionChipClick }: ClarificationCardProps) {
  const t = useTranslations()
  const resolve = useResolveClarification()
  const trackCardOperation = useChatCardOperation()
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<PendingAgentOperation | null>(null)
  const pendingOperation = savedPreview ?? localPreview
  const choose = async (label: string, value: string) => {
    setErrorKey(null)
    try {
      const result = await trackCardOperation(() => resolve.mutateAsync({ operationId: clarificationRequest.operationId, value }))
      if (!result.ok) setErrorKey(errorKeyForStatus(result.status))
      else if (result.data.operation.status === 'PendingConfirmation' && result.data.pendingOperation) {
        setLocalPreview(result.data.pendingOperation)
        onPreview?.(result.data.pendingOperation)
      }
      else if (result.data.operation.status !== 'Succeeded') setErrorKey('habits.clarification.errorGeneric')
      else setResolvedLabel(label)
    } catch {
      setErrorKey('habits.clarification.errorGeneric')
    }
  }
  const showPreview = pendingOperation && onPendingOperationConfirmExecute && onPendingOperationPrepareStepUp && onPendingOperationVerifyStepUp
  return (
    <>
    <span role="status" aria-live="polite" className="sr-only">{showPreview ? t('chat.operation.pendingTitle') : ''}</span>
    {showPreview ? <PendingOperationCard pendingOperation={pendingOperation} savedState={savedState} onStateChange={(patch) => onStateChange?.(pendingOperation.id, patch)} focusTitleOnMount onRevise={onPendingOperationRevise} onRefresh={onPendingOperationRefresh} onConfirmExecute={onPendingOperationConfirmExecute} onPrepareStepUp={onPendingOperationPrepareStepUp} onVerifyStepUp={onPendingOperationVerifyStepUp} onOpenTarget={onActionChipClick} /> : <BlockFrame state={resolve.isPending ? 'acting' : 'resting'} title={safeT(t, clarificationRequest.question)} items={[]} actions={(
      <div className="flex flex-col items-start gap-3">
        {resolvedLabel ? <p role="status" className="text-sm text-[var(--fg-2)]">{t('habits.clarification.successCreated', { name: entityName ?? resolvedLabel })}</p> : (
          <ActionRow>{clarificationRequest.quickActions.map((action) => {
            const label = safeT(t, action.label)
            return <Button key={action.value} variant="ghost" size="sm" disabled={resolve.isPending} onClick={() => void choose(label, action.value)}>{label}</Button>
          })}</ActionRow>
        )}
        {errorKey ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t(errorKey)}</p> : null}
      </div>
    )} />}
    </>
  )
}

function errorKeyForStatus(status: number): string {
  if (status === 404 || status === 410) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}

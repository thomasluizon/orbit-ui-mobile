import { useEffect, useState } from 'react'
import { AccessibilityInfo, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClarificationRequest, PendingAgentOperation } from '@orbit/shared/types'
import type { MessageBubbleProps, PendingOperationMessageState } from '@orbit/shared/chat'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { BlockFrame } from '@/components/ui/block-frame'
import { ActionRow } from '@/components/ui/action-row'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { PendingOperationCard } from './pending-operation-card'

type ClarificationCardProps = Readonly<{ clarificationRequest: ClarificationRequest; entityName?: string | null; pendingOperation?: PendingAgentOperation; savedState?: PendingOperationMessageState; onPreview?: (operation: PendingAgentOperation) => void; onStateChange?: (operationId: string, patch: PendingOperationMessageState) => void } & Pick<MessageBubbleProps,
  'onPendingOperationRevise' | 'onPendingOperationRefresh' | 'onPendingOperationConfirmExecute' | 'onPendingOperationPrepareStepUp' | 'onPendingOperationVerifyStepUp' | 'onActionChipClick'>>

export function ClarificationCard({ clarificationRequest, entityName, pendingOperation: savedPreview, savedState, onPreview, onStateChange, onPendingOperationRevise, onPendingOperationRefresh, onPendingOperationConfirmExecute, onPendingOperationPrepareStepUp, onPendingOperationVerifyStepUp, onActionChipClick }: ClarificationCardProps) {
  const { t } = useTranslation()
  const resolve = useResolveClarification()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<PendingAgentOperation | null>(null)
  const pendingOperation = savedPreview ?? localPreview
  useEffect(() => {
    if (pendingOperation) AccessibilityInfo.announceForAccessibility(t('chat.operation.pendingTitle'))
  }, [pendingOperation, t])
  const choose = async (label: string, value: string) => {
    setErrorKey(null)
    try {
      const result = await resolve.mutateAsync({ operationId: clarificationRequest.operationId, value })
      if (result.operation.status === 'PendingConfirmation' && result.pendingOperation) {
        setLocalPreview(result.pendingOperation)
        onPreview?.(result.pendingOperation)
      }
      else if (result.operation.status !== 'Succeeded') setErrorKey('habits.clarification.errorGeneric')
      else setResolvedLabel(label)
    } catch (error: unknown) {
      setErrorKey(errorKeyForStatus(errorStatus(error)))
    }
  }
  if (pendingOperation && onPendingOperationConfirmExecute && onPendingOperationPrepareStepUp && onPendingOperationVerifyStepUp) return (
    <PendingOperationCard pendingOperation={pendingOperation} savedState={savedState} onStateChange={(patch) => onStateChange?.(pendingOperation.id, patch)} focusTitleOnMount onRevise={onPendingOperationRevise} onRefresh={onPendingOperationRefresh} onConfirmExecute={onPendingOperationConfirmExecute} onPrepareStepUp={onPendingOperationPrepareStepUp} onVerifyStepUp={onPendingOperationVerifyStepUp} onOpenTarget={onActionChipClick} />
  )
  return (
    <BlockFrame state={resolve.isPending ? 'acting' : 'resting'} title={t(clarificationRequest.question, { defaultValue: clarificationRequest.question })} items={[]} actions={(
      <View style={{ alignItems: 'flex-start', gap: 12 }}>
        {resolvedLabel ? <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2 }}>{t('habits.clarification.successCreated', { name: entityName ?? resolvedLabel })}</Text> : (
          <ActionRow>{clarificationRequest.quickActions.map((action) => {
            const label = t(action.label, { defaultValue: action.label })
            return <Button key={action.value} variant="ghost" size="sm" disabled={resolve.isPending} onClick={() => void choose(label, action.value)}>{label}</Button>
          })}</ActionRow>
        )}
        {errorKey ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText }}>{t(errorKey)}</Text> : null}
      </View>
    )} />
  )
}

function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 0
  return typeof error.status === 'number' ? error.status : 0
}

function errorKeyForStatus(status: number): string {
  if (status === 404 || status === 410) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}

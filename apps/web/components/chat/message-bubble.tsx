'use client'

import { useState, useMemo } from 'react'
import { ArrowUpRight } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { MessageBubbleProps } from '@orbit/shared/chat'
import {
  getRelatedSurfaces,
  getChatMessageParts,
  hasChatProse,
  partitionMessageActions,
  selectMessageOperationBlocks,
  stripChatDirectives,
  updatePendingOperationMessage,
  attachClarificationPreview,
} from '@orbit/shared/chat'
import { useChatStore } from '@/stores/chat-store'
import { LocalImage } from '@/components/ui/local-image'
import { Markdown } from '@/components/ui/markdown'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { ClarificationCard } from './clarification-card'
import { PendingOperationCard } from './pending-operation-card'
import { OperationOutcomes } from './operation-outcomes'
import { ChatBlock } from './block-registry'

export function MessageBubble({
  message,
  senderLabelId,
  animateEntry,
  isStreaming = false,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationRevise,
  onPendingOperationRefresh,
  onPendingOperationConfirmExecute,
  onPendingOperationPrepareStepUp,
  onPendingOperationVerifyStepUp,
}: Readonly<MessageBubbleProps & { senderLabelId?: string }>) {
  const t = useTranslations()
  const router = useRouter()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())
  const relatedSurfaces = useMemo(
    () => getRelatedSurfaces(message.relatedSurfaces),
    [message.relatedSurfaces],
  )
  const operationBlocks = useMemo(() => selectMessageOperationBlocks(message), [message])

  const {
    clarificationActions,
    nonSuggestionActions,
    suggestionActions,
  } = useMemo(
    () => partitionMessageActions(operationBlocks.actions, message.policyDenials),
    [operationBlocks.actions, message.policyDenials],
  )

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]))
  }

  const isUser = message.role === 'user'
  const parts = isUser ? [{ type: 'text' as const, text: message.content }] : getChatMessageParts(message, isStreaming)

  return (
    <div
      className={`${animateEntry ? 'animate-msg-in ' : ''}flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 8 }}
    >
      <div
        className={
          isUser
            ? 'max-w-[80%] flex flex-col items-end'
            : 'flex-1 min-w-0 flex flex-col gap-4'
        }
      >
        <span id={senderLabelId} className="sr-only">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        {parts.map((part, index) => {
          if (!part) return null
          if (part.type === 'block') return <ChatBlock key={index} part={part} onActionChipClick={onActionChipClick} />
          const sourceText = stripChatDirectives(part.text, isStreaming)
          if (!isUser && !hasChatProse(sourceText) && !(index === 0 && message.imageUrl)) return null
          return <div
            key={index}
            data-bubble-role={isUser ? 'user' : 'ai'}
            className={isUser
              ? 'select-text inline-block max-w-full bg-[var(--bg-well)] text-[var(--fg-1)]'
              : 'select-text inline-block max-w-full md:max-w-[65ch] text-[var(--fg-1)]'}
            style={{ padding: isUser ? '12px 16px' : 0, borderRadius: isUser ? 16 : 0 }}
          >
            {index === 0 && message.imageUrl && <LocalImage
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              loading="lazy"
              className="rounded-[12px] w-[200px] max-w-full h-48 object-cover mb-2"
              style={{ border: '1px solid var(--hairline)' }}
            />}
            <Markdown copyableBlocks={!isUser} className="thread-prose" content={isUser ? part.text : sourceText} />
          </div>
        })}

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="w-full">
            <span
              className="block"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-3)',
                marginBottom: 4,
                paddingLeft: 4,
              }}
            >
              {t('chat.related.title')}
            </span>
            <div className="flex flex-wrap gap-2">
              {relatedSurfaces.map((surface) => (
                <button
                  key={surface.id}
                  type="button"
                  onClick={() => router.push(surface.webRoute)}
                  className="chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60"
                >
                  {t(surface.labelKey)}
                  <ArrowUpRight size={16} strokeWidth={1.8} color="var(--fg-3)" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

        {!isUser && suggestionActions.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {suggestionActions.map((action) => {
              const actionKey = action.entityId ?? action.entityName ?? 'suggestion'
              return dismissedBreakdowns.has(actionKey) ? null : (
                <BreakdownSuggestion
                  key={actionKey}
                  parentName={action.entityName || 'Habit'}
                  subHabits={action.suggestedSubHabits ?? []}
                  warning={action.conflictWarning}
                  onConfirmed={() => onBreakdownConfirmed?.()}
                  onCancelled={() => dismissBreakdown(actionKey)}
                />
              )
            })}
          </div>
        )}

        {!isUser && clarificationActions.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {clarificationActions.map((action) => (
              <ClarificationCard
                key={action.clarificationRequest.operationId}
                pendingOperation={message.clarificationPreviews?.[action.clarificationRequest.operationId]}
                onPreview={(operation) => useChatStore.getState().transitionMessage(message.id, (current) => attachClarificationPreview(current, action.clarificationRequest.operationId, operation))}
                savedState={message.pendingOperationStates?.[message.clarificationPreviews?.[action.clarificationRequest.operationId]?.id ?? '']}
                onStateChange={(operationId, patch) => useChatStore.getState().transitionMessage(message.id, (current) => updatePendingOperationMessage(current, operationId, patch))}
                clarificationRequest={action.clarificationRequest}
                entityName={action.entityName}
                onPendingOperationRevise={onPendingOperationRevise}
                onPendingOperationRefresh={onPendingOperationRefresh}
                onPendingOperationConfirmExecute={onPendingOperationConfirmExecute}
                onPendingOperationPrepareStepUp={onPendingOperationPrepareStepUp}
                onPendingOperationVerifyStepUp={onPendingOperationVerifyStepUp}
                onActionChipClick={onActionChipClick}
              />
            ))}
          </div>
        )}

        {!isUser && message.pendingOperations && message.pendingOperations.length > 0 && onPendingOperationConfirmExecute && onPendingOperationPrepareStepUp && onPendingOperationVerifyStepUp && (
          <div className="flex w-full flex-col gap-4">
            {message.pendingOperations.map((pendingOperation) => (
              <PendingOperationCard
                key={pendingOperation.id}
                pendingOperation={pendingOperation}
                savedState={message.pendingOperationStates?.[pendingOperation.id]}
                onStateChange={(patch) => useChatStore.getState().transitionMessage(message.id, (current) => updatePendingOperationMessage(current, pendingOperation.id, patch))}
                onRevise={onPendingOperationRevise}
                onRefresh={onPendingOperationRefresh}
                onOpenTarget={onActionChipClick}
                onConfirmExecute={onPendingOperationConfirmExecute}
                onPrepareStepUp={onPendingOperationPrepareStepUp}
                onVerifyStepUp={onPendingOperationVerifyStepUp}
              />
            ))}
          </div>
        )}

        {!isUser && operationBlocks.outcomes.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            <OperationOutcomes outcomes={operationBlocks.outcomes} />
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useMemo } from 'react'
import { Sparkles, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChatMessage } from '@orbit/shared/types/chat'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { formatChatMessage } from './format-chat-message'
import { PendingOperationCard } from './pending-operation-card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
  onBreakdownConfirmed?: () => void
  onActionChipClick?: (entityId: string, actionType: string) => void
  onPendingOperationConfirmExecute?: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; response?: AgentExecuteOperationResponse }>
  onPendingOperationPrepareStepUp?: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; challengeId?: string; confirmationToken?: string }>
  onPendingOperationVerifyStepUp?: (
    pendingOperationId: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<{ ok: boolean; error?: string; response?: AgentExecuteOperationResponse }>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageBubble({
  message,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationConfirmExecute,
  onPendingOperationPrepareStepUp,
  onPendingOperationVerifyStepUp,
}: Readonly<MessageBubbleProps>) {
  const t = useTranslations()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())

  const suggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) => a.status === 'Suggestion' && a.suggestedSubHabits?.length,
      ) ?? [],
    [message.actions],
  )

  const nonSuggestionActions = useMemo(
    () => message.actions?.filter((a) => a.status !== 'Suggestion') ?? [],
    [message.actions],
  )

  const operationResults = useMemo(
    () =>
      message.operations?.filter((operation) => operation.status !== 'PendingConfirmation') ?? [],
    [message.operations],
  )

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]))
  }

  const isUser = message.role === 'user'

  return (
    <div
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      aria-label={isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
    >
      {/* AI avatar */}
      {!isUser && (
        <div
          className="shrink-0 size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center self-end"
          aria-hidden="true"
        >
          <Sparkles className="size-5 text-primary" />
        </div>
      )}

      <div
        className={`max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
      >
        {/* Sender label */}
        <span className="text-[11px] font-medium text-text-secondary mb-1 px-2">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        <div
          className={`px-4 py-3 text-sm ${
            isUser
              ? 'bg-linear-to-br from-primary to-primary/80 text-white rounded-2xl rounded-br-md shadow-[var(--shadow-sm)]'
              : 'bg-surface-elevated text-text-primary rounded-2xl rounded-bl-md shadow-[var(--shadow-sm)]'
          }`}
        >
          {/* User-attached image */}
          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              className="rounded-xl max-h-48 mb-2"
            />
          )}
          <p
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: formatChatMessage(message.content ?? ''),
            }}
          />
        </div>

        {/* Action chips for AI messages */}
        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

        {/* Breakdown suggestions */}
        {!isUser && suggestionActions.length > 0 && (
          <div className="space-y-3 mt-3 w-full">
            {suggestionActions.map((action) => {
              const actionKey = action.entityId ?? action.entityName ?? 'suggestion'
              return dismissedBreakdowns.has(actionKey) ? null : (
                <BreakdownSuggestion
                  key={actionKey}
                  parentName={action.entityName || 'Habit'}
                  subHabits={action.suggestedSubHabits ?? []}
                  onConfirmed={() => onBreakdownConfirmed?.()}
                  onCancelled={() => dismissBreakdown(actionKey)}
                />
              )
            })}
          </div>
        )}

        {!isUser && message.pendingOperations && message.pendingOperations.length > 0 && onPendingOperationConfirmExecute && onPendingOperationPrepareStepUp && onPendingOperationVerifyStepUp && (
          <div className="mt-3 w-full space-y-3">
            {message.pendingOperations.map((pendingOperation) => (
              <PendingOperationCard
                key={pendingOperation.id}
                pendingOperation={pendingOperation}
                onConfirmExecute={onPendingOperationConfirmExecute}
                onPrepareStepUp={onPendingOperationPrepareStepUp}
                onVerifyStepUp={onPendingOperationVerifyStepUp}
              />
            ))}
          </div>
        )}

        {!isUser && operationResults.length > 0 && (
          <div className="mt-3 w-full space-y-2">
            {operationResults.map((operation) => (
              <div
                key={`${operation.operationId}-${operation.targetId ?? operation.sourceName}`}
                className="rounded-[var(--radius-xl)] border border-border bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-text-primary">
                    {operation.summary ?? operation.sourceName}
                  </p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {operation.status}
                  </span>
                </div>
                {operation.policyReason && (
                  <p className="mt-1 text-[11px] text-text-secondary">{operation.policyReason}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {!isUser && message.policyDenials && message.policyDenials.length > 0 && (
          <div className="mt-3 w-full space-y-2">
            {message.policyDenials.map((denial) => (
              <div
                key={`${denial.operationId}-${denial.pendingOperationId ?? denial.reason}`}
                className="rounded-[var(--radius-xl)] border border-red-500/20 bg-red-500/8 px-3 py-2"
              >
                <p className="text-xs font-medium text-red-300">{denial.sourceName}</p>
                <p className="mt-1 text-[11px] text-red-200/90">{denial.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div
          className="shrink-0 size-10 rounded-full border-2 border-primary/20 bg-surface-elevated flex items-center justify-center self-end"
          aria-hidden="true"
        >
          <User className="size-5 text-text-secondary" />
        </div>
      )}
    </div>
  )
}

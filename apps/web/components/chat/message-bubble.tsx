'use client'

import { useState, useMemo } from 'react'
import { Sparkles, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChatMessage } from '@orbit/shared/types/chat'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { resolveUpgradeEntitlementFromPolicyDenial } from '@orbit/shared/utils'
import { LocalImage } from '@/components/ui/local-image'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { ClarificationCard } from './clarification-card'
import { formatChatMessage } from './format-chat-message'
import { PendingOperationCard } from './pending-operation-card'

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
  onUpgradeClick?: () => void
}

export function MessageBubble({
  message,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationConfirmExecute,
  onPendingOperationPrepareStepUp,
  onPendingOperationVerifyStepUp,
  onUpgradeClick,
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

  const clarificationActions = useMemo(
    () =>
      (message.actions ?? []).filter(
        (a): a is typeof a & { clarificationRequest: NonNullable<typeof a.clarificationRequest> } =>
          a.status === 'NeedsClarification' && a.clarificationRequest != null,
      ),
    [message.actions],
  )

  const nonSuggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) => a.status !== 'Suggestion' && a.status !== 'NeedsClarification',
      ) ?? [],
    [message.actions],
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
      {!isUser && (
        <div
          className="shrink-0 size-10 rounded-full bg-[var(--bg-elev)] border border-[var(--hairline-strong)] flex items-center justify-center self-end"
          aria-hidden="true"
        >
          <Sparkles className="size-5 text-[var(--primary)]" />
        </div>
      )}

      <div
        className={`max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
      >
        <span className="text-[11px] font-medium text-[var(--fg-2)] mb-1 px-2">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        <div
          data-bubble-role={isUser ? 'user' : 'ai'}
          className={`px-4 py-3 text-sm ${
            isUser
              ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] rounded-2xl rounded-br-md shadow-[var(--shadow-sm)]'
              : 'bg-[var(--bg-elev)] text-[var(--fg-1)] rounded-2xl rounded-bl-md shadow-[var(--shadow-sm)]'
          }`}
        >
          {message.imageUrl && (
            <LocalImage
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

        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

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

        {!isUser && clarificationActions.length > 0 && (
          <div className="space-y-3 mt-3 w-full">
            {clarificationActions.map((action) => (
              <ClarificationCard
                key={action.clarificationRequest.operationId}
                clarificationRequest={action.clarificationRequest}
                entityName={action.entityName}
              />
            ))}
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

        {!isUser && message.policyDenials && message.policyDenials.length > 0 && (
          <div className="mt-3 w-full space-y-2">
            {message.policyDenials.map((denial) => {
              const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(denial)

              return (
                <div
                  key={`${denial.operationId}-${denial.pendingOperationId ?? denial.reason}`}
                  className="rounded-[var(--radius-xl)] border border-[var(--status-bad)]/20 bg-[var(--status-bad)]/8 px-3 py-2"
                >
                  <p className="text-xs font-medium text-[var(--status-bad)]">{denial.sourceName}</p>
                  <p className="mt-1 text-[11px] text-[var(--status-bad)]/90">{denial.reason}</p>
                  {upgradeResolution.shouldUpgrade && onUpgradeClick && (
                    <button
                      type="button"
                      onClick={onUpgradeClick}
                      className="mt-3 inline-flex items-center rounded-full bg-[var(--primary)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[var(--primary-pressed)]"
                    >
                      {t('upgrade.subscribe')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isUser && (
        <div
          className="shrink-0 size-10 rounded-full border-2 border-[var(--hairline-strong)] bg-[var(--bg-elev)] flex items-center justify-center self-end"
          aria-hidden="true"
        >
          <User className="size-5 text-[var(--fg-2)]" />
        </div>
      )}
    </div>
  )
}

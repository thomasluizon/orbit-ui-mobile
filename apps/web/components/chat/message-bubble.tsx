'use client'

import { useState, useMemo } from 'react'
import { Sparkles, User, ArrowUpRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { ChatMessage } from '@orbit/shared/types/chat'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { getRelatedSurfaces } from '@orbit/shared/chat'
import { resolveUpgradeEntitlementFromPolicyDenial } from '@orbit/shared/utils'
import { LocalImage } from '@/components/ui/local-image'
import { Markdown } from '@/components/ui/markdown'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { ClarificationCard } from './clarification-card'
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
  const router = useRouter()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())
  const [traceCopied, setTraceCopied] = useState(false)

  const relatedSurfaces = useMemo(
    () => getRelatedSurfaces(message.relatedSurfaces),
    [message.relatedSurfaces],
  )

  async function copyTraceId(correlationId: string) {
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(correlationId)
    setTraceCopied(true)
    setTimeout(() => setTraceCopied(false), 2000)
  }

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
              ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] rounded-[12px] rounded-br-[4px]'
              : 'bg-[var(--bg-elev)] text-[var(--fg-1)] rounded-[12px] rounded-bl-[4px]'
          }`}
        >
          {message.imageUrl && (
            <LocalImage
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              className="rounded-xl max-h-48 mb-2"
            />
          )}
          <Markdown content={message.content ?? ''} />
        </div>

        {!isUser && message.correlationId && (
          <button
            type="button"
            onClick={() => copyTraceId(message.correlationId as string)}
            aria-label={t('chat.trace.copy')}
            className="mt-1 px-2 py-1 text-[11px] text-[var(--fg-2)] hover:text-[var(--fg-1)] transition-colors"
          >
            {traceCopied
              ? t('chat.trace.copied')
              : t('chat.trace.label', { id: message.correlationId })}
          </button>
        )}

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="mt-2 w-full">
            <span className="block text-[11px] font-medium text-[var(--fg-2)] mb-1.5 px-1">
              {t('chat.related.title')}
            </span>
            <div className="flex flex-wrap gap-2">
              {relatedSurfaces.map((surface) => (
                <button
                  key={surface.id}
                  type="button"
                  onClick={() => router.push(surface.webRoute)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border border-[var(--hairline)] bg-[var(--bg-elev)] text-[var(--fg-2)] hover:text-[var(--fg-1)] hover:scale-[1.02] transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {t(surface.labelKey)}
                  <ArrowUpRight className="size-2.5" />
                </button>
              ))}
            </div>
          </div>
        )}

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
                  className="rounded-[12px] border border-[var(--status-bad)]/20 bg-[var(--status-bad)]/8 px-3 py-2"
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

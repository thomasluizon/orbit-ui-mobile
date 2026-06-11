'use client'

import { useState, useMemo } from 'react'
import { Sparkles, ArrowUpRight } from 'lucide-react'
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

  const relatedSurfaces = useMemo(
    () => getRelatedSurfaces(message.relatedSurfaces),
    [message.relatedSurfaces],
  )

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
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 10, padding: '0 16px', marginBottom: 16 }}
      aria-label={isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
    >
      {!isUser && (
        <div
          data-slot="ai-avatar"
          className="shrink-0 rounded-full flex items-center justify-center self-start"
          style={{
            width: 30,
            height: 30,
            background: 'rgba(var(--primary-rgb), 0.18)',
          }}
          aria-hidden="true"
        >
          <Sparkles size={16} strokeWidth={1.8} color="var(--primary-soft)" />
        </div>
      )}

      <div
        className={
          isUser
            ? 'max-w-[82%] flex flex-col items-end'
            : 'flex-1 min-w-0 flex flex-col items-start'
        }
      >
        <span className="sr-only">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        <div
          data-bubble-role={isUser ? 'user' : 'ai'}
          className={
            isUser
              ? 'bg-[var(--primary)] text-[var(--fg-on-primary)]'
              : 'inline-block max-w-full bg-[var(--bg-elev)] text-[var(--fg-1)]'
          }
          style={{
            padding: '12px 15px',
            borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
          }}
        >
          {message.imageUrl && (
            <LocalImage
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              className="rounded-[12px] max-h-48 mb-2"
            />
          )}
          <Markdown content={message.content ?? ''} />
        </div>

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="mt-2 w-full">
            <span
              className="block"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--fg-3)',
                marginBottom: 6,
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
                  className="inline-flex items-center cursor-pointer rounded-full border-0 bg-[var(--bg-elev)] text-[var(--fg-1)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60"
                  style={{
                    gap: 6,
                    minHeight: 36,
                    padding: '0 14px',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
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
                  className="rounded-[16px] px-3 py-2"
                  style={{
                    background: 'color-mix(in srgb, var(--status-bad) 8%, transparent)',
                    boxShadow:
                      'inset 0 0 0 1px color-mix(in srgb, var(--status-bad) 20%, transparent)',
                  }}
                >
                  <p className="text-xs font-medium text-[var(--status-bad)]">{denial.sourceName}</p>
                  <p className="mt-1 text-[11px] text-[var(--status-bad)]/90">{denial.reason}</p>
                  {upgradeResolution.shouldUpgrade && onUpgradeClick && (
                    <button
                      type="button"
                      onClick={onUpgradeClick}
                      className="mt-3 inline-flex items-center rounded-full bg-[var(--primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--fg-on-primary)] transition-colors hover:bg-[var(--primary-pressed)]"
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
    </div>
  )
}

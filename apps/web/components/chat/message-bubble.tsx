'use client'

import { useState, useMemo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { ChatMessage } from '@orbit/shared/types/chat'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { getRelatedSurfaces, stripHabitListDirective } from '@orbit/shared/chat'
import { resolveUpgradeEntitlementFromPolicyDenial } from '@orbit/shared/utils'
import { AstraMark } from '@/components/ui/astra-avatar'
import { LocalImage } from '@/components/ui/local-image'
import { Markdown } from '@/components/ui/markdown'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { ClarificationCard } from './clarification-card'
import { GoalListCard } from './goal-list-card'
import { HabitListCard } from './habit-list-card'
import { PendingOperationCard } from './pending-operation-card'

interface MessageBubbleProps {
  message: ChatMessage
  animateEntry?: boolean
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
  animateEntry,
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

  const hasUpgradeDenial = useMemo(
    () =>
      (message.policyDenials ?? []).some(
        (denial) => resolveUpgradeEntitlementFromPolicyDenial(denial).shouldUpgrade,
      ),
    [message.policyDenials],
  )

  const nonSuggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) =>
          a.status !== 'Suggestion' &&
          a.status !== 'NeedsClarification' &&
          !(hasUpgradeDenial && a.status === 'Failed'),
      ) ?? [],
    [message.actions, hasUpgradeDenial],
  )

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]))
  }

  const isUser = message.role === 'user'

  return (
    <div
      className={`${animateEntry ? 'animate-msg-in ' : ''}flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 10, padding: '0 16px', marginBottom: 16 }}
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
          <AstraMark size={16} />
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
              : 'inline-block max-w-full md:max-w-[65ch] bg-[var(--bg-elev)] text-[var(--fg-1)]'
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
              className="rounded-[12px] w-[200px] h-48 object-cover mb-2"
              style={{ border: '1px solid var(--hairline)' }}
            />
          )}
          <Markdown content={stripHabitListDirective(message.content ?? '')} />
        </div>

        {!isUser && message.habitList && (
          <HabitListCard habitList={message.habitList} />
        )}

        {!isUser && message.goalList && (
          <GoalListCard goalList={message.goalList} />
        )}

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="mt-2 w-full">
            <span
              className="block"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
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
          <div className="space-y-3 mt-3 w-full md:max-w-[65ch]">
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
          <div className="space-y-3 mt-3 w-full md:max-w-[65ch]">
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
          <div className="mt-3 w-full md:max-w-[65ch] space-y-3">
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
          <div className="mt-3 w-full md:max-w-[65ch] space-y-2">
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
                  <p className="text-xs font-medium text-[var(--status-bad-text)]">
                    {upgradeResolution.shouldUpgrade ? t('chat.proGate.title') : denial.sourceName}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--status-bad-text)]">
                    {upgradeResolution.shouldUpgrade ? t('chat.proGate.body') : denial.reason}
                  </p>
                  {upgradeResolution.shouldUpgrade && onUpgradeClick && (
                    <button
                      type="button"
                      onClick={onUpgradeClick}
                      className="touch-target-y mt-3 inline-flex items-center rounded-full bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold text-[var(--fg-on-primary)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--primary-pressed)] active:scale-[0.96]"
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

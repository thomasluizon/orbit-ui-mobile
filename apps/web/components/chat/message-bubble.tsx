'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { ArrowUpRight } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { MessageBubbleProps } from '@orbit/shared/chat'
import {
  getRelatedSurfaces,
  partitionMessageActions,
  stripChatDirectives,
} from '@orbit/shared/chat'
import { LocalImage } from '@/components/ui/local-image'
import { Markdown } from '@/components/ui/markdown'
import { PillButton } from '@/components/ui/pill-button'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { ClarificationCard } from './clarification-card'
import { GoalListCard } from './goal-list-card'
import { HabitListCard } from './habit-list-card'
import { MetricsCard } from './metrics-card'
import { PeriodInsightCard } from './period-insight-card'
import { DaySummaryCard } from './day-summary-card'
import { StreakCard } from './streak-card'
import { CalendarCard } from './calendar-card'
import { RecordListCard } from './record-list-card'
import { AccountRowsCard } from './account-rows-card'
import { PendingOperationCard } from './pending-operation-card'
import { OperationOutcomes } from './operation-outcomes'

function MessageMetricsBlocks({ message, isStreaming }: Readonly<Pick<MessageBubbleProps, 'message'> & { isStreaming: boolean }>) {
  if (isStreaming || message.role === 'user') return null
  return (
    <>
      {message.metricsCard ? <MetricsCard metricsCard={message.metricsCard} /> : null}
      {message.periodInsight ? <PeriodInsightCard periodInsight={message.periodInsight} /> : null}
      {message.daySummary ? <DaySummaryCard daySummary={message.daySummary} /> : null}
      {message.streakCard ? <StreakCard streakCard={message.streakCard} /> : null}
      {message.calendarCard ? <CalendarCard calendarCard={message.calendarCard} /> : null}
      {message.recordList ? <RecordListCard recordList={message.recordList} /> : null}
      {message.accountRows ? <AccountRowsCard accountRows={message.accountRows} /> : null}
    </>
  )
}

export function MessageBubble({
  message,
  animateEntry,
  isStreaming = false,
  onBreakdownConfirmed,
  onActionChipClick,
  onPendingOperationRevise,
  onPendingOperationRefresh,
  onPendingOperationConfirmExecute,
  onPendingOperationPrepareStepUp,
  onPendingOperationVerifyStepUp,
}: Readonly<MessageBubbleProps>) {
  const t = useTranslations()
  const router = useRouter()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
  }, [])

  const relatedSurfaces = useMemo(
    () => getRelatedSurfaces(message.relatedSurfaces),
    [message.relatedSurfaces],
  )

  const {
    clarificationActions,
    nonSuggestionActions,
    suggestionActions,
  } = useMemo(
    () => partitionMessageActions(message.actions, message.policyDenials),
    [message.actions, message.policyDenials],
  )

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]))
  }

  const isUser = message.role === 'user'
  const sourceText = stripChatDirectives(message.content, false)

  async function copySourceText() {
    await globalThis.navigator.clipboard.writeText(sourceText)
    setCopied(true)
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    copyResetTimer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className={`${animateEntry ? 'animate-msg-in ' : ''}flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 8 }}
    >
      <div
        className={
          isUser
            ? 'max-w-[80%] flex flex-col items-end'
            : 'flex-1 min-w-0 flex flex-col items-start gap-2'
        }
      >
        <span className="sr-only">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        <div
          data-bubble-role={isUser ? 'user' : 'ai'}
          className={
            isUser
              ? 'inline-block max-w-full bg-[var(--bg-well)] text-[var(--fg-1)]'
              : 'inline-block max-w-full md:max-w-[65ch] text-[var(--fg-1)]'
          }
          style={{
            padding: isUser ? '12px 16px' : 0,
            borderRadius: isUser ? 16 : 0,
          }}
        >
          {message.imageUrl && (
            <LocalImage
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              loading="lazy"
              className="rounded-[12px] w-[200px] h-48 object-cover mb-2"
              style={{ border: '1px solid var(--hairline)' }}
            />
          )}
          <Markdown
            className="thread-prose"
            content={isUser ? message.content : stripChatDirectives(message.content, isStreaming)}
          />
        </div>

        {!isUser && sourceText.trim() && (
          <PillButton variant="ghost" size="sm" onClick={() => void copySourceText()}>
            {copied ? t('chat.copied') : t('chat.copy')}
          </PillButton>
        )}

        {!isUser && message.habitList && (
          <HabitListCard habitList={message.habitList} />
        )}

        {!isUser && message.goalList && (
          <GoalListCard goalList={message.goalList} onOpenGoal={(id) => onActionChipClick?.(id, 'CreateGoal')} />
        )}

        <MessageMetricsBlocks message={message} isStreaming={isStreaming} />

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="mt-2 w-full">
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
          <div className="mt-3 flex w-full flex-col gap-3 md:max-w-[65ch]">
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
          <div className="mt-3 flex w-full flex-col gap-3 md:max-w-[65ch]">
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
          <div className="mt-3 flex w-full flex-col gap-3 md:max-w-[65ch]">
            {message.pendingOperations.map((pendingOperation) => (
              <PendingOperationCard
                key={pendingOperation.id}
                pendingOperation={pendingOperation}
                onRevise={onPendingOperationRevise}
                onRefresh={onPendingOperationRefresh}
                onConfirmExecute={onPendingOperationConfirmExecute}
                onPrepareStepUp={onPendingOperationPrepareStepUp}
                onVerifyStepUp={onPendingOperationVerifyStepUp}
              />
            ))}
          </div>
        )}

        {!isUser && ((message.operations?.length ?? 0) > 0 || (message.policyDenials?.length ?? 0) > 0) && (
          <div className="mt-3 flex w-full flex-col gap-3 md:max-w-[65ch]">
            <OperationOutcomes operations={message.operations ?? []} denials={message.policyDenials ?? []} />
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { chatTraceLabelKey } from '@orbit/shared/chat'
import { APP_BAR_CONTROL_CLASS, AppBar } from '@/components/ui/app-bar'
import type { useChatComposer } from '@/hooks/use-chat-composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { ChevronDown, RefreshCw, X } from '@/components/ui/icons'
import { WorkingMark } from '@/components/ui/toast'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { ChatEmptyState } from './chat-empty-state'
import { FollowUpChips } from './follow-up-chips'

function ThinkingTrace({ steps, running }: Readonly<{
  steps: readonly { domain: string; access: string }[]
  running: boolean
}>) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  if (steps.length === 0) return null
  const lines = steps.map((step, index) => <div key={`${step.domain}-${step.access}-${index}`} className="flex items-center gap-2 text-sm text-[var(--fg-3)]">
    <span>{t(chatTraceLabelKey(step.domain, step.access))}</span>
    {running && index === steps.length - 1 ? <WorkingMark /> : null}
  </div>)
  if (running) return <div className="flex flex-col gap-1 px-4 py-2" aria-live="off">{lines}</div>
  return <div className="px-4 py-2">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)} className="flex min-h-11 items-center gap-2 text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)] focus-visible:outline-2 focus-visible:outline-[var(--fg-1)]">
      {t('chat.trace.steps', { count: steps.length })}
      <ChevronDown aria-hidden="true" size={16} strokeWidth={1.5} className={expanded ? 'rotate-180' : undefined} />
    </button>
    <div id={panelId} hidden={!expanded} className="flex flex-col gap-1" aria-live="off">{lines}</div>
  </div>
}

type ChatController = Omit<
  ReturnType<typeof useChatComposer>,
  'fileInputRef' | 'textFileInputRef' | 'handleFileSelect' | 'handleTextFileSelect'
>

export function AstraConversation({ chat, notice }: Readonly<{ chat: ChatController; notice?: ReactNode }>) {
  const t = useTranslations()
  const router = useRouter()
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion)
  const close = useCallback(() => setAstraConversationOpen(false), [setAstraConversationOpen])
  const {
    chatContainerRef,
    messages,
    isTyping,
    streamingMessageId,
    showSuggestions,
    sendMessage,
    activeSteps,
    canShowFollowUps,
    handleBreakdownConfirmed,
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    isOnline,
    sendError,
    canRetryLastSend,
    retryLastSend,
    composerProps,
  } = chat
  const registerChatContainer = useCallback((element: HTMLDivElement | null) => {
    chatContainerRef.current = element
  }, [chatContainerRef])

  const [initialMessageIds] = useAccountScopedState(() => new Set(messages.map((message) => message.id)))

  const [selectedGoalId, setSelectedGoalId] = useAccountScopedState<string | null>(null)

  const handleActionChipClick = useCallback((entityId: string, actionType: string) => {
    if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
      setSelectedGoalId(entityId)
      return
    }

    setSelectedGoalId(null)
    close()
    router.push(`/habits/${entityId}`)
  }, [close, router, setSelectedGoalId])

  const handleLinkedHabitNavigate = useCallback((habitId: string) => {
    setSelectedGoalId(null)
    close()
    router.push(`/habits/${habitId}`)
  }, [close, router, setSelectedGoalId])

  const handleGoalDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedGoalId(null)
  }, [setSelectedGoalId])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return

      const target = event.target
      if (target instanceof HTMLTextAreaElement && target.value.trim().length > 0) {
        return
      }

      if (target instanceof HTMLInputElement && target.value.trim().length > 0) {
        return
      }

      if (target instanceof HTMLElement && target.isContentEditable && target.textContent.trim()) {
        return
      }

      close()
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [close])

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative z-10 shrink-0">
        <AppBar
          title={t('chat.title')}
          titleIsBrandName
          action={
            <button
              type="button"
              aria-label={t('common.closeConversation')}
              onClick={close}
              className={APP_BAR_CONTROL_CLASS}
            >
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />
      </div>
      <span role="status" aria-live="polite" className="sr-only">{activeSteps.length > 0 ? t('chat.trace.working') : ''}</span>

      <div
        ref={registerChatContainer}
        className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: 16 }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-busy={isTyping || streamingMessageId !== null || activeSteps.length > 0}
        aria-label={t('chat.title')}
      >
        {showSuggestions && <ChatEmptyState
          onSelectSuggestion={(s) => void sendMessage(s)}
          contextualAction={contextualSuggestion?.id === 'progress-create-goal'
            ? { label: contextualSuggestion.label, onSelect: () => void sendMessage(contextualSuggestion.prompt) }
            : undefined}
        />}

        <div className="flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id}>
          <MessageBubble
            message={msg}
            animateEntry={!initialMessageIds.has(msg.id)}
            isStreaming={msg.id === streamingMessageId}
            onBreakdownConfirmed={handleBreakdownConfirmed}
            onActionChipClick={handleActionChipClick}
            onPendingOperationRevise={revisePendingOperationForBubble}
            onPendingOperationRefresh={refreshPendingOperationForBubble}
            onPendingOperationConfirmExecute={confirmAndExecutePendingOperation}
            onPendingOperationPrepareStepUp={prepareStepUpForBubble}
            onPendingOperationVerifyStepUp={verifyStepUpForBubble}
          />
          {msg.toolSteps?.length ? <ThinkingTrace steps={msg.toolSteps} running={false} /> : null}
          {msg.role === 'ai' && msg.id === messages.at(-1)?.id && canShowFollowUps && msg.followUps ? <FollowUpChips followUps={msg.followUps} onSelect={(text) => void sendMessage(text, 'followUp')} /> : null}
          </div>
        ))}
        {activeSteps.length > 0 ? <ThinkingTrace steps={activeSteps} running /> : null}
        </div>

      </div>

      <div className="shrink-0">
        {notice !== undefined ? <div data-shell-notice="">{notice}</div> : null}
        {sendError ? (
          <div role="alert" aria-live="assertive" className="flex items-center justify-center gap-3 px-4 pt-3 text-sm text-[var(--status-bad-text)]">
            <p className="m-0">{sendError}</p>
            {canRetryLastSend && isOnline ? (
              /* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */
              <button
                type="button"
                onClick={() => void retryLastSend()}
                className="orbit-link-action flex min-h-11 items-center gap-2 border-0 bg-transparent font-medium text-[var(--fg-2)]"
              >
                <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
                {t('shell.composer.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        <Composer {...composerProps} autoFocus suggestions={messages.length === 0 ? [] : composerProps.suggestions} />
      </div>

      {selectedGoalId && (
        <GoalDetailDrawer
          open={!!selectedGoalId}
          onOpenChange={handleGoalDrawerOpenChange}
          onLinkedHabitNavigate={handleLinkedHabitNavigate}
          goalId={selectedGoalId}
        />
      )}
    </div>
  )
}

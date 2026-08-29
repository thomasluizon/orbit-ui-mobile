'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { habitDetailToNormalized } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { AstraMark } from '@/components/ui/astra-avatar'
import { useChatComposer, type ChatComposerController } from '@/hooks/use-chat-composer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useHabitDetail } from '@/hooks/use-habits'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { useShellScrollerRegistration } from '@/components/shell/shell-scroller-context'
import { ErrorState } from '@/components/ui/error-state'
import { ChatEmptyState } from '@/app/(chat)/chat/chat-empty-state'

export function ChatPageContent({
  composer,
  onClose,
}: Readonly<{
  composer: ChatComposerController
  onClose?: () => void
}>) {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const closeConversation = useCallback(() => {
    if (onClose) {
      onClose()
      return
    }
    goBackOrFallback('/')
  }, [goBackOrFallback, onClose])
  const {
    chatContainerRef,
    messages,
    isTyping,
    streamingMessageId,
    hasProAccess,
    showSuggestions,
    sendMessage,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    isOnline,
    sendError,
    composerProps,
  } = composer
  const scrollerOwner = useMemo(() => Symbol('chat-page-content'), [])
  const registerShellScroller = useShellScrollerRegistration(scrollerOwner)
  const registerChatContainer = useCallback((element: HTMLDivElement | null) => {
    chatContainerRef.current = element
    registerShellScroller?.(element)
  }, [chatContainerRef, registerShellScroller])

  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)))

  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const habitDetailQuery = useHabitDetail(selectedHabitId)
  const selectedHabit = useMemo(
    () => (habitDetailQuery.data ? habitDetailToNormalized(habitDetailQuery.data) : null),
    [habitDetailQuery.data],
  )

  const handleActionChipClick = useCallback((entityId: string, actionType: string) => {
    if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
      if (!hasProAccess) {
        router.push('/upgrade')
        return
      }
      setSelectedHabitId(null)
      setSelectedGoalId(entityId)
      return
    }

    setSelectedGoalId(null)
    setSelectedHabitId(entityId)
  }, [hasProAccess, router])

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedHabitId(null)
  }, [])

  const handleGoalDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedGoalId(null)
  }, [])

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

      closeConversation()
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [closeConversation])

  return (
    <div className="relative flex flex-col h-full">
      <div className="relative z-10 shrink-0">
        <AppBar
          back
          backLabel={t('common.goBack')}
          onBack={closeConversation}
          titleIcon={<AstraMark size={18} />}
          title={t('chat.title')}
        />
      </div>

      <div
        data-tour="tour-chat-area"
        ref={registerChatContainer}
        className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingTop: 8 }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-busy={isTyping}
        aria-label={t('chat.title')}
      >
        {showSuggestions && <ChatEmptyState onSelectSuggestion={(s) => void sendMessage(s)} />}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            animateEntry={!initialMessageIds.has(msg.id)}
            isStreaming={msg.id === streamingMessageId}
            onBreakdownConfirmed={handleBreakdownConfirmed}
            onActionChipClick={handleActionChipClick}
            onUpgradeClick={() => router.push('/upgrade')}
            onPendingOperationConfirmExecute={confirmAndExecutePendingOperation}
            onPendingOperationPrepareStepUp={prepareStepUpForBubble}
            onPendingOperationVerifyStepUp={verifyStepUpForBubble}
          />
        ))}

        {isTyping && <TypingIndicator />}
      </div>

      <div className="shrink-0">
        {!isOnline ? (
          <div className="px-4 pt-3">
            <ErrorState message={t('chat.offline.description')} />
          </div>
        ) : null}
        {sendError ? (
          <p role="alert" aria-live="assertive" className="m-0 px-4 pt-3 text-center text-sm text-[var(--status-bad)]">
            {sendError}
          </p>
        ) : null}
        <Composer {...composerProps} />
      </div>

      <HabitDetailDrawer
        open={!!selectedHabitId}
        onOpenChange={handleDrawerOpenChange}
        habit={selectedHabit}
      />
      {selectedGoalId && (
        <GoalDetailDrawer
          open={!!selectedGoalId}
          onOpenChange={handleGoalDrawerOpenChange}
          goalId={selectedGoalId}
        />
      )}
    </div>
  )
}

export function ChatPageContentOwner() {
  const composer = useChatComposer()
  return (
    <>
      <input
        id={composer.fileInputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={composer.handleFileSelect}
      />
      <ChatPageContent composer={composer} />
    </>
  )
}

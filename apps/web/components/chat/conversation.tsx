'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { AppBar } from '@/components/ui/app-bar'
import { AstraMark } from '@/components/ui/astra-avatar'
import type { useChatComposer } from '@/hooks/use-chat-composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { ErrorState } from '@/components/ui/error-state'
import { useUIStore } from '@/stores/ui-store'
import { ChatEmptyState } from './chat-empty-state'

type ChatController = Omit<
  ReturnType<typeof useChatComposer>,
  'fileInputRef' | 'textFileInputRef' | 'handleFileSelect' | 'handleTextFileSelect'
>

export function AstraConversation({ chat }: Readonly<{ chat: ChatController }>) {
  const t = useTranslations()
  const router = useRouter()
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const close = useCallback(() => setAstraConversationOpen(false), [setAstraConversationOpen])
  const {
    chatContainerRef,
    messages,
    isTyping,
    streamingMessageId,
    showSuggestions,
    sendMessage,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    isOnline,
    sendError,
    composerProps,
  } = chat
  const registerChatContainer = useCallback((element: HTMLDivElement | null) => {
    chatContainerRef.current = element
  }, [chatContainerRef])

  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)))

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)

  const handleActionChipClick = useCallback((entityId: string, actionType: string) => {
    if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
      setSelectedGoalId(entityId)
      return
    }

    setSelectedGoalId(null)
    router.push(`/habits/${entityId}`)
  }, [router])

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

      close()
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [close])

  return (
    <div className="relative flex flex-col h-full">
      <div className="relative z-10 shrink-0">
        <AppBar
          back
          backLabel={t('common.goBack')}
          onBack={close}
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

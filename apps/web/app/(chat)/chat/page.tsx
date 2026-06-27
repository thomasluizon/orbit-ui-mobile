'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { habitDetailToNormalized } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { AstraMark } from '@/components/ui/astra-avatar'
import { GradientTop } from '@/components/ui/gradient-top'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useCoachMark } from '@/hooks/use-coach-mark'
import { useHabitDetail } from '@/hooks/use-habits'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'
import { ChatEmptyState } from './chat-empty-state'
import { ChatComposerBar } from './chat-composer-bar'

export default function ChatPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  useCoachMark('coach-astra')
  const composer = useChatComposer()
  const {
    chatContainerRef,
    messages,
    isTyping,
    hasProAccess,
    atMessageLimit,
    showSuggestions,
    sendMessage,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = composer

  const limitLocked = !hasProAccess && atMessageLimit

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

      if (target instanceof HTMLElement && target.isContentEditable && target.textContent?.trim()) {
        return
      }

      goBackOrFallback('/')
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [goBackOrFallback])

  return (
    <div className="relative flex flex-col h-full">
      {showSuggestions && <GradientTop height={420} />}
      <div className="relative z-10 shrink-0">
        <AppBar
          back
          backLabel={t('common.goBack')}
          onBack={() => goBackOrFallback('/')}
          titleIcon={<AstraMark size={18} />}
          title={t('chat.title')}
        />
      </div>

      <div
        data-tour="tour-chat-area"
        ref={chatContainerRef}
        className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingTop: 8 }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-busy={isTyping}
        aria-label={t('chat.title')}
      >
        {showSuggestions && <ChatEmptyState onSelectSuggestion={(s) => sendMessage(s)} />}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
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

      <ChatComposerBar
        textareaRef={composer.textareaRef}
        fileInputRef={composer.fileInputRef}
        input={composer.input}
        setInput={composer.setInput}
        sendError={composer.sendError}
        imagePreview={composer.imagePreview}
        isRecording={composer.isRecording}
        isTranscribing={composer.isTranscribing}
        speechSupported={composer.speechSupported}
        toggleRecording={composer.toggleRecording}
        recordingTime={composer.recordingTime}
        starterChips={composer.starterChips}
        isTyping={isTyping}
        hasProAccess={hasProAccess}
        aiMessagesUsed={composer.aiMessagesUsed}
        aiMessagesLimit={composer.aiMessagesLimit}
        atMessageLimit={atMessageLimit}
        canSend={composer.canSend}
        hasMessages={messages.length > 0}
        limitLocked={limitLocked}
        openFilePicker={composer.openFilePicker}
        handleFileSelect={composer.handleFileSelect}
        handlePaste={composer.handlePaste}
        handleKeyDown={composer.handleKeyDown}
        removeImage={composer.removeImage}
        sendMessage={sendMessage}
        retryLastSend={composer.retryLastSend}
        canRetryLastSend={composer.canRetryLastSend}
        onUpgrade={() => router.push('/upgrade')}
      />

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

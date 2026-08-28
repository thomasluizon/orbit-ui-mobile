'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { habitDetailToNormalized } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { AstraMark } from '@/components/ui/astra-avatar'
import { GradientTop } from '@/components/ui/gradient-top'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useHabitDetail } from '@/hooks/use-habits'
import { useShellStore } from '@/stores/shell-store'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { ChatEmptyState } from './chat-empty-state'

export default function ChatPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
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
    fileInputRef,
    handleFileSelect,
    composerProps,
  } = useChatComposer()

  const isDesktop = useIsDesktop()
  const setAstraOpen = useShellStore((state) => state.setAstraOpen)
  const setAstraMaximized = useShellStore((state) => state.setAstraMaximized)

  useEffect(() => {
    if (!isDesktop) return
    // react-doctor-disable-next-line nextjs-no-client-side-redirect -- responsive redirect gated on useIsDesktop (client matchMedia); not resolvable server-side https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    router.replace('/')
    setAstraOpen(true)
    setAstraMaximized(true)
  }, [isDesktop, router, setAstraOpen, setAstraMaximized])

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

      goBackOrFallback('/')
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [goBackOrFallback])

  return (
    <div className="relative flex flex-col h-full">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0"
        style={{
          height: 300,
          opacity: showSuggestions ? 1 : 0,
          transition: 'opacity var(--dur-slow) var(--ease-standard)',
        }}
      >
        <GradientTop height={300} />
      </div>
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
            <OfflineUnavailableState
              title={t('chat.offline.title')}
              description={t('chat.offline.description')}
              compact
            />
          </div>
        ) : null}
        {sendError ? (
          <p role="alert" aria-live="assertive" className="m-0 px-4 pt-3 text-center text-sm text-[var(--status-bad)]">
            {sendError}
          </p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
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

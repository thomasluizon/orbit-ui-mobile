'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { habitDetailToNormalized } from '@orbit/shared/utils'
import { AstraAvatar, AstraMark } from '@/components/ui/astra-avatar'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { ChatComposerBar } from '@/app/(chat)/chat/chat-composer-bar'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useHabitDetail } from '@/hooks/use-habits'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useShellStore } from '@/stores/shell-store'

type Composer = ReturnType<typeof useChatComposer>

function AstraLauncher({ open, onOpen }: Readonly<{ open: boolean; onOpen: () => void }>) {
  const t = useTranslations()

  return (
    <button
      type="button"
      aria-label={t('astraRail.open')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
      className={[
        'group fixed bottom-6 right-6 z-40 hidden items-center md:inline-flex',
        'rounded-full pl-3.5 pr-4 transition-[transform,opacity]',
        'duration-[var(--dur-base)] ease-[var(--ease-standard)] active:scale-[0.96]',
        open ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100 hover:scale-[1.03]',
      ].join(' ')}
      style={{
        height: 52,
        background: 'var(--bg-elev-2)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline-strong)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-standard)] group-hover:opacity-100"
        style={{ boxShadow: '0 10px 30px rgba(var(--primary-rgb), 0.32)' }}
      />
      <span className="relative inline-flex items-center gap-2.5">
        <AstraMark size={24} animate />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}>
          Astra
        </span>
      </span>
    </button>
  )
}

function AstraRailHeader({ onClose }: Readonly<{ onClose: () => void }>) {
  const t = useTranslations()

  return (
    <header className="relative shrink-0 px-4 pb-3 pt-4">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0"
        style={{ height: 96, background: 'var(--gradient-header)' }}
      />
      <div className="relative z-10 flex items-center gap-3">
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full"
          style={{ width: 38, height: 38, background: 'rgba(var(--primary-rgb), 0.16)' }}
        >
          <AstraMark size={20} animate />
        </span>
        <span className="flex min-w-0 flex-col">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--fg-1)', lineHeight: 1.2 }}>
            Astra
          </span>
          <span className="truncate" style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)' }}>
            {t('astraRail.subtitle')}
          </span>
        </span>
        <button
          type="button"
          aria-label={t('astraRail.close')}
          onClick={onClose}
          className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)] active:scale-[0.96]"
          style={{ width: 40, height: 40, boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' }}
        >
          <ChevronDown size={20} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </header>
  )
}

function AstraRailEmptyState({ onSelectSuggestion }: Readonly<{ onSelectSuggestion: (suggestion: string) => void }>) {
  const t = useTranslations()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <AstraAvatar size={64} animate />
      <p
        className="text-balance"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg-1)' }}
      >
        {t('chat.empty.title')}
      </p>
      <SuggestionChips onSelect={onSelectSuggestion} />
    </div>
  )
}

interface AstraRailMessagesProps {
  composer: Composer
  onActionChipClick: (entityId: string, actionType: string) => void
  onUpgradeClick: () => void
}

function AstraRailMessages({ composer, onActionChipClick, onUpgradeClick }: Readonly<AstraRailMessagesProps>) {
  const t = useTranslations()
  const {
    chatContainerRef,
    messages,
    isTyping,
    showSuggestions,
    sendMessage,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = composer

  return (
    <div
      ref={chatContainerRef}
      className="thin-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      style={{ paddingTop: 8 }}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isTyping}
      aria-label={t('astraRail.title')}
    >
      {showSuggestions ? (
        <AstraRailEmptyState onSelectSuggestion={(suggestion) => sendMessage(suggestion)} />
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onBreakdownConfirmed={handleBreakdownConfirmed}
              onActionChipClick={onActionChipClick}
              onUpgradeClick={onUpgradeClick}
              onPendingOperationConfirmExecute={confirmAndExecutePendingOperation}
              onPendingOperationPrepareStepUp={prepareStepUpForBubble}
              onPendingOperationVerifyStepUp={verifyStepUpForBubble}
            />
          ))}
          {isTyping && <TypingIndicator />}
        </>
      )}
    </div>
  )
}

function AstraRailComposer({ composer, onUpgrade }: Readonly<{ composer: Composer; onUpgrade: () => void }>) {
  const limitLocked = !composer.hasProAccess && composer.atMessageLimit

  return (
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
      isTyping={composer.isTyping}
      hasProAccess={composer.hasProAccess}
      aiMessagesUsed={composer.aiMessagesUsed}
      aiMessagesLimit={composer.aiMessagesLimit}
      atMessageLimit={composer.atMessageLimit}
      canSend={composer.canSend}
      hasMessages={composer.messages.length > 0}
      limitLocked={limitLocked}
      openFilePicker={composer.openFilePicker}
      handleFileSelect={composer.handleFileSelect}
      handlePaste={composer.handlePaste}
      handleKeyDown={composer.handleKeyDown}
      removeImage={composer.removeImage}
      textFileInputRef={composer.textFileInputRef}
      selectedTextFileName={composer.selectedTextFileName}
      openTextFilePicker={composer.openTextFilePicker}
      handleTextFileSelect={composer.handleTextFileSelect}
      removeTextFile={composer.removeTextFile}
      sendMessage={composer.sendMessage}
      retryLastSend={composer.retryLastSend}
      canRetryLastSend={composer.canRetryLastSend}
      onUpgrade={onUpgrade}
    />
  )
}

function AstraRailPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const t = useTranslations()
  const router = useRouter()
  const composer = useChatComposer()
  const [entered, setEntered] = useState(false)

  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const habitDetailQuery = useHabitDetail(selectedHabitId)
  const selectedHabit = useMemo(
    () => (habitDetailQuery.data ? habitDetailToNormalized(habitDetailQuery.data) : null),
    [habitDetailQuery.data],
  )

  useOverlayEscape({ open: true, onDismiss: onClose, restoreFocus: true })

  const focusComposer = composer.textareaRef
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    focusComposer.current?.focus()
    return () => cancelAnimationFrame(id)
  }, [focusComposer])

  const handleActionChipClick = useCallback(
    (entityId: string, actionType: string) => {
      if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
        if (!composer.hasProAccess) {
          router.push('/upgrade')
          return
        }
        setSelectedHabitId(null)
        setSelectedGoalId(entityId)
        return
      }
      setSelectedGoalId(null)
      setSelectedHabitId(entityId)
    },
    [composer.hasProAccess, router],
  )

  const handleHabitDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedHabitId(null)
  }, [])

  const handleGoalDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedGoalId(null)
  }, [])

  const goToUpgrade = useCallback(() => router.push('/upgrade'), [router])

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('astraRail.title')}
      className="fixed bottom-6 right-6 z-40 hidden min-h-0 flex-col overflow-hidden md:flex"
      style={{
        width: 'min(384px, calc(100vw - 48px))',
        height: 'min(640px, calc(100dvh - 48px))',
        borderRadius: 20,
        background: 'var(--bg)',
        boxShadow: 'var(--shadow-3), inset 0 0 0 1px var(--hairline-strong)',
        transformOrigin: 'bottom right',
        transform: entered ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
        opacity: entered ? 1 : 0,
        transition: 'transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
      }}
    >
      <AstraRailHeader onClose={onClose} />
      <AstraRailMessages composer={composer} onActionChipClick={handleActionChipClick} onUpgradeClick={goToUpgrade} />
      <AstraRailComposer composer={composer} onUpgrade={goToUpgrade} />

      <HabitDetailDrawer open={!!selectedHabitId} onOpenChange={handleHabitDrawerOpenChange} habit={selectedHabit} />
      {selectedGoalId && (
        <GoalDetailDrawer open={!!selectedGoalId} onOpenChange={handleGoalDrawerOpenChange} goalId={selectedGoalId} />
      )}
    </div>
  )
}

/**
 * Persistent, collapsible Astra copilot docked bottom-right on desktop (md+). Collapsed
 * it is a compact launcher; expanded it is an in-place chat panel that reuses the shared
 * chat store and `useChatComposer` SSE pipeline, so the conversation stays continuous with
 * the `/chat` route. Hidden below 768px, where the phone shell keeps its bottom-nav Astra tab.
 */
export function AstraCopilotRail() {
  const astraOpen = useShellStore((state) => state.astraOpen)
  const setAstraOpen = useShellStore((state) => state.setAstraOpen)

  return (
    <>
      <AstraLauncher open={astraOpen} onOpen={() => setAstraOpen(true)} />
      {astraOpen && <AstraRailPanel onClose={() => setAstraOpen(false)} />}
    </>
  )
}

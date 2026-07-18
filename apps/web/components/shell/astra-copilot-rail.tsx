'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, Maximize2, Minimize2 } from '@/components/ui/icons'
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
        background: 'var(--bg-sheet)',
        boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline-strong)',
      }}
    >
      <span className="relative inline-flex items-center gap-2.5">
        <AstraMark size={24} animate />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}>
          Astra
        </span>
      </span>
    </button>
  )
}

function AstraRailHeader({
  onClose,
  maximized,
  onToggleMaximize,
}: Readonly<{ onClose: () => void; maximized: boolean; onToggleMaximize: () => void }>) {
  const t = useTranslations()

  return (
    <header className="relative shrink-0 px-4 pb-3 pt-4">
      <div className="relative z-10 mx-auto flex w-full max-w-[var(--content-max-w)] items-center gap-3">
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
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={maximized ? t('astraRail.minimize') : t('astraRail.maximize')}
            title={maximized ? t('astraRail.minimize') : t('astraRail.maximize')}
            onClick={onToggleMaximize}
            className="inline-flex items-center justify-center rounded-full text-[var(--fg-2)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)] active:scale-[0.96]"
            style={{ width: 40, height: 40, boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' }}
          >
            {maximized ? (
              <Minimize2 size={18} strokeWidth={1.8} aria-hidden />
            ) : (
              <Maximize2 size={18} strokeWidth={1.8} aria-hidden />
            )}
          </button>
          <button
            type="button"
            aria-label={t('astraRail.close')}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full text-[var(--fg-2)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)] active:scale-[0.96]"
            style={{ width: 40, height: 40, boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' }}
          >
            <ChevronDown size={20} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
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
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--fg-3)',
          maxWidth: 300,
          lineHeight: 1.4,
        }}
      >
        {t('aiDisclosure.notMedicalAdvice')}
      </p>
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
  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)))

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
        <AstraRailEmptyState onSelectSuggestion={(suggestion) => void sendMessage(suggestion)} />
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              animateEntry={!initialMessageIds.has(message.id)}
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
      singleLine
      textareaRef={composer.textareaRef}
      fileInputRef={composer.fileInputRef}
      input={composer.input}
      setInput={composer.setInput}
      sendError={composer.sendError}
      imagePreview={composer.imagePreview}
      isOnline={composer.isOnline}
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
      handleTextFileSelect={(event) => void composer.handleTextFileSelect(event)}
      removeTextFile={composer.removeTextFile}
      sendMessage={() => void composer.sendMessage()}
      retryLastSend={() => void composer.retryLastSend()}
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
  const [closing, setClosing] = useState(false)
  const maximized = useShellStore((state) => state.astraMaximized)
  const toggleMaximized = useShellStore((state) => state.toggleAstraMaximized)
  const sidebarCollapsed = useShellStore((state) => state.sidebarCollapsed)

  const requestClose = useCallback(() => setClosing(true), [])

  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const habitDetailQuery = useHabitDetail(selectedHabitId)
  const selectedHabit = useMemo(
    () => (habitDetailQuery.data ? habitDetailToNormalized(habitDetailQuery.data) : null),
    [habitDetailQuery.data],
  )

  useOverlayEscape({ open: true, onDismiss: requestClose, restoreFocus: true })

  const focusComposer = composer.textareaRef
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    focusComposer.current?.focus()
    return () => cancelAnimationFrame(id)
    // react-doctor-disable-next-line exhaustive-deps -- focusComposer aliases the stable composer.textareaRef ref (in deps); the effect intentionally runs once on mount; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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

  const visible = entered && !closing
  const positionStyle: React.CSSProperties = maximized
    ? {
        top: 0,
        right: 0,
        bottom: 0,
        left: sidebarCollapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        borderRadius: 0,
        boxShadow: 'inset 1px 0 0 var(--hairline)',
        transformOrigin: 'bottom right',
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }
    : {
        width: 'min(384px, calc(100vw - 48px))',
        height: 'min(640px, calc(100dvh - 48px))',
        right: 24,
        bottom: 24,
        borderRadius: 20,
        boxShadow: 'var(--shadow-3), inset 0 0 0 1px var(--hairline-strong)',
        transformOrigin: 'bottom right',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
      }

  return (
    // react-doctor-disable-next-line prefer-html-dialog -- this is a non-modal (aria-modal="false"), desktop-only (hidden md:flex) persistent copilot rail, not a modal; native <dialog>'s modal semantics and backdrop do not fit; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('astraRail.title')}
      className="fixed z-40 hidden min-h-0 flex-col overflow-hidden md:flex"
      style={{
        background: 'var(--bg)',
        opacity: visible ? 1 : 0,
        transition: 'transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
        ...positionStyle,
      }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'opacity') {
          onClose()
        }
      }}
    >
      <AstraRailHeader onClose={requestClose} maximized={maximized} onToggleMaximize={toggleMaximized} />
      <div
        className={
          maximized
            ? 'mx-auto flex min-h-0 w-full max-w-[var(--content-max-w)] flex-1 flex-col'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        <AstraRailMessages composer={composer} onActionChipClick={handleActionChipClick} onUpgradeClick={goToUpgrade} />
        <AstraRailComposer composer={composer} onUpgrade={goToUpgrade} />
      </div>

      <HabitDetailDrawer open={!!selectedHabitId} onOpenChange={handleHabitDrawerOpenChange} habit={selectedHabit} />
      {selectedGoalId && (
        <GoalDetailDrawer open={!!selectedGoalId} onOpenChange={handleGoalDrawerOpenChange} goalId={selectedGoalId} />
      )}
    </div>
  )
}

/**
 * Persistent Astra copilot on desktop (md+). Collapsed it is a compact launcher; opened it
 * is a docked bottom-right chat panel that can maximize to fill the content area beside the
 * sidebar (and minimize back to the dock). Reuses the shared chat store + `useChatComposer`
 * SSE pipeline so the conversation is continuous. Navigating away collapses a maximized panel
 * back to the dock. Hidden below 768px, where the phone shell keeps its bottom-nav Astra tab.
 */
/** `hideLauncher` suppresses the floating launcher where the right rail already
 *  carries an Astra affordance (the Today rail's pill), so the two don't stack in
 *  the same corner. The copilot panel itself stays available. */
export function AstraCopilotRail({ hideLauncher = false }: Readonly<{ hideLauncher?: boolean }>) {
  const astraOpen = useShellStore((state) => state.astraOpen)
  const setAstraOpen = useShellStore((state) => state.setAstraOpen)
  const setAstraMaximized = useShellStore((state) => state.setAstraMaximized)
  const pathname = usePathname()
  const previousPathnameRef = useRef(pathname)

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      setAstraMaximized(false)
    }
    previousPathnameRef.current = pathname
  }, [pathname, setAstraMaximized])

  return (
    <>
      {!hideLauncher && <AstraLauncher open={astraOpen} onOpen={() => setAstraOpen(true)} />}
      {astraOpen && <AstraRailPanel onClose={() => setAstraOpen(false)} />}
    </>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Orbit,
  Sparkles,
  Mic,
  Square,
  ArrowUp,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
} from '@orbit/shared/chat'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { habitDetailToNormalized } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { InfoCard } from '@/components/ui/info-card'
import { LocalImage } from '@/components/ui/local-image'
import { PillButton } from '@/components/ui/pill-button'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useHabitDetail } from '@/hooks/use-habits'
import { MessageBubble } from '@/components/chat/message-bubble'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'

export default function ChatPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const {
    chatContainerRef,
    textareaRef,
    fileInputRef,
    langPickerRef,
    input,
    setInput,
    sendError,
    imagePreview,
    isRecording,
    speechSupported,
    speechLang,
    setSpeechLang,
    toggleRecording,
    recordingTime,
    currentLangFlag,
    showLangPicker,
    setShowLangPicker,
    starterChips,
    messages,
    isTyping,
    hasProAccess,
    aiMessagesUsed,
    aiMessagesLimit,
    atMessageLimit,
    canSend,
    showSuggestions,
    openFilePicker,
    handleFileSelect,
    handlePaste,
    removeImage,
    sendMessage,
    retryLastSend,
    canRetryLastSend,
    handleKeyDown,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = useChatComposer()

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
    <div className="flex flex-col h-full">
      <AppBar
        back
        backLabel={t('common.goBack')}
        onBack={() => goBackOrFallback('/')}
        leadingIcon={<Orbit size={17} strokeWidth={1.5} color="var(--primary)" />}
        title={t('chat.title')}
      />

      <div
        data-tour="tour-chat-area"
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 8 }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-busy={isTyping}
        aria-label={t('chat.title')}
      >
        {showSuggestions && (
          <div
            className="relative flex flex-col items-center justify-center h-full"
            style={{ gap: 16, padding: '32px' }}
          >
            <GradientTop height={420} />
            <div className="relative z-10 flex flex-col items-center" style={{ gap: 16 }}>
              <div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 84,
                  height: 84,
                  background: 'rgba(var(--primary-rgb), 0.16)',
                  boxShadow: '0 0 50px rgba(var(--primary-rgb), 0.35)',
                }}
              >
                <Sparkles size={38} strokeWidth={1.8} color="var(--primary-soft)" />
              </div>
              <div
                className="text-center"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  color: 'var(--fg-1)',
                }}
              >
                {t('chat.empty.title')}
              </div>
              <div
                className="text-center"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--fg-3)',
                  maxWidth: 280,
                  lineHeight: 1.5,
                }}
              >
                {t('chat.suggestion.prompt')}
              </div>
              <SuggestionChips onSelect={(s) => sendMessage(s)} />
              <div
                className="text-center"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  color: 'var(--fg-4)',
                  maxWidth: 300,
                  lineHeight: 1.4,
                  marginTop: 4,
                }}
              >
                {t('aiDisclosure.notMedicalAdvice')}
              </div>
            </div>
          </div>
        )}

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

      <div
        data-tour="tour-chat-input"
        className="shrink-0"
        style={{
          borderTop: '1px solid var(--hairline)',
          background: 'var(--bg)',
        }}
      >
        <div
          style={{
            padding: `12px 16px calc(12px + var(--safe-bottom))`,
          }}
        >
          {sendError && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                paddingBottom: 8,
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--status-bad)',
                textAlign: 'center',
              }}
            >
              {sendError}
              {canRetryLastSend && (
                <button
                  type="button"
                  onClick={() => retryLastSend()}
                  className="ml-2 font-semibold text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-pressed)] transition-colors"
                >
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}

          {imagePreview && (
            <div style={{ paddingBottom: 8 }}>
              <div className="relative inline-block">
                <LocalImage
                  src={imagePreview}
                  alt=""
                  style={{
                    height: 64,
                    borderRadius: 12,
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                  }}
                />
                <button
                  type="button"
                  aria-label={t('chat.removeImage')}
                  onClick={removeImage}
                  className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 bg-[var(--bg-elev)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-sunk)] hover:scale-110"
                  style={{
                    boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
                  }}
                >
                  <X size={12} aria-hidden="true" color="var(--fg-1)" />
                </button>
              </div>
            </div>
          )}

          {messages.length > 0 && starterChips.length > 0 && (
            <div
              className="overflow-x-auto"
              style={{ paddingBottom: 10 }}
            >
              <div className="flex" style={{ gap: 8, minWidth: 'max-content' }}>
                {starterChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => sendMessage(chip)}
                    className="appearance-none border-0 cursor-pointer whitespace-nowrap rounded-full inline-flex items-center bg-[var(--bg-elev)] text-[var(--fg-1)] transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)]"
                    style={{
                      minHeight: 36,
                      padding: '0 14px',
                      boxShadow: 'inset 0 0 0 1px var(--hairline)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div
            className="flex items-center"
            style={{ gap: 10 }}
          >
            {isRecording ? (
              <>
                <div
                  className="flex items-center flex-1 min-w-0 rounded-full"
                  style={{
                    gap: 12,
                    minHeight: 50,
                    padding: '0 16px',
                    background: 'var(--bg-field)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                  }}
                >
                  <span
                    className="rounded-full shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      background: 'var(--status-bad)',
                    }}
                  />
                  <div
                    className="mic-visualizer flex-1 min-w-0"
                    style={{ color: 'var(--fg-2)' }}
                    aria-label={t('chat.listening')}
                  >
                    {VISUALIZER_BAR_OFFSETS.map((offset) => (
                      <span
                        key={`bar-${offset}`}
                        className="mic-visualizer__bar"
                        style={{ animationDelay: `${offset}s` }}
                      />
                    ))}
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--fg-1)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {recordingTime}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={t('chat.stopRecording')}
                  onClick={toggleRecording}
                  className="appearance-none border-0 cursor-pointer flex items-center justify-center shrink-0 rounded-full bg-[var(--bg-elev)]"
                  style={{
                    width: 50,
                    height: 50,
                    boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
                  }}
                >
                  <Square size={18} fill="var(--status-bad)" color="var(--status-bad)" />
                </button>
              </>
            ) : (
              <>
                <div
                  className="flex items-center flex-1 min-w-0 rounded-full"
                  style={{
                    gap: 2,
                    minHeight: 50,
                    padding: '0 8px 0 18px',
                    background: 'var(--bg-field)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={t('chat.placeholder')}
                    aria-label={t('chat.placeholder')}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    className="appearance-none border-0 bg-transparent flex-1 min-w-0 resize-none"
                    style={{
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 16,
                      color: 'var(--fg-1)',
                      maxHeight: 120,
                      padding: '13px 0',
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t('chat.attachImage')}
                    onClick={openFilePicker}
                    className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center shrink-0 rounded-full text-[var(--fg-3)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
                    style={{ width: 36, height: 36 }}
                  >
                    <ImageIcon size={18} strokeWidth={1.8} />
                  </button>
                  {speechSupported && (
                    <div ref={langPickerRef} className="relative shrink-0 flex items-center">
                      <button
                        type="button"
                        data-tour="tour-chat-voice"
                        aria-label={t('chat.toggleMic')}
                        disabled={isTyping}
                        onClick={toggleRecording}
                        className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center shrink-0 rounded-full text-[var(--fg-3)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)] disabled:opacity-50"
                        style={{ width: 36, height: 36 }}
                      >
                        <Mic size={18} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        aria-label={t('chat.speechLanguage')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowLangPicker((prev) => !prev)
                        }}
                        className="appearance-none border-0 bg-transparent cursor-pointer transition-opacity duration-150 ease-out hover:opacity-80"
                        style={{
                          padding: 4,
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        {currentLangFlag}
                      </button>
                      {showLangPicker && (
                        <div
                          className="absolute z-50"
                          style={{
                            bottom: '100%',
                            left: 0,
                            marginBottom: 12,
                            minWidth: 148,
                            background: 'var(--bg-sheet)',
                            borderRadius: 12,
                            boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline)',
                            padding: '4px 0',
                          }}
                        >
                          {SPEECH_LANGUAGES.map((lang) => (
                            <button
                              key={lang.value}
                              type="button"
                              onClick={() => {
                                setSpeechLang(lang.value)
                                setShowLangPicker(false)
                              }}
                              className="w-full text-left flex items-center bg-transparent transition-colors duration-150 ease-out hover:bg-[var(--bg-elev)]"
                              style={{
                                padding: '8px 12px',
                                gap: 8,
                                fontFamily: 'var(--font-sans)',
                                fontSize: 12,
                                color: speechLang === lang.value ? 'var(--fg-1)' : 'var(--fg-2)',
                                fontWeight: speechLang === lang.value ? 600 : 400,
                                border: 0,
                                cursor: 'pointer',
                              }}
                            >
                              <span>{lang.flag}</span>
                              <span>{lang.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canSend}
                  aria-label={t('chat.send')}
                  onClick={() => sendMessage()}
                  className="appearance-none border-0 cursor-pointer inline-flex items-center justify-center shrink-0 rounded-full bg-[var(--primary)] enabled:hover:bg-[var(--primary-pressed)] enabled:active:scale-95 transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed"
                  style={{
                    width: 50,
                    height: 50,
                    color: 'var(--fg-on-primary)',
                    boxShadow: canSend ? 'var(--primary-glow)' : 'none',
                    opacity: canSend ? 1 : 0.4,
                  }}
                >
                  <ArrowUp size={22} strokeWidth={2.4} color="var(--fg-on-primary)" />
                </button>
              </>
            )}
          </div>

          {!hasProAccess && atMessageLimit && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col"
              style={{ paddingTop: 12, gap: 12 }}
            >
              <InfoCard title={t('chat.limitReachedError')} />
              <PillButton fullWidth onClick={() => router.push('/upgrade')}>
                {t('upgrade.subscribe')}
              </PillButton>
            </div>
          )}
          {!hasProAccess && !atMessageLimit && (
            <div
              className="text-center"
              style={{
                paddingTop: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
              }}
            >
              {aiMessagesUsed}/{aiMessagesLimit} {t('chat.messagesUsed')}
            </div>
          )}
        </div>
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

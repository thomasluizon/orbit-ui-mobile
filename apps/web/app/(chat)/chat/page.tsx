'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Sparkles,
  Mic,
  Square,
  SendHorizontal,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
} from '@orbit/shared/chat'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { TypingIndicator } from '@/components/chat/typing-indicator'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Chat Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const t = useTranslations()
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
    handleKeyDown,
    handleBreakdownConfirmed,
  } = useChatComposer()

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="shrink-0 chat-glass flex items-center pt-3 pb-3 z-10">
        <Link
          href="/"
          aria-label={t('common.goBack')}
          className="size-9 rounded-full hover:bg-surface-elevated flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="size-4 text-text-primary" />
        </Link>
        <h1 className="flex-1 text-center text-[length:var(--text-fluid-lg)] font-bold text-text-primary pr-10">
          {t('chat.title')}
        </h1>
      </header>

      {/* Messages area */}
      <div
        data-tour="tour-chat-area"
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto space-y-6 pb-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-busy={isTyping}
        aria-label={t('chat.title')}
      >
        {/* Empty state with suggestions */}
        {showSuggestions && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="relative flex items-center justify-center size-16">
              {/* Rotating gradient ring */}
              <div className="absolute inset-0 rounded-full animate-spin-slow orbit-ring" />
              {/* Glow */}
              <div className="absolute inset-0 rounded-full bg-primary/15 blur-md" />
              {/* Icon */}
              <Sparkles className="size-7 text-primary animate-orbit-pulse relative" />
            </div>
            <p className="text-text-secondary text-sm">{t('chat.suggestion.prompt')}</p>
            <SuggestionChips onSelect={(s) => sendMessage(s)} />
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onBreakdownConfirmed={handleBreakdownConfirmed}
          />
        ))}

        {/* Typing indicator */}
        {isTyping && <TypingIndicator />}
      </div>

      {/* Bottom input area */}
      <div data-tour="tour-chat-input" className="shrink-0 chat-glass border-t border-border-muted">
        <div className="pt-3 pb-[calc(1rem+var(--safe-bottom))]">
          {/* Error banner */}
          {sendError && (
            <div className="text-sm text-red-400 pb-2 text-center" role="alert" aria-live="assertive">
              {sendError}
            </div>
          )}

          {/* Image preview */}
          {imagePreview && (
            <div className="pb-2">
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt=""
                  className="h-16 rounded-[var(--radius-lg)] border border-border-muted"
                />
                <button
                  type="button"
                  aria-label={t('chat.removeImage')}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-surface-elevated border border-border p-0.5"
                  onClick={removeImage}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Starter chips */}
          {messages.length > 0 && (
            <div className="pb-3 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {starterChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="px-4 py-1.5 rounded-full text-[11px] font-medium bg-surface-elevated border border-border/50 text-text-primary hover:bg-surface transition-colors whitespace-nowrap"
                    onClick={() => sendMessage(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Input bar */}
          <div className="bg-surface-elevated rounded-[var(--radius-lg)] border border-border-muted flex items-center gap-2 px-3 py-2">
            {isRecording ? (
              <>
                {/* Recording state */}
                <div className="flex-1 min-w-0 flex items-center gap-3 px-3 py-1">
                  <span className="size-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-red-400 font-medium tabular-nums">
                    {recordingTime}
                  </span>
                  <div
                    className="flex-1 min-w-0 text-red-400"
                    aria-label={t('chat.listening')}
                  >
                    <div className="mic-visualizer" aria-hidden="true">
                      {VISUALIZER_BAR_OFFSETS.map((offset) => (
                        <span
                          key={`bar-${offset}`}
                          className="mic-visualizer__bar"
                          style={{ animationDelay: `${offset}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  aria-label={t('chat.stopRecording')}
                  className="shrink-0 p-2 rounded-full bg-red-500 text-white"
                  onClick={toggleRecording}
                >
                  <Square className="size-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                {/* Normal state */}
                <button
                  type="button"
                  aria-label={t('chat.attachImage')}
                  className="shrink-0 p-1 text-text-muted hover:text-text-primary transition-colors"
                  onClick={openFilePicker}
                >
                  <ImageIcon className="size-[15px]" />
                </button>
                {speechSupported && (
                  <div ref={langPickerRef} className="relative shrink-0 flex items-center">
                    <button
                      type="button"
                      data-tour="tour-chat-voice"
                      aria-label={t('chat.toggleMic')}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      disabled={isTyping}
                      onClick={toggleRecording}
                    >
                      <Mic className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('chat.speechLanguage')}
                      className="p-1 text-[10px] leading-none hover:bg-surface rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowLangPicker((prev) => !prev)
                      }}
                    >
                      {currentLangFlag}
                    </button>
                    {/* Language picker dropdown */}
                    {showLangPicker && (
                      <div className="absolute bottom-full left-0 mb-2 bg-surface-overlay border border-border-muted rounded-[var(--radius-md)] shadow-[var(--shadow-md)] py-1 z-50 min-w-[140px]">
                        {SPEECH_LANGUAGES.map((lang) => (
                          <button
                            key={lang.value}
                            className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-surface transition-colors ${
                              speechLang === lang.value
                                ? 'text-primary font-bold'
                                : 'text-text-secondary'
                            }`}
                            onClick={() => {
                              setSpeechLang(lang.value)
                              setShowLangPicker(false)
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
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('chat.placeholder')}
                  aria-label={t('chat.placeholder')}
                  className="flex-1 resize-none bg-transparent text-text-primary placeholder-text-muted text-sm py-2 px-3 focus:outline-none min-h-[36px] max-h-[120px]"
                  rows={1}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                />
                <button
                  type="button"
                  disabled={!canSend}
                  aria-label={t('chat.send')}
                  className="shrink-0 flex items-center justify-center bg-primary rounded-[var(--radius-xl)] p-2 text-white transition-all active:scale-95 disabled:opacity-40 shadow-[var(--shadow-glow-sm)]"
                  onClick={() => sendMessage()}
                >
                  <SendHorizontal className="size-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* Message limit indicators */}
          {!hasProAccess && atMessageLimit && (
            <div className="text-center pt-2 space-y-1.5" role="status" aria-live="polite">
              <p className="text-[10px] text-amber-400 font-medium">
                {t('chat.limitReachedError')}
              </p>
            </div>
          )}
          {!hasProAccess && !atMessageLimit && (
            <p className="text-[10px] text-text-muted text-center pt-2">
              {aiMessagesUsed}/{aiMessagesLimit} {t('chat.messagesUsed')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

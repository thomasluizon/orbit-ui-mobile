'use client'

import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  RefObject,
} from 'react'
import {
  Mic,
  Square,
  ArrowUp,
  X,
  Crown,
  Lock,
  Image as ImageIcon,
  Paperclip,
  FileText,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  CHAT_TEXT_FILE_WEB_ACCEPT,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
} from '@orbit/shared/chat'
import { InfoCard } from '@/components/ui/info-card'
import { LocalImage } from '@/components/ui/local-image'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { PillButton } from '@/components/ui/pill-button'

interface ChatComposerBarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  input: string
  setInput: (value: string) => void
  sendError: string | null
  imagePreview: string | null
  isOnline: boolean
  isRecording: boolean
  isTranscribing: boolean
  speechSupported: boolean
  toggleRecording: () => void
  recordingTime: string
  starterChips: string[]
  isTyping: boolean
  hasProAccess: boolean
  aiMessagesUsed: number
  aiMessagesLimit: number
  atMessageLimit: boolean
  canSend: boolean
  hasMessages: boolean
  limitLocked: boolean
  openFilePicker: () => void
  handleFileSelect: (event: ChangeEvent<HTMLInputElement>) => void
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  removeImage: () => void
  textFileInputRef: RefObject<HTMLInputElement | null>
  selectedTextFileName: string | null
  openTextFilePicker: () => void
  handleTextFileSelect: (event: ChangeEvent<HTMLInputElement>) => void
  removeTextFile: () => void
  sendMessage: (content?: string) => void
  retryLastSend: () => void
  canRetryLastSend: boolean
  onUpgrade: () => void
  singleLine?: boolean
}

interface ChatComposerNoticesProps {
  sendError: string | null
  canRetryLastSend: boolean
  retryLastSend: () => void
  imagePreview: string | null
  removeImage: () => void
  selectedTextFileName: string | null
  removeTextFile: () => void
  hasMessages: boolean
  isOnline: boolean
  starterChips: string[]
  sendMessage: (content?: string) => void
}

function ChatComposerNotices({
  sendError,
  canRetryLastSend,
  retryLastSend,
  imagePreview,
  removeImage,
  selectedTextFileName,
  removeTextFile,
  hasMessages,
  isOnline,
  starterChips,
  sendMessage,
}: Readonly<ChatComposerNoticesProps>) {
  const t = useTranslations()

  return (
    <>
      {!isOnline && (
        <div style={{ paddingBottom: 8 }}>
          <OfflineUnavailableState
            title={t('chat.offline.title')}
            description={t('chat.offline.description')}
            compact
          />
        </div>
      )}
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
              className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 bg-[var(--bg-elev)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-sunk)] hover:scale-110 after:absolute after:-inset-3.5"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
              }}
            >
              <X size={12} aria-hidden="true" color="var(--fg-1)" />
            </button>
          </div>
        </div>
      )}

      {selectedTextFileName && (
        <div style={{ paddingBottom: 8 }}>
          <div
            className="relative inline-flex items-center"
            style={{
              gap: 8,
              maxWidth: '100%',
              padding: '8px 12px',
              borderRadius: 12,
              background: 'var(--bg-elev)',
              boxShadow: 'inset 0 0 0 1px var(--hairline)',
            }}
          >
            <FileText size={16} strokeWidth={1.8} aria-hidden="true" color="var(--primary)" />
            <span
              className="truncate"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-2)',
                maxWidth: 220,
              }}
            >
              {selectedTextFileName}
            </span>
            <button
              type="button"
              aria-label={t('chat.removeFile')}
              onClick={removeTextFile}
              className="relative rounded-full p-0.5 bg-[var(--bg-elev)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-sunk)] hover:scale-110 after:absolute after:-inset-3.5"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
              }}
            >
              <X size={12} aria-hidden="true" color="var(--fg-1)" />
            </button>
          </div>
        </div>
      )}

      {hasMessages && starterChips.length > 0 && (
        <div
          className="overflow-x-auto [scrollbar-width:none]"
          style={{ paddingBottom: 10 }}
        >
          <div className="flex" style={{ gap: 8, minWidth: 'max-content' }}>
            {starterChips.map((chip, index) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendMessage(chip)}
                className="chip animate-chip-in"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

interface ChatRecordingBarProps {
  recordingTime: string
  isTranscribing: boolean
  toggleRecording: () => void
}

function ChatRecordingBar({
  recordingTime,
  isTranscribing,
  toggleRecording,
}: Readonly<ChatRecordingBarProps>) {
  const t = useTranslations()

  return (
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
          className={`rounded-full shrink-0 ${isTranscribing ? '' : 'animate-gentle-pulse'}`}
          style={{
            width: 8,
            height: 8,
            background: isTranscribing ? 'var(--primary)' : 'var(--status-bad)',
          }}
        />
        {!isTranscribing && (
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
        )}
        <span
          style={{
            fontFamily: isTranscribing ? 'var(--font-sans)' : 'var(--font-mono)',
            fontSize: isTranscribing ? 13 : 12,
            fontWeight: 500,
            color: isTranscribing ? 'var(--fg-2)' : 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isTranscribing ? t('chat.transcribing') : recordingTime}
        </span>
      </div>
      <button
        type="button"
        disabled={isTranscribing}
        aria-label={t('chat.stopRecording')}
        onClick={toggleRecording}
        className="appearance-none border-0 flex items-center justify-center shrink-0 rounded-full bg-[var(--bg-elev)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--bg-elev-2)] enabled:active:scale-[0.96] disabled:cursor-not-allowed enabled:cursor-pointer"
        style={{
          width: 50,
          height: 50,
          boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
          opacity: isTranscribing ? 0.45 : 1,
        }}
      >
        <Square size={18} fill="var(--status-bad)" color="var(--status-bad)" />
      </button>
    </>
  )
}

interface ChatTextInputRowProps {
  singleLine?: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  input: string
  setInput: (value: string) => void
  limitLocked: boolean
  isOnline: boolean
  isTyping: boolean
  speechSupported: boolean
  toggleRecording: () => void
  canSend: boolean
  openFilePicker: () => void
  openTextFilePicker: () => void
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  sendMessage: (content?: string) => void
}

function ChatTextInputRow({
  singleLine,
  textareaRef,
  input,
  setInput,
  limitLocked,
  isOnline,
  isTyping,
  speechSupported,
  toggleRecording,
  canSend,
  openFilePicker,
  openTextFilePicker,
  handlePaste,
  handleKeyDown,
  sendMessage,
}: Readonly<ChatTextInputRowProps>) {
  const t = useTranslations()

  return (
    <>
      <div
        className="flex items-center flex-1 min-w-0 rounded-[26px] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--primary)]"
        style={{
          gap: 2,
          minHeight: 50,
          padding: '0 8px 0 18px',
          background: 'var(--bg-field)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          opacity: limitLocked ? 0.45 : 1,
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          wrap={singleLine ? 'off' : undefined}
          data-testid="chat-input"
          disabled={limitLocked || !isOnline}
          placeholder={limitLocked ? t('chat.limitReachedError') : t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={`appearance-none border-0 bg-transparent flex-1 min-w-0 resize-none${singleLine ? ' whitespace-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}`}
          style={{
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
            maxHeight: 120,
            padding: '13px 0',
          }}
        />
        {limitLocked && (
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 34, height: 34, color: 'var(--fg-4)' }}
          >
            <Lock size={18} strokeWidth={1.8} />
          </span>
        )}
        {!limitLocked && (
          <button
            type="button"
            aria-label={t('chat.attachFile')}
            disabled={!isOnline}
            onClick={openTextFilePicker}
            className="icon-btn shrink-0 text-[var(--fg-3)] hover:text-[var(--fg-1)] disabled:opacity-50"
          >
            <Paperclip size={18} strokeWidth={1.8} />
          </button>
        )}
        {!limitLocked && (
          <button
            type="button"
            aria-label={t('chat.attachImage')}
            disabled={!isOnline}
            onClick={openFilePicker}
            className="icon-btn shrink-0 text-[var(--fg-3)] hover:text-[var(--fg-1)] disabled:opacity-50"
          >
            <ImageIcon size={18} strokeWidth={1.8} />
          </button>
        )}
        {!limitLocked && speechSupported && (
          <button
            type="button"
            data-tour="tour-chat-voice"
            aria-label={t('chat.toggleMic')}
            disabled={isTyping || !isOnline}
            onClick={toggleRecording}
            className="icon-btn shrink-0 text-[var(--fg-3)] hover:text-[var(--fg-1)] disabled:opacity-50"
          >
            <Mic size={18} strokeWidth={1.8} />
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={!canSend}
        data-testid="chat-send"
        aria-label={t('chat.send')}
        onClick={() => sendMessage()}
        className="appearance-none border-0 cursor-pointer inline-flex items-center justify-center shrink-0 rounded-full bg-[var(--primary)] enabled:hover:bg-[var(--primary-pressed)] enabled:hover:scale-105 enabled:hover:shadow-[var(--primary-glow-hover)] enabled:active:scale-[0.96] transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed"
        style={{
          width: 50,
          height: 50,
          color: 'var(--fg-on-primary)',
          boxShadow: canSend ? 'var(--primary-glow)' : 'none',
          opacity: canSend ? 1 : 0.45,
        }}
      >
        <ArrowUp size={22} strokeWidth={2.4} color="var(--fg-on-primary)" />
      </button>
    </>
  )
}

/** The chat input region: send-error banner, image preview, starter chips, the
 *  recording visualizer / textarea + send controls, and the message-limit gate.
 *  Presentational — all state lives in `useChatComposer`. */
export function ChatComposerBar({
  textareaRef,
  fileInputRef,
  input,
  setInput,
  sendError,
  imagePreview,
  isOnline,
  isRecording,
  isTranscribing,
  speechSupported,
  toggleRecording,
  recordingTime,
  starterChips,
  isTyping,
  hasProAccess,
  aiMessagesUsed,
  aiMessagesLimit,
  atMessageLimit,
  canSend,
  hasMessages,
  limitLocked,
  openFilePicker,
  handleFileSelect,
  handlePaste,
  handleKeyDown,
  removeImage,
  textFileInputRef,
  selectedTextFileName,
  openTextFilePicker,
  handleTextFileSelect,
  removeTextFile,
  sendMessage,
  retryLastSend,
  canRetryLastSend,
  onUpgrade,
  singleLine = false,
}: Readonly<ChatComposerBarProps>) {
  const t = useTranslations()

  return (
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
        <ChatComposerNotices
          sendError={sendError}
          canRetryLastSend={canRetryLastSend}
          retryLastSend={retryLastSend}
          imagePreview={imagePreview}
          removeImage={removeImage}
          selectedTextFileName={selectedTextFileName}
          removeTextFile={removeTextFile}
          hasMessages={hasMessages}
          isOnline={isOnline}
          starterChips={starterChips}
          sendMessage={sendMessage}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />

        <input
          ref={textFileInputRef}
          type="file"
          accept={CHAT_TEXT_FILE_WEB_ACCEPT}
          className="hidden"
          onChange={handleTextFileSelect}
        />

        <div
          className="flex items-center"
          style={{ gap: 10 }}
        >
          {isRecording || isTranscribing ? (
            <ChatRecordingBar
              recordingTime={recordingTime}
              isTranscribing={isTranscribing}
              toggleRecording={toggleRecording}
            />
          ) : (
            <ChatTextInputRow
              singleLine={singleLine}
              textareaRef={textareaRef}
              input={input}
              setInput={setInput}
              limitLocked={limitLocked}
              isOnline={isOnline}
              isTyping={isTyping}
              speechSupported={speechSupported}
              toggleRecording={toggleRecording}
              canSend={canSend}
              openFilePicker={openFilePicker}
              openTextFilePicker={openTextFilePicker}
              handlePaste={handlePaste}
              handleKeyDown={handleKeyDown}
              sendMessage={sendMessage}
            />
          )}
        </div>

        {limitLocked && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col"
            style={{ paddingTop: 12, gap: 12 }}
          >
            <InfoCard title={t('chat.limitReachedError')} />
            <div className="flex justify-center">
              <PillButton
                leading={<Crown size={18} strokeWidth={1.8} aria-hidden="true" />}
                onClick={onUpgrade}
              >
                {t('upgrade.subscribe')}
              </PillButton>
            </div>
          </div>
        )}
        {!hasProAccess && !atMessageLimit && (
          <div
            className="text-center"
            style={{
              paddingTop: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}
          >
            {aiMessagesUsed}/{aiMessagesLimit} {t('chat.messagesUsed')}
          </div>
        )}
      </div>
    </div>
  )
}

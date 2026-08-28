'use client'

import type { ClipboardEventHandler } from 'react'
import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { ArrowUp, FileText, Image as ImageIcon, Mic, RefreshCw, Square, X } from '@/components/ui/icons'

type WebComposerProps = ComposerProps & {
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
}

function AttachmentIcon({ kind }: Readonly<Pick<ComposerAttachment, 'kind'>>) {
  return kind === 'image' ? (
    <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />
  ) : (
    <FileText size={20} strokeWidth={1.8} aria-hidden="true" />
  )
}

function AttachmentTray({
  attachments,
  words,
  onRemove,
}: Readonly<{
  attachments: readonly ComposerAttachment[]
  words: ComposerAttachWords
  onRemove: (id: string) => void
}>) {
  if (attachments.length === 0) return null

  return (
    <div aria-label={words.trayLabel} className="flex flex-col gap-2" role="list">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          data-attachment-kind={attachment.kind}
          className="flex min-h-12 items-center gap-3 rounded-xl bg-[var(--bg-well)] px-3 text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)]"
          role="listitem"
        >
          <AttachmentIcon kind={attachment.kind} />
          <span className="min-w-0 flex-1 truncate text-sm">{attachment.name}</span>
          <button
            type="button"
            aria-label={words.remove(attachment.name)}
            onClick={() => onRemove(attachment.id)}
            className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96]"
          >
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}

function SuggestionStrip({ suggestions, label }: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string }>) {
  return (
    <div
      aria-label={label}
      role="group"
      className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={suggestion.onSelect}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border-0 bg-[var(--bg-well)] px-3 text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96]"
        >
          {suggestion.icon}
          <span>{suggestion.label}</span>
        </button>
      ))}
    </div>
  )
}

function VoiceStatus({ state, words }: Readonly<{ state: 'recording' | 'transcribing'; words: ComposerVoiceWords }>) {
  return (
    <div aria-live="polite" className="flex min-h-11 items-center gap-3 text-sm font-medium text-[var(--fg-2)]">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${state === 'recording' ? 'bg-[var(--status-bad)]' : 'bg-[var(--primary)]'}`}
      />
      <span>{state === 'recording' ? words.recording : words.transcribing}</span>
    </div>
  )
}

function handleSendKeyDown(event: import('react').KeyboardEvent<HTMLTextAreaElement>, canSend: boolean, onSend: () => void) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  if (canSend) onSend()
}

function ComposerStatus({ props }: Readonly<{ props: WebComposerProps }>) {
  if (props.state === 'atLimit') {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 min-h-11 text-sm leading-5 text-[var(--fg-2)]">{props.limitReason}</p>
        {props.limitRecovery}
      </div>
    )
  }
  if (props.state === 'recording' || props.state === 'transcribing') {
    return <VoiceStatus state={props.state} words={props.voiceWords} />
  }
  return <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} />
}

function ComposerInputRow({ props }: Readonly<{ props: WebComposerProps }>) {
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value)
  const isAtLimit = props.state === 'atLimit'
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = props.state === 'idle' || props.state === 'sending'
  const voiceDisabled = isTranscribing || props.state === 'sending' || isAtLimit

  return (
    <div className="flex items-end gap-2">
      <div className="flex min-h-12 min-w-0 flex-1 items-center gap-1 rounded-xl bg-[var(--bg-field)] px-2 shadow-[inset_0_0_0_1px_var(--border-control)] focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--primary)]">
        <textarea
          rows={1}
          data-composer-input
          data-tour="tour-chat-input"
          aria-label={props.words.placeholder}
          disabled={inputDisabled}
          placeholder={props.words.placeholder}
          value={props.value}
          onChange={(event) => props.onChangeValue(event.target.value)}
          onKeyDown={(event) => handleSendKeyDown(event, canSend, props.onSend)}
          onPaste={props.onPaste}
          className="max-h-24 min-h-12 min-w-0 flex-1 resize-none appearance-none border-0 bg-transparent px-2 py-3 text-base text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-3)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
        />

        {props.onAttach ? (
          <button
            type="button"
            aria-label={props.attachWords.add}
            disabled={inputDisabled}
            onClick={props.onAttach}
            className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40"
          >
            <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}

        {props.onVoice ? (
          <button
            type="button"
            data-tour="tour-chat-voice"
            aria-label={isRecording ? props.voiceWords.stop : props.voiceWords.start}
            disabled={voiceDisabled}
            onClick={props.onVoice}
            className={`flex size-11 shrink-0 items-center justify-center border-0 transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96] disabled:opacity-40 ${isRecording ? 'rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-hover)]' : 'bg-transparent text-[var(--fg-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)]'}`}
          >
            {isRecording ? (
              <Square size={16} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={20} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={props.words.send}
        data-accent={sendIsAccent ? '' : undefined}
        disabled={!canSend}
        onClick={() => {
          if (canSend) props.onSend()
        }}
        className={`flex size-12 shrink-0 items-center justify-center rounded-full border-0 transition-[background-color,opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${sendIsAccent ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-hover)]' : 'bg-[var(--bg-well)] text-[var(--fg-4)]'}`}
      >
        <ArrowUp size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}

function RetryControl({ props }: Readonly<{ props: ComposerProps }>) {
  if (!props.onRetry) return null
  return (
    <button
      type="button"
      onClick={props.onRetry}
      className="flex min-h-11 items-center justify-center gap-2 self-start border-0 bg-transparent text-sm font-medium text-[var(--fg-2)] underline underline-offset-4 transition-[color] duration-[var(--dur-fast)] hover:text-[var(--fg-1)]"
    >
      <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>{props.words.retry}</span>
    </button>
  )
}

export function Composer(props: Readonly<WebComposerProps>) {
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const canRetry = props.onRetry !== undefined

  return (
    <div
      data-state={props.state}
      data-has-attachments={hasAttachments ? '' : undefined}
      data-can-retry={canRetry ? '' : undefined}
      className="flex shrink-0 flex-col gap-3 border-t border-[var(--hairline)] bg-[var(--bg)] p-4"
    >
      {hasAttachments && props.attachWords && props.onAttachRemove ? (
        <AttachmentTray attachments={attachments} words={props.attachWords} onRemove={props.onAttachRemove} />
      ) : null}

      <ComposerStatus props={props} />
      <ComposerInputRow props={props} />
      <RetryControl props={props} />
    </div>
  )
}

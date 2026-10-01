'use client'

import { useEffect, useRef, useState, type ClipboardEventHandler } from 'react'
import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { subscribeComposerRecordingTime } from '@orbit/shared/hooks'
import { ArrowUp, FileText, Image as ImageIcon, Mic, RefreshCw, Square, X } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { revealFocusedControl } from '@/lib/focus-scroll'

type WebComposerProps = ComposerProps & {
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
  inputId?: string
  autoFocus?: boolean
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
            className="flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96]"
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
      data-focus-inset=""
      onFocusCapture={revealFocusedControl}
      className="-mx-1 -my-1 flex min-w-0 gap-2 overflow-x-auto p-1 scroll-p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          aria-label={suggestion.label}
          onClick={(event) => {
            const root = event.currentTarget.closest('[data-composer-root]')
            if (root instanceof HTMLElement) root.focus()
            suggestion.onSelect()
          }}
          className="flex min-h-11 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-full border-0 bg-[var(--bg-well)] px-3 text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96]"
        >
          {suggestion.icon}
          <span className="min-w-0 truncate">{suggestion.label}</span>
        </button>
      ))}
    </div>
  )
}

function VoiceStatus({ state, words }: Readonly<{ state: 'recording' | 'transcribing'; words: ComposerVoiceWords }>) {
  const [elapsed, setElapsed] = useState('00:00')
  useEffect(() => {
    if (state !== 'recording') return
    return subscribeComposerRecordingTime(setElapsed)
  }, [state])
  return (
    <div data-composer-voice-row className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2 text-sm font-medium text-[var(--fg-2)]">
      {state === 'recording' ? <span aria-hidden="true" className="font-[var(--font-mono)] tabular-nums">{elapsed}</span> : null}
      <span className="truncate">{state === 'recording' ? words.recording : words.transcribing}</span>
    </div>
  )
}

function handleSendKeyDown(event: import('react').KeyboardEvent<HTMLTextAreaElement>, canSend: boolean, onSend: () => void) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  if (canSend) onSend()
}

function ComposerStatus({ props }: Readonly<{ props: WebComposerProps }>) {
  if (props.state === 'atLimit' || props.state === 'offline') {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 min-h-11 text-sm leading-5 text-[var(--fg-2)]">{props.limitReason}</p>
        {props.limitRecovery}
      </div>
    )
  }
  if (props.state === 'recording' || props.state === 'transcribing') {
    return props.words.offlineReason ? <p className="m-0 text-sm leading-5 text-[var(--fg-2)]">{props.words.offlineReason}</p> : null
  }
  if (props.state === 'sending' || props.suggestions.length === 0) return null
  return <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} />
}

function ComposerControls({ props }: Readonly<{ props: WebComposerProps }>) {
  const inputDisabled = props.state !== 'idle'
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const voiceDisabled = isTranscribing || props.state === 'sending' || props.state === 'offline'
  return (
        <div data-composer-controls className="flex shrink-0 items-center gap-1">
        {!isRecording && !isTranscribing && props.onAttachFile ? (
          <button
            type="button"
            aria-label={props.attachWords.file}
            disabled={inputDisabled}
            onClick={props.onAttachFile}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40"
          >
            <FileText size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}

        {!isRecording && !isTranscribing && props.onAttachImage ? (
          <button
            type="button"
            aria-label={props.attachWords.image}
            disabled={inputDisabled}
            onClick={props.onAttachImage}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40"
          >
            <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}

        {props.onVoice ? (
          <button
            type="button"
            aria-label={isRecording || isTranscribing ? props.voiceWords.stop : props.voiceWords.start}
            disabled={voiceDisabled}
            onClick={props.onVoice}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full border-0 transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] active:scale-[0.96] disabled:opacity-40 ${isRecording ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-hover)]' : 'bg-transparent text-[var(--fg-3)] hover:bg-[var(--bg-hover)]'}`}
          >
            {isRecording || isTranscribing ? (
              <Square size={16} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={20} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        ) : null}
        </div>
  )
}

function ComposerInputRow({ props }: Readonly<{ props: WebComposerProps }>) {
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = canSend || props.state === 'sending'

  return (
    <div className="flex items-end gap-2">
      {props.onOpenConversation && props.conversationLabel ? (
        <button
          type="button"
          aria-label={props.conversationLabel}
          data-open-conversation
          onClick={props.onOpenConversation}
          className="flex size-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96]"
        >
          <AstraGlyph size={20} color="currentColor" />
        </button>
      ) : null}
      <div data-composer-input-row data-focus-perimeter="" aria-live="polite" className="flex min-h-12 min-w-0 flex-1 items-center gap-1 rounded-xl bg-[var(--bg-field)] px-2 shadow-[inset_0_0_0_1px_var(--border-control)] has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:has-[textarea:focus-visible]:border-[Highlight] flex-wrap justify-end">
        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} /> : <textarea
          id={props.inputId}
          rows={1}
          data-composer-input
          aria-label={props.words.inputLabel ?? props.words.placeholder}
          disabled={inputDisabled}
          placeholder={props.words.placeholder}
          value={props.value}
          onChange={(event) => props.onChangeValue(event.target.value)}
          onKeyDown={(event) => handleSendKeyDown(event, canSend, props.onSend)}
          onPaste={props.onPaste}
          onFocus={props.onOpenConversation}
          className="max-h-24 min-h-12 min-w-[min(100%,176px)] basis-44 flex-1 resize-none appearance-none border-0 bg-transparent px-2 py-3 text-base text-[var(--fg-1)] focus-visible:outline-0 placeholder:text-[var(--fg-3)] disabled:cursor-not-allowed disabled:opacity-50 [field-sizing:content] [white-space:pre-wrap] [overflow-wrap:break-word] placeholder:whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis"
        />}

        <ComposerControls props={props} />
      </div>

      <button
        type="button"
        aria-label={props.words.send}
        data-accent={sendIsAccent ? '' : undefined}
        disabled={!canSend}
        onClick={() => {
          if (canSend) props.onSend()
        }}
        className={`relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-0 transition-[background-color,opacity,transform] duration-150 ease-[var(--ease-standard)] enabled:active:scale-[0.96] disabled:cursor-not-allowed ${props.state === 'sending' ? '' : 'disabled:opacity-40'} ${sendIsAccent ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-hover)]' : 'bg-[var(--bg-well)] text-[var(--fg-3)]'}`}
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
      className="orbit-link-action flex min-h-11 items-center justify-center gap-2 self-start border-0 bg-transparent text-sm font-medium text-[var(--fg-2)] transition-[color] duration-[var(--dur-hover)] hover:text-[var(--fg-1)]"
    >
      <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>{props.words.retry}</span>
    </button>
  )
}

export function Composer(props: Readonly<WebComposerProps>) {
  const composerRef = useRef<HTMLDivElement>(null)
  const inputDisabled = props.state !== 'idle'
  useEffect(() => {
    if (!props.autoFocus) return
    const composer = composerRef.current
    const input = composer?.querySelector<HTMLTextAreaElement>('[data-composer-input]:not([disabled])')
    ;(input ?? composer)?.focus()
  }, [props.autoFocus])
  useEffect(() => {
    if (!props.autoFocus) return
    const composer = composerRef.current
    const input = composer?.querySelector<HTMLTextAreaElement>('[data-composer-input]')
    if (inputDisabled && input?.isSameNode(document.activeElement)) composer?.focus()
    else if (!inputDisabled && composer?.isSameNode(document.activeElement)) input?.focus()
  }, [inputDisabled, props.autoFocus])
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const canRetry = props.onRetry !== undefined

  return (
    <div
      ref={composerRef}
      data-state={props.state}
      data-composer-root
      role="group"
      aria-label={props.words.inputLabel ?? props.words.placeholder}
      tabIndex={-1}
      data-has-attachments={hasAttachments ? '' : undefined}
      data-can-retry={canRetry ? '' : undefined}
      className="@container flex shrink-0 flex-col gap-3 border-t border-[var(--hairline)] bg-[var(--bg)] p-4"
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

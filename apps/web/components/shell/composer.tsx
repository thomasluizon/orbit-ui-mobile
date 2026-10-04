'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useEffect, useId, useRef, useState, type ClipboardEventHandler } from 'react'
import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { subscribeComposerRecordingTime } from '@orbit/shared/hooks'
import { COMPOSER_CHIP_GAP, COMPOSER_CHIP_PEEK, resolveComposerStripLayout } from '@orbit/shared/chat'
import { ArrowUp, FileText, Image as ImageIcon, Loader2, Plus, RefreshCw, Square, X } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { Sheet } from '@/components/ui/sheet'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { revealFocusedControl } from '@/lib/focus-scroll'

type WebComposerProps = ComposerProps & {
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
  inputId?: string
  autoFocus?: boolean
}

function AttachmentIcon({ kind }: Readonly<Pick<ComposerAttachment, 'kind'>>) {
  return kind === 'image' ? (
    <ImageIcon size={20} strokeWidth={2} aria-hidden="true" />
  ) : (
    <FileText size={20} strokeWidth={2} aria-hidden="true" />
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
  const [selectedName, setSelectedName] = useState<string | null>(null)
  return <>
    <div aria-label={words.trayLabel} className="flex flex-col gap-2" role="list">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          data-attachment-kind={attachment.kind}
          className="flex min-h-[48px] items-center gap-3 rounded-xl bg-[var(--bg-well)] px-3 text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)]"
          role="listitem"
        >
          <AttachmentIcon kind={attachment.kind} />
          <button type="button" aria-label={attachment.name} onClick={() => setSelectedName(attachment.name)}
            className="min-h-[48px] min-w-0 flex-1 rounded-lg border-0 bg-transparent py-2 text-start text-sm text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]">
            <PersonalText className=" ">{attachment.name}</PersonalText>
          </button>
          <button
            type="button"
            aria-label={words.remove(attachment.name)}
            onClick={() => onRemove(attachment.id)}
            className="flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
    {selectedName ? <Sheet title={words.trayLabel} onClose={() => setSelectedName(null)}>
      <PersonalText expanded className="m-0 text-base text-[var(--fg-1)] ">{selectedName}</PersonalText>
    </Sheet> : null}
  </>
}

function SuggestionStrip({ suggestions, label }: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string }>) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ availableWidth: 0, visibleWidth: 0, firstChipMinWidth: 0 })
  useEffect(() => {
    const host = layoutRef.current!
    const observer = new ResizeObserver(() => {
      const availableWidth = host.getBoundingClientRect().width
      const chipWidths = [...host.querySelectorAll<HTMLElement>('[data-suggestion-content]')].map(content => {
        const buttonStyle = getComputedStyle(content.parentElement!)
        return content.getBoundingClientRect().width + parseFloat(buttonStyle.paddingInlineStart) + parseFloat(buttonStyle.paddingInlineEnd)
      })
      const next = { availableWidth, ...resolveComposerStripLayout(availableWidth, chipWidths) }
      setLayout(previous => previous.availableWidth === next.availableWidth && previous.visibleWidth === next.visibleWidth
        && previous.firstChipMinWidth === next.firstChipMinWidth ? previous : next)
    })
    observer.observe(host)
    host.querySelectorAll('[data-suggestion-content]').forEach(content => observer.observe(content))
    return () => observer.disconnect()
  }, [suggestions])
  const maxWidth = layout.availableWidth > 0 ? layout.availableWidth - COMPOSER_CHIP_GAP - COMPOSER_CHIP_PEEK : undefined
  return (
    <div ref={layoutRef} className="min-w-0">
      <div
        aria-label={label}
        role="group"
        data-focus-inset=""
        onFocusCapture={revealFocusedControl}
        style={{ width: layout.visibleWidth || undefined }}
        className="flex min-w-0 items-start gap-[8px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.id}
            type="button"
            aria-label={suggestion.label}
            style={{ maxWidth, minWidth: index === 0 ? layout.firstChipMinWidth : undefined }}
            onClick={(event) => {
              const root = event.currentTarget.closest('[data-composer-root]')
              if (root instanceof HTMLElement) root.focus()
              suggestion.onSelect()
            }}
            className="flex min-h-[48px] shrink-0 items-start gap-[8px] rounded-full border-0 bg-[var(--bg-well)] px-[12px] py-[12px] text-start text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
          >
            <span data-suggestion-content className="flex min-w-0 items-start gap-[8px]">
              {suggestion.icon ? <span aria-hidden="true" className="flex h-[1lh] shrink-0 items-center">{suggestion.icon}</span> : null}
              <span data-suggestion-label className="min-w-0">{suggestion.label}</span>
            </span>
          </button>
        ))}
      </div>
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
    <div data-composer-voice-row aria-label={state === 'recording' ? words.recording : words.transcribing} className="flex min-h-[48px] min-w-0 flex-1 items-center text-sm font-medium text-[var(--fg-2)]">
      {state === 'recording' ? <span role="timer" aria-live="off" className="font-[var(--font-mono)] tabular-nums">{elapsed}</span> : null}
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
        <p className="m-0 min-h-[var(--touch-min)] text-sm leading-5 text-[var(--fg-2)]">{props.limitReason}</p>
        {props.limitRecovery}
      </div>
    )
  }
  if (props.state === 'recording' || props.state === 'transcribing') {
    return <div className="flex flex-col gap-2" role="status">
      <span className="whitespace-nowrap text-sm text-[var(--fg-2)]">{props.state === 'recording' ? props.voiceWords.recording : props.voiceWords.transcribing}</span>
      {props.words.offlineReason ? <p className="m-0 text-sm leading-5 text-[var(--fg-2)]">{props.words.offlineReason}</p> : null}
    </div>
  }
  if (props.state === 'sending' || props.suggestions.length === 0) return null
  return <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} />
}

function ComposerControls({ props }: Readonly<{ props: WebComposerProps }>) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const voiceActive = props.state === 'recording' || props.state === 'transcribing'
  if (voiceActive) return <div data-composer-controls className="flex shrink-0 items-center">
    <button type="button" aria-label={props.voiceWords.stop} disabled={props.state === 'transcribing'} onClick={props.onVoice}
      className={`flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] disabled:opacity-40 ${props.state === 'recording' ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-hover)] enabled:active:bg-[var(--primary-pressed)]' : 'bg-transparent text-[var(--fg-3)]'}`}>
      <Square size={16} fill="currentColor" aria-hidden="true" />
    </button>
  </div>
  const inputDisabled = props.state !== 'idle'
  const disabled = inputDisabled && !(props.state === 'atLimit' && props.onVoice)
  const items = [
    ...(props.onAttachImage ? [{ id: 'image', label: props.attachWords.image, icon: 'photo', disabled: inputDisabled }] : []),
    ...(props.onAttachFile ? [{ id: 'file', label: props.attachWords.file, icon: 'file', disabled: inputDisabled }] : []),
    ...(props.onVoice ? [{ id: 'voice', label: props.voiceWords.start, icon: 'microphone' }] : []),
  ]
  if (items.length === 0) return null
  return <div data-composer-controls className="flex shrink-0 items-center">
    <button ref={anchorRef} type="button" aria-label={props.words.actions} aria-haspopup="menu" aria-controls={open && !disabled ? menuId : undefined} aria-expanded={open && !disabled}
      disabled={disabled} onClick={() => setOpen(true)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}
      className="flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] disabled:opacity-40">
      <Plus size={20} strokeWidth={2} aria-hidden="true" />
    </button>
    <Menu id={menuId} open={open && !disabled} anchorRef={anchorRef} title={props.words.actions} items={items} onClose={() => setOpen(false)} onSelect={(id) => {
      if (id === 'image') props.onAttachImage?.()
      if (id === 'file') props.onAttachFile?.()
      if (id === 'voice') props.onVoice?.()
    }} />
  </div>
}

function ComposerInputRow({ props }: Readonly<{ props: WebComposerProps }>) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (props.state !== 'offline' && props.state !== 'atLimit') return
    const input = inputRef.current
    if (!input) return
    function updatePlaceholder() {
      const style = getComputedStyle(input!)
      const availableWidth = input!.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd)
      if (availableWidth <= 0) return
      const context = document.createElement('canvas').getContext('2d')!
      context.font = style.font
      context.letterSpacing = style.letterSpacing
      const largeText = parseFloat(style.fontSize) > 16 * 1.3
      input!.placeholder = largeText || context.measureText(props.words.placeholder).width <= availableWidth ? props.words.placeholder : ''
    }
    const observer = new ResizeObserver(updatePlaceholder)
    observer.observe(input)
    document.fonts.addEventListener('loadingdone', updatePlaceholder)
    updatePlaceholder()
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', updatePlaceholder)
    }
  }, [props.state, props.words.placeholder])
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = canSend || props.state === 'sending'

  return (
    <div data-composer-input-row data-focus-perimeter="" className="orbit-field-hover flex min-h-[56px] min-w-0 items-end rounded-[28px] bg-[var(--bg-field)] p-[4px] shadow-[inset_0_0_0_1px_var(--border-control)] has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:has-[textarea:focus-visible]:border-[Highlight]">
      {props.onOpenConversation && props.conversationLabel ? (
        <button
          type="button"
          aria-label={props.conversationLabel}
          data-open-conversation
          onClick={props.onOpenConversation}
          className="flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:[&_svg]:scale-[0.96] motion-safe:[&_svg]:transition-transform motion-safe:[&_svg]:duration-150"
        >
          <AstraGlyph size={20} color="currentColor" />
        </button>
      ) : null}

        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} /> : <textarea
          ref={inputRef}
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
          className="max-h-[calc(5lh+24px)] min-h-[48px] min-w-0 flex-1 resize-none appearance-none border-0 bg-transparent px-[8px] py-[12px] text-base text-[var(--fg-1)] focus-visible:outline-0 placeholder:text-[var(--fg-3)] disabled:cursor-not-allowed disabled:opacity-50 [field-sizing:content] [white-space:pre-wrap] [overflow-wrap:break-word]"
        />}

        <ComposerControls props={props} />

      <button
        type="button"
        aria-label={props.words.send}
        data-accent={sendIsAccent ? '' : undefined}
        aria-busy={props.state === 'sending' || undefined}
        disabled={!canSend}
        onClick={() => {
          if (canSend) props.onSend()
        }}
        className={`relative flex w-[48px] min-h-[48px] shrink-0 items-center justify-center overflow-hidden rounded-full border-0 transition-[background-color,opacity] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] disabled:cursor-not-allowed ${props.state === 'sending' ? '' : 'disabled:opacity-40'} ${sendIsAccent ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-hover)] enabled:active:bg-[var(--primary-pressed)]' : 'bg-[var(--bg-well)] text-[var(--fg-3)]'}`}
      >
        {props.state === 'sending' ? <Loader2 size={20} strokeWidth={2} className="animate-spin orbit-essential-loading" aria-hidden="true" /> : <ArrowUp size={20} strokeWidth={2} aria-hidden="true" />}
      </button>
    </div>
  )
}

function ComposerError({ props }: Readonly<{ props: ComposerProps }>) {
  if (!props.errorMessage && !props.errorRecovery) return null
  return <div className="flex min-w-0 flex-col gap-2">
    {props.errorMessage ? <p role="alert" className="m-0 text-sm text-[var(--status-bad-text)] [overflow-wrap:anywhere]">{props.errorMessage}</p> : null}
    {props.errorRecovery ? <button type="button" onClick={props.errorRecovery.onSelect}
      className="orbit-link-action min-h-[48px] self-start border-0 bg-transparent text-sm font-medium text-[var(--fg-2)]">
      {props.errorRecovery.label}
    </button> : null}
  </div>
}

function RetryControl({ props }: Readonly<{ props: ComposerProps }>) {
  if (!props.onRetry) return null
  return (
    <button
      type="button"
      onClick={props.onRetry}
      className="orbit-link-action flex min-h-[48px] items-center justify-center gap-2 self-start border-0 bg-transparent text-sm font-medium text-[var(--fg-2)] transition-[color] duration-[var(--dur-hover)] hover:text-[var(--fg-1)]"
    >
      <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
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
      aria-busy={props.state === 'sending'}
      data-state={props.state}
      data-composer-root
      role="group"
      aria-label={props.words.inputLabel ?? props.words.placeholder}
      tabIndex={-1}
      data-has-attachments={hasAttachments ? '' : undefined}
      data-can-retry={canRetry ? '' : undefined}
      className="@container flex shrink-0 flex-col gap-3 border-t border-[var(--hairline)] bg-[var(--bg)] p-[16px]"
    >
      {hasAttachments && props.attachWords && props.onAttachRemove ? (
        <AttachmentTray attachments={attachments} words={props.attachWords} onRemove={props.onAttachRemove} />
      ) : null}

      <ComposerError props={props} />
      <ComposerStatus props={props} />
      <ComposerInputRow props={props} />
      <RetryControl props={props} />
    </div>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { TypedTextarea } from '@/components/ui/typed-textarea'
import { PersonalText } from '@/components/ui/personal-text'

import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ClipboardEventHandler } from 'react'
import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { subscribeComposerRecordingTime } from '@orbit/shared/hooks'
import { buildComposerControls, selectComposerAction, COMPOSER_CHIP_GAP, COMPOSER_CHIP_PEEK, resolveComposerStripLayout } from '@orbit/shared/chat'
import { Clipboard, FileText, Image as ImageIcon, Loader2, Plus, Square, X } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { Sheet } from '@/components/ui/sheet'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useAuthStore } from '@/stores/auth-store'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { revealFocusedControl } from '@/lib/focus-scroll'
import { CompactComposerMenuContext } from './shell-pinned-content'

type WebComposerProps = ComposerProps & {
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
  inputId?: string
  inputSelection?: { start: number; end: number }
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
            className="min-h-[48px] min-w-0 flex-1 rounded-lg border-0 bg-transparent py-2 text-start text-sm text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]">
            <PersonalText>{attachment.name}</PersonalText>
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
      <PersonalText expanded className="m-0 text-base text-[var(--fg-1)]">{selectedName}</PersonalText>
    </Sheet> : null}
  </>
}

function SuggestionStrip({ suggestions, label }: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string }>) {
  const t = useTranslations()
  const layoutRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ availableWidth: 0, gap: COMPOSER_CHIP_GAP })
  useEffect(() => {
    const host = layoutRef.current!
    const observer = new ResizeObserver(() => {
      const availableWidth = host.getBoundingClientRect().width
      const chipWidths = [...host.querySelectorAll<HTMLElement>('[data-suggestion-content]')].map(content => {
        const buttonStyle = getComputedStyle(content.parentElement!)
        return content.getBoundingClientRect().width + parseFloat(buttonStyle.paddingInlineStart) + parseFloat(buttonStyle.paddingInlineEnd)
      })
      const next = { availableWidth, ...resolveComposerStripLayout(availableWidth, chipWidths) }
      setLayout(previous => previous.availableWidth === next.availableWidth && previous.gap === next.gap ? previous : next)
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
        style={{ gap: layout.gap }}
        className="flex min-w-0 items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {suggestions.map(suggestion => (
          <button
            key={suggestion.id}
            type="button"
            aria-label={`${suggestion.label}, ${t('nav.astra')}`}
            style={{ maxWidth }}
            onClick={(event) => {
              const root = event.currentTarget.closest('[data-composer-root]')
              if (root instanceof HTMLElement) root.focus()
              suggestion.onSelect()
            }}
            className="flex min-h-[48px] shrink-0 items-start gap-[8px] rounded-full border-0 bg-[var(--bg-well)] px-3 py-3 text-start text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
          >
            <span data-suggestion-content className="flex min-w-0 items-start gap-[8px]">
              <span aria-hidden="true" className="flex h-[1lh] shrink-0 items-center"><AstraGlyph size={16} /></span>
              <span data-suggestion-label className="min-w-0">{suggestion.label}</span><span translate="no">{t('nav.astra')}</span>
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

function AllowanceStatus({ props }: Readonly<{ props: ComposerProps }>) {
  const atLimit = props.state === 'atLimit'
  const withSuggestions = props.state === 'idle' && props.suggestions.length > 0
  return <div data-composer-status-slot className="grid min-h-[96px] min-w-0 gap-2">
    <div aria-hidden={!atLimit || undefined}
      className={`col-start-1 row-start-1 flex min-w-0 flex-col gap-2 ${atLimit ? '' : 'invisible'}`}>
      <p data-composer-allowance-reason className="m-0 min-h-[var(--touch-min)] text-sm leading-5 text-[var(--fg-2)]">
        {atLimit ? props.limitReason : props.allowanceReason}
      </p>
      <p data-composer-renewal className="m-0 text-sm leading-5 text-[var(--fg-2)]">{props.renewalHint}</p>
    </div>
    {!atLimit ? <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-2 self-start">
      {withSuggestions ? <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} /> : null}
      {props.usageMessage ? <p data-composer-usage className="m-0 t-meta leading-[1.4]">{props.usageMessage}</p> : null}
      {!withSuggestions ? <p className="m-0 text-sm leading-5 text-[var(--fg-2)]">{props.renewalHint}</p> : null}
    </div> : null}
    {atLimit ? props.limitRecovery : null}
  </div>
}

function ComposerControls({ props, onPaste, onClear }: Readonly<{ props: WebComposerProps; onPaste?: () => void; onClear?: () => void }>) {
  const compactMenu = useContext(CompactComposerMenuContext)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    compactMenu?.onOpenChange(open)
  }, [compactMenu, open])
  const menuId = useId()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const { voiceActive, disabled, label, items: defaultItems } = buildComposerControls(props)
  const textAction = onClear ? { id: 'clear', label: props.words.clear, icon: 'x' }
    : onPaste ? { id: 'paste', label: props.words.paste, icon: 'clipboard' } : null
  const items = textAction ? [textAction, ...defaultItems] : defaultItems
  if (voiceActive) return <div data-composer-controls className="flex shrink-0 items-center">
    <button type="button" aria-label={label} data-focus-on-primary={props.state === 'recording' ? '' : undefined} disabled={props.state === 'transcribing'} onClick={props.onVoice}
      className={`flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] disabled:opacity-40 ${props.state === 'recording' ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-hover)] enabled:active:bg-[var(--primary-pressed)]' : 'bg-transparent text-[var(--fg-3)]'}`}>
      <Square size={16} fill="currentColor" aria-hidden="true" />
    </button>
  </div>
  if (items.length === 0) return null
  return <div data-composer-controls className="flex shrink-0 items-center">
    <button ref={anchorRef} type="button" aria-label={label} aria-haspopup="menu" aria-controls={open && !disabled ? menuId : undefined} aria-expanded={open && !disabled}
      disabled={disabled} onClick={() => setOpen(true)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}
      className="flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] disabled:opacity-40">
      <Plus size={20} strokeWidth={2} aria-hidden="true" />
    </button>
    <Menu id={menuId} open={open && !disabled} anchorRef={anchorRef} returnFocus={compactMenu?.returnFocus} title={props.words.actions} items={items} onClose={() => setOpen(false)} onSelect={id => { if (id === 'clear') onClear?.(); else if (id === 'paste') onPaste?.(); else selectComposerAction(props, id) }} />
  </div>
}

function subscribeClipboardAvailability() { return () => {} }

function ComposerTextAction({ words, canClear, canPaste, inMenu, onClear, onPaste }: Readonly<{
  words: ComposerProps['words']; canClear: boolean; canPaste: boolean; inMenu: boolean; onClear: () => void; onPaste: () => void
}>) {
  if (inMenu || (!canClear && !canPaste)) return null
  return <button type="button" aria-label={canClear ? words.clear : words.paste}
    data-composer-clear={canClear ? '' : undefined} data-composer-paste={canPaste ? '' : undefined}
    onMouseDown={event => event.preventDefault()}
    onClick={canClear ? onClear : onPaste}
    className="flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]">
    {canClear ? <X size={20} strokeWidth={2} aria-hidden="true" /> : <Clipboard size={20} strokeWidth={2} aria-hidden="true" />}
  </button>
}

function ComposerTextControls({ props, inMenu, onPasteText, onClear }: Readonly<{ props: ComposerProps; inMenu: boolean; onPasteText: (text: string) => void; onClear: () => void }>) {
  const available = useSyncExternalStore(subscribeClipboardAvailability,
    () => typeof navigator !== 'undefined' && 'clipboard' in navigator && typeof navigator.clipboard.readText === 'function', () => false)
  const canClear = props.state === 'idle' && props.value.length > 0
  const canPaste = props.state === 'idle' && props.value.length === 0 && available
  const accountGeneration = useSyncExternalStore(subscribeToAccountGeneration, getAccountGeneration, getAccountGeneration)
  const clipboardScope = useRef({ active: false, pending: false })
  useEffect(() => {
    const scope = { active: true, pending: false }
    clipboardScope.current = scope
    return () => { scope.active = false }
  }, [props.state, props.value, accountGeneration])
  async function pasteMessage() {
    const scope = clipboardScope.current
    const { isAuthenticated, user } = useAuthStore.getState()
    const accountId = user?.userId
    if (scope.pending) return
    scope.pending = true
    try {
      const text = await navigator.clipboard.readText()
      const session = useAuthStore.getState()
      if (!scope.active || accountGeneration !== getAccountGeneration()
        || session.isAuthenticated !== isAuthenticated || session.user?.userId !== accountId) return
      if (text.length === 0) useAppToastStore.getState().showInfo(props.words.nothingToPaste)
      else onPasteText(text)
    } catch {
      return
    } finally { scope.pending = false }
  }
  return <div className="flex min-w-12 min-h-12 shrink-0 items-end gap-[4px]">
  {!inMenu ? <div className="w-12 min-h-12 shrink-0">
    <ComposerTextAction words={props.words} canClear={canClear} canPaste={canPaste} inMenu={inMenu} onClear={onClear} onPaste={() => void pasteMessage()} />
  </div> : null}
  <ComposerControls props={props} onPaste={canPaste && inMenu ? () => void pasteMessage() : undefined}
    onClear={canClear && inMenu ? onClear : undefined} />
  </div>
}

function useTextActionMenu(inputRef: React.RefObject<HTMLTextAreaElement | null>, placeholder: string, state: ComposerProps['state']) {
  const [inMenu, setInMenu] = useState(false)
  useEffect(() => {
    if (state !== 'idle') return
    const input = inputRef.current
    if (!input) return
    const row = input.parentElement!
    function measure() {
      if (input!.clientWidth <= 0) return
      const style = getComputedStyle(input!)
      const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
      const control = trailing.querySelector('button')!
      const slotWidth = control.getBoundingClientRect().width + parseFloat(getComputedStyle(trailing).columnGap)
      const hasSlot = row.querySelector('[data-composer-paste], [data-composer-clear]') !== null
      const available = input!.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd) - (hasSlot ? 0 : slotWidth)
      if (available <= 0) return
      const context = document.createElement('canvas').getContext('2d')!
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      context.letterSpacing = style.letterSpacing
      setInMenu(context.measureText(placeholder).width > available)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    observer.observe(input)
    document.fonts.addEventListener('loadingdone', measure)
    measure()
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [inputRef, placeholder, state])
  return inMenu
}

function ComposerInputRow({ props }: Readonly<{ props: WebComposerProps }>) {
  const t = useTranslations()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const textActionInMenu = useTextActionMenu(inputRef, props.words.placeholder, props.state)
  const pasteFocus = useRef<string | null>(null)
  useEffect(() => {
    if (pasteFocus.current === null || props.value !== pasteFocus.current || props.state !== 'idle') return
    const end = pasteFocus.current.length
    pasteFocus.current = null
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(end, end)
  }, [props.value, props.state])
  useEffect(() => {
    if (!props.inputSelection) return
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(props.inputSelection.start, props.inputSelection.end)
  }, [props.inputSelection])
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
  function clearMessage() { props.onChangeValue(''); inputRef.current?.focus() }

  return (
    <div data-composer-input-row data-focus-perimeter="" className="orbit-field-hover flex flex-wrap justify-end min-h-[56px] min-w-0 items-end rounded-[28px] bg-[var(--bg-field)] p-1 shadow-[inset_0_0_0_1px_var(--border-control)] has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:-outline-offset-2 [&_button:focus-visible]:outline-[var(--primary)] [&_button[data-focus-on-primary]:focus-visible]:shadow-[inset_0_0_0_4px_var(--bg)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:has-[textarea:focus-visible]:border-[Highlight]">
      {props.onOpenConversation && props.conversationLabel ? (
        <button
          type="button"
          aria-label={`${props.conversationLabel}, ${t('nav.astra')}`}
          data-open-conversation
          onClick={props.onOpenConversation}
          className="flex min-w-12 min-h-12 max-w-full shrink-0 items-center justify-center gap-2 px-2 py-1 rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:[&_svg]:scale-[0.96] motion-safe:[&_svg]:transition-transform motion-safe:[&_svg]:duration-150"
        >
          <AstraGlyph size={20} color="currentColor" /><span translate="no" className="text-sm">{t('nav.astra')}</span>
        </button>
      ) : null}

        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} /> : <TypedTextarea
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
          className="max-h-[calc(5lh+24px)] min-h-[48px] min-w-[3em] basis-[3em] flex-1 resize-none appearance-none border-0 bg-transparent px-2 py-3 text-base text-[var(--fg-1)] focus-visible:outline-0 placeholder:text-[var(--fg-3)] disabled:cursor-not-allowed disabled:opacity-50 [field-sizing:content] [white-space:pre-wrap] [overflow-wrap:break-word]"
        />}

      <div data-composer-trailing-controls className="flex max-w-full flex-wrap justify-end shrink-0 items-end gap-[4px]">
        <ComposerTextControls props={props} inMenu={textActionInMenu} onClear={clearMessage} onPasteText={text => {
          pasteFocus.current = text
          props.onChangeValue(text)
        }} />

      <button
        type="button"
        aria-label={`${props.words.send}, ${t('habits.form.askDate')}`}
        data-accent={sendIsAccent ? '' : undefined}
        data-focus-on-primary={sendIsAccent ? '' : undefined}
        aria-busy={props.state === 'sending' || undefined}
        disabled={!canSend}
        onClick={() => {
          if (canSend) props.onSend()
        }}
        className={`relative flex min-w-12 min-h-12 max-w-full shrink-0 items-center justify-center gap-2 px-2 py-1 overflow-hidden rounded-full border-0 transition-[background-color,opacity] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] disabled:cursor-not-allowed ${props.state === 'sending' ? '' : 'disabled:opacity-40'} ${sendIsAccent ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-hover)] enabled:active:bg-[var(--primary-pressed)]' : 'bg-[var(--bg-well)] text-[var(--fg-3)]'}`}
      >
        <AstraGlyph size={20} color="currentColor" /><span className="text-sm">{t('habits.form.askDate')}</span><span aria-hidden="true" className="inline-flex w-5 shrink-0" style={{ visibility: props.state === 'sending' ? 'visible' : 'hidden' }}><Loader2 size={20} strokeWidth={2} className="animate-spin orbit-essential-loading" /></span>
      </button>
      </div>
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
  const t = useTranslations()
  if (!props.onRetry) return null
  return (
    <button
      type="button"
      onClick={props.onRetry}
      aria-label={`${props.words.retry}, ${t('nav.astra')}`}
      className="orbit-link-action flex min-h-[48px] items-center justify-center gap-2 self-start border-0 bg-transparent text-sm font-medium text-[var(--fg-2)] transition-[color] duration-[var(--dur-hover)] hover:text-[var(--fg-1)]"
    >
      <AstraGlyph size={16} /><span>{props.words.retry}</span><span translate="no">{t('nav.astra')}</span>
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
    input?.setSelectionRange(input.value.length, input.value.length)
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
  const showAllowanceStatus = Boolean(props.allowanceReason && props.renewalHint)
    && (props.state === 'idle' || props.state === 'sending' || props.state === 'atLimit')

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
      className="@container flex shrink-0 flex-col gap-3 border-t border-[var(--hairline)] bg-[var(--bg)] p-4"
    >
      {hasAttachments && props.attachWords && props.onAttachRemove ? (
        <AttachmentTray attachments={attachments} words={props.attachWords} onRemove={props.onAttachRemove} />
      ) : null}

      <ComposerError props={props} />
      {showAllowanceStatus ? <AllowanceStatus props={props} /> : <ComposerStatus props={props} />}
      <ComposerInputRow props={props} />
      {!showAllowanceStatus && props.usageMessage ? <p data-composer-usage className="m-0 t-meta leading-[1.4]">{props.usageMessage}</p> : null}
      <RetryControl props={props} />
    </div>
  )
}

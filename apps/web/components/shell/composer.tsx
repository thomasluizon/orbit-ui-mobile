'use client'

import { motion } from 'motion/react'
import { useConversationMotion } from '@/hooks/use-conversation-motion'
import { useConversationComposerId } from './conversation-composer-motion'

import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'

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
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { isComposerEditable, buildComposerPrimaryControl, buildComposerControls, selectComposerAction, COMPOSER_CHIP_GAP, COMPOSER_CHIP_PEEK, resolveComposerStripLayout } from '@orbit/shared/chat'
import { ArrowUp, ChevronDown, Clipboard, FileText, Image as ImageIcon, Mic, Plus, Square, X } from '@/components/ui/icons'
import * as Menu from '@/components/ui/dropdown-menu'
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

function SuggestionStrip({ suggestions, label, disclosure }: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string; disclosure?: React.ReactNode }>) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ availableWidth: 0, gap: COMPOSER_CHIP_GAP })
  useEffect(() => {
    const host = layoutRef.current!
    const observer = new ResizeObserver(() => {
      const availableWidth = host.getBoundingClientRect().width
      const chipWidths = [...host.querySelectorAll<HTMLElement>('[data-suggestion-content]')].map(content => {
        const buttonStyle = getComputedStyle(content.parentElement!)
        return content.getBoundingClientRect().width + Number.parseFloat(buttonStyle.paddingInlineStart) + Number.parseFloat(buttonStyle.paddingInlineEnd)
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
    <div data-composer-suggestion-row className="flex min-w-0 items-start gap-3">
      <div ref={layoutRef} className="min-w-0 flex-1">
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
              aria-label={suggestion.label}
              style={{ maxWidth: disclosure ? undefined : maxWidth }}
              onClick={(event) => {
                const root = event.currentTarget.closest('[data-composer-root]')
                if (root instanceof HTMLElement) root.focus()
                suggestion.onSelect()
              }}
              className="flex min-h-[48px] shrink-0 items-center gap-[8px] rounded-full border-0 bg-[var(--bg-well)] px-3 py-3 text-start text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
            >
              <span data-suggestion-content className="flex min-w-0 items-start gap-[8px]">
                <span aria-hidden="true" className="flex h-[1lh] shrink-0 items-center"><AstraGlyph size={16} /></span>
                <span className="min-w-0"><span data-suggestion-label className={disclosure ? 'whitespace-nowrap' : undefined}>{suggestion.label}</span></span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {disclosure}
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

function ComposerStatus({ props, disclosure }: Readonly<{ props: WebComposerProps; disclosure?: React.ReactNode }>) {
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
  return <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} disclosure={disclosure} />
}

function AllowanceStatus({ props, disclosure }: Readonly<{ props: ComposerProps; disclosure?: React.ReactNode }>) {
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
      {withSuggestions ? <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} disclosure={disclosure} /> : null}
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
  const { disabled, label, items: defaultItems } = buildComposerControls(props)
  const textAction = onClear ? { id: 'clear', label: props.words.clear, icon: 'x' }
    : onPaste ? { id: 'paste', label: props.words.paste, icon: 'clipboard' } : null
  const items = textAction ? [textAction, ...defaultItems] : defaultItems
  if (items.length === 0) return null
  return <Menu.Root open={open && !disabled} onOpenChange={setOpen}><div data-composer-controls className="flex shrink-0 items-center">
    <Menu.Trigger asChild disabled={disabled}><button ref={anchorRef} type="button" aria-label={label}
      aria-haspopup="menu" aria-controls={open && !disabled ? menuId : undefined}
      aria-expanded={open && !disabled}
      disabled={disabled}
      className="flex w-[48px] min-h-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] disabled:opacity-40">
      <Plus size={20} strokeWidth={2} aria-hidden="true" className="text-[var(--fg-3)]" />
    </button></Menu.Trigger>
    <Menu.Content id={menuId} presentation={compactMenu ? 'sheet' : 'auto'} returnFocus={compactMenu?.returnFocus} title={props.words.actions} items={items} onSelect={id => { if (id === 'clear') onClear?.(); else if (id === 'paste') onPaste?.(); else selectComposerAction(props, id) }} />
  </div></Menu.Root>
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

function ComposerTextControls({ props, inMenu, onPasteText, onClear, disclosure }: Readonly<{ props: ComposerProps; inMenu: boolean; disclosure?: React.ReactNode; onPasteText: (text: string) => void; onClear: () => void }>) {
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
  return <div data-composer-text-controls style={{ gap: INTERACTION_FILL_CLEARANCE }} className="flex min-w-12 min-h-12 shrink-0 items-end">
  {disclosure || (props.state !== 'recording' && props.state !== 'transcribing') ? <div data-composer-text-action-slot className="w-12 min-h-12 shrink-0">
    {disclosure ?? <ComposerTextAction words={props.words} canClear={canClear} canPaste={canPaste} inMenu={inMenu} onClear={onClear} onPaste={() => void pasteMessage()} />}
  </div> : null}
  <ComposerControls props={props} onPaste={canPaste && inMenu ? () => void pasteMessage() : undefined}
    onClear={canClear && inMenu ? onClear : undefined} />
  </div>
}

function useTextActionMenu(inputRef: React.RefObject<HTMLTextAreaElement | null>, inputLabel: string, state: ComposerProps['state']) {
  const [inMenu, setInMenu] = useState(false)
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const row = input.closest<HTMLElement>('[data-composer-input-row]')!
    function measure() {
      if (row.clientWidth <= 0) return
      const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
      const textControls = trailing.querySelector<HTMLElement>('[data-composer-text-controls]')!
      const inlineControlsWidth = textControls.getBoundingClientRect().width
      const sendWidth = trailing.lastElementChild!.getBoundingClientRect().width
      const entryWidth = row.querySelector('[data-open-conversation]')?.getBoundingClientRect().width ?? 0
      const rowStyle = getComputedStyle(row)
      const available = row.clientWidth - Number.parseFloat(rowStyle.paddingInlineStart) - Number.parseFloat(rowStyle.paddingInlineEnd)
      const minimumWidth = row.querySelector('[data-composer-input-minimum]')!.getBoundingClientRect().width
      const inMenu = entryWidth + minimumWidth + inlineControlsWidth + sendWidth + Number.parseFloat(getComputedStyle(trailing).columnGap) > available
      setInMenu(inMenu)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    observer.observe(input)
    document.fonts.addEventListener('loadingdone', measure)
    measure()
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [inputRef, inputLabel, state])
  return inMenu
}

const composerInputMetrics = 'px-2 py-3 text-base'

function ComposerPrimaryControl({ props, inputRef }: Readonly<{ props: ComposerProps; inputRef: React.RefObject<HTMLTextAreaElement | null> }>) {
  const action = buildComposerPrimaryControl(props)
  const isSend = action.kind === 'send'
  const color = action.accented ? 'var(--fg-on-primary)' : 'var(--fg-3)'
  return <button type="button" aria-label={action.label} title={isSend ? undefined : action.label}
    data-accent={isSend && action.accented ? '' : undefined}
    data-composer-microphone={action.kind === 'microphone' ? '' : undefined}
    data-focus-on-primary={action.accented ? '' : undefined}
    disabled={action.disabled} onClick={() => {
      if (isSend && !action.disabled) inputRef.current?.focus()
      action.onSelect()
    }}
    className={`relative flex w-[48px] min-h-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-0 ease-[var(--ease-standard)] duration-[var(--dur-hover-control)] disabled:cursor-not-allowed ${isSend ? 'transition-[background-color,opacity]' : 'transition-[background-color]'} ${!isSend || props.state !== 'sending' ? 'disabled:opacity-40' : ''} ${action.accented ? 'bg-[var(--primary)] enabled:hover:bg-[var(--primary-hover)] enabled:active:bg-[var(--primary-pressed)]' : isSend ? 'bg-[var(--bg-well)]' : 'bg-transparent enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)]'}`}>
    {isSend ? <ArrowUp size={20} strokeWidth={2} color={color} aria-hidden="true" />
      : action.kind === 'stop' ? <Square size={16} fill={color} color={color} aria-hidden="true" /> : <Mic size={20} strokeWidth={2} color={color} aria-hidden="true" />}
  </button>
}

function ComposerInputRow({ props, disclosure }: Readonly<{ props: WebComposerProps; disclosure?: React.ReactNode }>) {
  const configuration = useConversationMotion()
  const composerId = useConversationComposerId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputLabel = props.words.inputLabel ?? props.words.placeholder
  const textActionInMenu = useTextActionMenu(inputRef, inputLabel, props.state)
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
      const availableWidth = input!.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd)
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
  const inputDisabled = !isComposerEditable(props.state)
  const canSend = (props.state === 'idle' || props.state === 'sending') && hasComposerContent(props.value, props.attachments)
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  function clearMessage() { props.onChangeValue(''); inputRef.current?.focus() }

  return (
    <motion.div layout={configuration.changeDuration > 0}
      layoutId={configuration.changeDuration > 0 && composerId && (props.onOpenConversation || props.autoFocus) ? composerId : undefined}
      transition={{ duration: configuration.changeDuration / 1000, ease: configuration.easing }}
      data-composer-input-row data-focus-perimeter="" className="orbit-field-hover flex flex-wrap justify-end min-h-[56px] min-w-0 items-end rounded-[28px] bg-[var(--bg-field)] p-2 shadow-[inset_0_0_0_1px_var(--border-control)] has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:-outline-offset-2 [&_button:focus-visible]:outline-[var(--primary)] [&_button[data-focus-on-primary]:focus-visible]:shadow-[inset_0_0_0_4px_var(--bg)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:has-[textarea:focus-visible]:border-[Highlight]">
      <motion.div layout={configuration.changeDuration > 0 ? "position" : false}
        transition={{ duration: configuration.changeDuration / 1000, ease: configuration.easing }}
        data-composer-leading-controls className="flex w-max min-w-0 max-w-full grow shrink-0 items-end">
      {props.onOpenConversation && props.conversationLabel ? (
        <button
          type="button"
          aria-label={props.conversationLabel}
          data-open-conversation
          onClick={props.onOpenConversation}
          className="flex min-w-12 min-h-12 max-w-full shrink-0 items-center justify-center gap-2 px-2 py-1 rounded-full border-0 bg-transparent text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:[&_svg]:scale-[0.96] motion-safe:[&_svg]:transition-transform motion-safe:[&_svg]:duration-150"
        >
          <AstraGlyph size={20} color="var(--fg-3)" />
        </button>
      ) : null}

        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} /> : <div data-composer-input-slot className="grid grid-cols-1 w-max min-w-0 max-w-full grow shrink">
        <span data-composer-input-minimum aria-hidden="true" className={`pointer-events-none invisible col-start-1 row-start-1 w-max max-w-full overflow-hidden whitespace-pre ${composerInputMetrics}`}>{inputLabel}</span>
        <TypedTextarea
          ref={inputRef}
          id={props.inputId}
          rows={1}
          data-composer-input
          aria-label={inputLabel}
          disabled={inputDisabled}
          placeholder={props.words.placeholder}
          value={props.value}
          onChange={(event) => props.onChangeValue(event.target.value)}
          onKeyDown={(event) => handleSendKeyDown(event, canSend, props.onSend)}
          onPaste={props.onPaste}
          onFocus={props.onOpenConversation}
          className={`col-start-1 row-start-1 w-0 min-w-full max-h-[calc(5lh+24px)] min-h-[48px] resize-none appearance-none border-0 bg-transparent ${composerInputMetrics} text-[var(--fg-1)] focus-visible:outline-0 placeholder:text-[var(--fg-3)] placeholder:whitespace-normal disabled:cursor-not-allowed disabled:opacity-50 [field-sizing:content] [white-space:pre-wrap] [overflow-wrap:break-word]`}
        /></div>}
      </motion.div>

      <motion.div layout={configuration.changeDuration > 0 ? "position" : false}
        transition={{ duration: configuration.changeDuration / 1000, ease: configuration.easing }}
        data-composer-trailing-controls style={{ gap: INTERACTION_FILL_CLEARANCE }} className="flex max-w-full flex-wrap justify-end shrink-0 items-end">
        <ComposerTextControls props={props} inMenu={Boolean(disclosure) || textActionInMenu} disclosure={disclosure} onClear={clearMessage} onPasteText={text => {
          pasteFocus.current = text
          props.onChangeValue(text)
        }} />

      <ComposerPrimaryControl props={props} inputRef={inputRef} />
      </motion.div>
    </motion.div>
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
      aria-label={props.words.retry}
      className="flex w-[48px] min-h-[48px] items-center justify-center self-start rounded-full border-0 bg-transparent text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
    >
      <AstraGlyph size={20} />
    </button>
  )
}

function ComposerDisclosure({ collapsed, contentId, onToggle }: Readonly<{ collapsed: boolean; contentId: string; onToggle: () => void }>) {
  const t = useTranslations()
  return <button type="button" aria-label={t(collapsed ? 'shell.composer.expand' : 'shell.composer.collapse')}
    aria-expanded={!collapsed} aria-controls={contentId} data-composer-collapse-row={collapsed ? '' : undefined}
    data-composer-disclosure onClick={onToggle}
    className={`flex h-[48px] min-h-[48px] shrink-0 items-center rounded-xl border-0 bg-transparent text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] ${collapsed ? 'w-full justify-between px-2' : 'w-[48px] justify-center'}`}>
    {collapsed ? <AstraGlyph size={20} /> : null}
    <ChevronDown size={20} aria-hidden="true" className={collapsed ? 'rotate-180' : undefined} />
  </button>
}

function PromptQueue({ props }: Readonly<{ props: WebComposerProps }>) {
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  return <>
      {props.queue?.items.length ? <div role="list" aria-label={props.queue.label} className="flex flex-col gap-2">
        {props.queue.items.map(prompt => <div key={prompt.id} role="listitem" className="flex min-h-12 min-w-0 items-start gap-2 rounded-xl bg-[var(--bg-well)] px-3">
          <button type="button" aria-label={prompt.content} onClick={() => setSelectedPrompt(prompt.content)}
            className="min-h-12 min-w-0 flex-1 rounded-lg py-3 text-start text-sm text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"><PersonalText>{prompt.content}</PersonalText></button>
          {props.queue?.canSend ? <button type="button" aria-label={props.queue.sendLabel(prompt.content)} onClick={() => props.queue?.onSend(prompt.id)}
            className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"><ArrowUp size={20} aria-hidden="true" /></button> : null}
          <button type="button" aria-label={props.queue?.removeLabel(prompt.content)} onClick={() => props.queue?.onRemove(prompt.id)}
            className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"><X size={20} aria-hidden="true" /></button>
        </div>)}
      </div> : null}
      {props.queue?.pausedReason ? <p role="status" className="m-0 text-sm text-[var(--fg-2)]">{props.queue.pausedReason}</p> : null}
      {props.replyControl ? <button type="button" aria-label={props.replyControl.label} onClick={props.replyControl.onStop}
        className="flex min-h-12 items-center gap-2 self-start rounded-full px-3 text-sm text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"><Square size={20} aria-hidden="true" />{props.replyControl.label}</button> : null}
    {selectedPrompt && props.queue ? <Sheet title={props.queue.label} onClose={() => setSelectedPrompt(null)}><PersonalText expanded>{selectedPrompt}</PersonalText></Sheet> : null}
  </>
}

function ComposerContent({ props, disclosure }: Readonly<{ props: WebComposerProps; disclosure?: React.ReactNode }>) {
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const showAllowanceStatus = Boolean(props.allowanceReason && props.renewalHint)
    && (props.state === 'idle' || props.state === 'sending' || props.state === 'atLimit')
  const withSuggestions = props.state === 'idle' && props.suggestions.length > 0
  return <>
      {hasAttachments && props.attachWords && props.onAttachRemove ? (
        <AttachmentTray attachments={attachments} words={props.attachWords} onRemove={props.onAttachRemove} />
      ) : null}

      <PromptQueue props={props} />
      <ComposerError props={props} />
      {showAllowanceStatus ? <AllowanceStatus props={props} disclosure={disclosure} /> : <ComposerStatus props={props} disclosure={disclosure} />}
      <ComposerInputRow props={props} disclosure={withSuggestions ? undefined : disclosure} />
      {!showAllowanceStatus && props.usageMessage ? <p data-composer-usage className="m-0 t-meta leading-[1.4]">{props.usageMessage}</p> : null}
      <RetryControl props={props} />
  </>
}

export function Composer(props: Readonly<WebComposerProps>) {
  const savedCollapsed = useUIStore(state => props.collapseScope === 'today' ? state.todayComposerCollapsed : state.habitComposerCollapsed)
  const collapsed = Boolean(props.collapsible && savedCollapsed)
  const contentId = useId()
  const composerRef = useRef<HTMLDivElement>(null)
  const disclosureFocusPending = useRef(false)
  function toggleCollapsed() {
    disclosureFocusPending.current = true
    const preferences = useUIStore.getState()
    if (props.collapseScope === 'today') preferences.setTodayComposerCollapsed(!collapsed)
    else preferences.setHabitComposerCollapsed(!collapsed)
  }
  useEffect(() => {
    if (!disclosureFocusPending.current) return
    disclosureFocusPending.current = false
    composerRef.current?.querySelector<HTMLButtonElement>(collapsed ? '[data-composer-collapse-row]' : '[data-composer-disclosure]')?.focus()
  }, [collapsed])
  const inputDisabled = !isComposerEditable(props.state)
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

  const disclosure = props.collapsible ? <ComposerDisclosure collapsed={false} contentId={contentId} onToggle={toggleCollapsed} /> : undefined
  const content = <ComposerContent props={props} disclosure={disclosure} />
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
      data-collapsed={props.collapsible ? collapsed : undefined}
      className={`@container flex shrink-0 flex-col border-t border-[var(--hairline)] bg-[var(--bg)] ${collapsed ? 'py-1' : 'py-4'}`}
    >
      <div data-composer-content="" className={`mx-auto w-full max-w-[740px] px-4 ${collapsed ? 'gap-0' : 'flex flex-col gap-3'}`}>
      {collapsed ? <ComposerDisclosure collapsed contentId={contentId} onToggle={toggleCollapsed} /> : null}
      {props.collapsible ? <div id={contentId} hidden={collapsed} className={collapsed ? 'hidden' : 'flex min-w-0 flex-col gap-3'}>{content}</div> : content}
      </div>
    </div>
  )
}

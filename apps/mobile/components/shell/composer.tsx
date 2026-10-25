import { useTranslation } from 'react-i18next'
import { INTERACTION_FILL_CLEARANCE, SPACING } from '@orbit/shared/theme'
import { TypedTextInput } from '@/components/ui/typed-text-input'
import { PersonalText } from '@/components/ui/personal-text'
import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { subscribeComposerRecordingTime } from '@orbit/shared/hooks'
import { buildComposerControls, selectComposerAction, COMPOSER_CHIP_GAP, COMPOSER_CHIP_PEEK, resolveComposerStripLayout } from '@orbit/shared/chat'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, AccessibilityInfo, Animated, findNodeHandle, ScrollView, StyleSheet, Text, type TextInput, type LayoutChangeEvent, View, useWindowDimensions } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { captureError } from '@/lib/sentry'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useAuthStore } from '@/stores/auth-store'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { useUIStore } from '@/stores/ui-store'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ArrowUp, ChevronDown, Clipboard as ClipboardIcon, FileText, Image, Plus, Square, X } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { mobileMotion, toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import * as Menu from '@/components/ui/dropdown-menu'
import { Sheet } from '@/components/ui/sheet'

function AttachmentIcon({ kind, color }: Readonly<Pick<ComposerAttachment, 'kind'> & { color: string }>) {
  return kind === 'image' ? (
    <Image size={20} strokeWidth={2} color={color} />
  ) : (
    <FileText size={20} strokeWidth={2} color={color} />
  )
}

function AttachmentTray({
  attachments,
  words,
  onRemove,
  tokens,
}: Readonly<{
  attachments: readonly ComposerAttachment[]
  words: ComposerAttachWords
  onRemove: (id: string) => void
  tokens: AppTokensV2
}>) {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  return <>
    <View accessible={false} testID="composer-attachment-tray" style={styles.tray}>
      {attachments.map((attachment) => (
        <View
          key={attachment.id}
          testID={`composer-attachment-${attachment.kind}`}
          style={[styles.attachmentRow, { backgroundColor: tokens.bgWell, borderColor: tokens.hairline }]}
        >
          <AttachmentIcon kind={attachment.kind} color={tokens.fg2} />
          <InsetFocusPressable accessibilityRole="button" accessibilityLabel={attachment.name} onPress={() => setSelectedName(attachment.name)}
            style={({ pressed }) => [styles.attachmentNameControl, pressed ? { backgroundColor: tokens.bgHover } : null]}>
            <PersonalText style={[styles.attachmentName, { color: tokens.fg2 }]}>{attachment.name}</PersonalText>
          </InsetFocusPressable>
          <InsetFocusPressable
            accessibilityRole="button"
            accessibilityLabel={words.remove(attachment.name)}
            onPress={() => onRemove(attachment.id)}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? { backgroundColor: tokens.bgHover } : null,
            ]}
          >
            <X size={20} strokeWidth={2} color={tokens.fg3} />
          </InsetFocusPressable>
        </View>
      ))}
    </View>
    {selectedName ? <Sheet title={words.trayLabel} onClose={() => setSelectedName(null)}>
      <PersonalText expanded style={[styles.fullAttachmentName, { color: tokens.fg1 }]}>{selectedName}</PersonalText>
    </Sheet> : null}
  </>
}

function SuggestionStrip({
  suggestions,
  label,
  tokens,
  focusTarget,
  disclosure,
}: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null>; disclosure?: React.ReactNode }>) {
  const { fontScale } = useWindowDimensions()
  const [availableWidth, setAvailableWidth] = useState(0)
  const [measurements, setMeasurements] = useState<Record<string, number>>({})
  const widths = suggestions.map(suggestion => measurements[suggestion.id] ?? 0)
  const layout = resolveComposerStripLayout(availableWidth, widths)
  const maxWidth = availableWidth > 0 ? availableWidth - COMPOSER_CHIP_GAP - COMPOSER_CHIP_PEEK : undefined
  return (
    <View testID="composer-suggestion-row" style={styles.suggestionRow}>
      <View style={styles.suggestionStrip} testID="composer-suggestions-layout" onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)}>
        <ScrollView
          horizontal
          accessibilityLabel={label}
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={[styles.suggestions, { gap: layout.gap }]}
        >
          {suggestions.map(suggestion => (
            <InsetFocusPressable
              key={suggestion.id}
              accessibilityRole="button"
              accessibilityLabel={suggestion.label}
              onPress={() => {
                if (focusTarget.current) AccessibilityInfo.sendAccessibilityEvent(focusTarget.current, 'focus')
                suggestion.onSelect()
              }}
              style={({ pressed }) => [
                styles.suggestion,
                { maxWidth: disclosure ? undefined : maxWidth,
                  backgroundColor: pressed ? tokens.bgHover : tokens.bgWell, borderColor: tokens.hairline },
              ]}
            >
              <View
                testID="composer-suggestion-content"
                onLayout={event => {
                  const width = event.nativeEvent.layout.width + 2 * (styles.suggestion.paddingHorizontal + styles.suggestion.borderWidth)
                  setMeasurements(previous => previous[suggestion.id] === width ? previous : { ...previous, [suggestion.id]: width })
                }}
                style={[styles.suggestionContent, disclosure ? { flexShrink: 0 } : null]}
              >
                {suggestion.icon ? <View style={[styles.suggestionIcon, { height: 20 * fontScale }]}>{suggestion.icon}</View> : null}
                <AstraGlyph size={16} color={tokens.fg2} /><Text style={[styles.suggestionText, { color: tokens.fg2 }]}>{suggestion.label}</Text>
              </View>
            </InsetFocusPressable>
          ))}
        </ScrollView>
      </View>
      {disclosure}
    </View>
  )
}

function VoiceStatus({
  state,
  words,
  tokens,
}: Readonly<{
  state: 'recording' | 'transcribing'
  words: ComposerVoiceWords
  tokens: AppTokensV2
}>) {
  const [elapsed, setElapsed] = useState('00:00')
  useEffect(() => {
    if (state !== 'recording') return
    return subscribeComposerRecordingTime(setElapsed)
  }, [state])
  return (
    <View testID="composer-voice-row" accessibilityLabel={state === 'recording' ? words.recording : words.transcribing} style={styles.voiceStatus}>
      {state === 'recording' ? <Text accessibilityLiveRegion="none" style={[styles.recordingTime, { color: tokens.fg2 }]}>{elapsed}</Text> : null}
    </View>
  )
}

function AllowanceStatus({ props, tokens, focusTarget, disclosure }: Readonly<{ props: ComposerProps; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null>; disclosure?: React.ReactNode }>) {
  const atLimit = props.state === 'atLimit'
  const withSuggestions = props.state === 'idle' && props.suggestions.length > 0
  return <View testID="composer-status-slot" style={[styles.limitStatus, styles.allowanceSlot]}>
    <View accessible={false} accessibilityElementsHidden={!atLimit}
      importantForAccessibility={atLimit ? 'auto' : 'no-hide-descendants'}
      style={[styles.limitStatus, !atLimit && styles.allowancePreview]}>
      <Text testID="composer-allowance-reason" style={[styles.limitReason, { color: tokens.fg2 }]}>
        {atLimit ? props.limitReason : props.allowanceReason}
      </Text>
      <Text testID="composer-renewal" style={[styles.allowanceText, { color: tokens.fg2 }]}>{props.renewalHint}</Text>
    </View>
    {!atLimit ? <View style={[styles.limitStatus, styles.allowanceUsage]}>
      {withSuggestions ? <SuggestionStrip suggestions={props.suggestions} label={props.words.suggestionsLabel} tokens={tokens} focusTarget={focusTarget} disclosure={disclosure} /> : null}
      {props.usageMessage ? <Text testID="composer-usage" style={[styles.usage, { color: tokens.fg3 }]}>{props.usageMessage}</Text> : null}
      {!withSuggestions ? <Text style={[styles.allowanceText, { color: tokens.fg2 }]}>{props.renewalHint}</Text> : null}
    </View> : null}
    {atLimit ? props.limitRecovery : null}
  </View>
}

function ComposerStatus({ props, tokens, focusTarget, disclosure }: Readonly<{ props: ComposerProps; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null>; disclosure?: React.ReactNode }>) {
  if (props.state === 'atLimit' || props.state === 'offline') {
    return (
      <View style={styles.limitStatus}>
        <Text style={[styles.limitReason, { color: tokens.fg2 }]}>{props.limitReason}</Text>
        {props.limitRecovery}
      </View>
    )
  }
  if (props.state === 'recording' || props.state === 'transcribing') {
    return <View style={styles.limitStatus} accessibilityLiveRegion="polite">
      <Text style={[styles.statusText, { color: tokens.fg2 }]}>{props.state === 'recording' ? props.voiceWords.recording : props.voiceWords.transcribing}</Text>
      {props.words.offlineReason ? <Text style={[styles.limitReason, { color: tokens.fg2 }]}>{props.words.offlineReason}</Text> : null}
    </View>
  }
  if (props.state === 'sending' || props.suggestions.length === 0) return null
  return (
    <SuggestionStrip
      suggestions={props.suggestions}
      label={props.words.suggestionsLabel}
      tokens={tokens}
      focusTarget={focusTarget}
      disclosure={disclosure}
    />
  )
}

type MobileComposerProps = ComposerProps & {
  inputSelection?: { start: number; end: number }
  autoFocus?: boolean
  onInputFocus?: () => void
  onInputBlur?: () => void
}

function composerFieldStyle(tokens: AppTokensV2, focused: boolean, disabled: boolean) {
  const showFocusBorder = focused && !disabled
  return {
    borderColor: showFocusBorder ? tokens.primary : tokens.borderControl,
    borderWidth: showFocusBorder ? 2 : 1,
  }
}

function composerActionStyle(tokens: AppTokensV2, recording: boolean, disabled: boolean, pressed: boolean) {
  return [styles.iconButton,
    recording ? { backgroundColor: pressed ? tokens.primaryPressed : tokens.primary } : null,
    pressed && !recording ? { backgroundColor: tokens.bgHover } : null,
    disabled ? styles.disabled : null,
  ]
}

function ComposerActionIcon({ state, tokens }: Readonly<{ state: ComposerProps['state']; tokens: AppTokensV2 }>) {
  if (state === 'recording' || state === 'transcribing') {
    const color = state === 'recording' ? tokens.fgOnPrimary : tokens.fg3
    return <Square size={16} fill={color} color={color} />
  }
  return <Plus size={20} strokeWidth={2} color={tokens.fg3} />
}

function ComposerControls({ props, tokens, onPaste, onClear }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2; onPaste?: () => void; onClear?: () => void }>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { voiceActive, disabled, label, items: defaultItems } = buildComposerControls(props)
  const textAction = onClear ? { id: 'clear', label: props.words.clear, icon: 'x' }
    : onPaste ? { id: 'paste', label: props.words.paste, icon: 'clipboard' } : null
  const items = textAction ? [textAction, ...defaultItems] : defaultItems
  const isRecording = props.state === 'recording'
  const showMenu = menuOpen && !disabled && !voiceActive
  if (!voiceActive && items.length === 0) return null
  return <Menu.Root open={showMenu} onOpenChange={setMenuOpen}><View testID="composer-controls" style={styles.controls}>
    <Menu.Trigger asChild disabled={disabled || voiceActive}>
      <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label}
        focusColor={tokens.primary}
        focusContrastColor={isRecording ? tokens.bg : undefined}
        accessibilityState={{ disabled, ...(!voiceActive ? { expanded: showMenu } : {}) }} aria-disabled={disabled} aria-expanded={voiceActive ? undefined : showMenu} disabled={disabled} onPress={voiceActive ? props.onVoice : undefined}
        style={({ pressed }) => composerActionStyle(tokens, isRecording, disabled, pressed)}>
        <ComposerActionIcon state={props.state} tokens={tokens} />
      </InsetFocusPressable>
    </Menu.Trigger>
    <Menu.Content title={props.words.actions} items={items} onSelect={id => { if (id === 'clear') onClear?.(); else if (id === 'paste') onPaste?.(); else selectComposerAction(props, id) }} />
  </View></Menu.Root>
}

function PasteFitMeasure({ props, availableWidth, onPasteFit }: Readonly<{
  props: ComposerProps
  availableWidth: number | undefined
  onPasteFit: (fits: boolean) => void
}>) {
  return <Text testID="composer-paste-measure" pointerEvents="none" accessible={false}
    importantForAccessibility="no-hide-descendants"
    onTextLayout={event => onPasteFit(event.nativeEvent.lines.length <= 1)}
    style={[styles.placeholder, { opacity: 0 }, availableWidth === undefined ? null : { end: undefined, width: Math.max(0, availableWidth - 2 * styles.inputMetrics.paddingHorizontal) }]}>
    {props.words.inputLabel ?? props.words.placeholder}
  </Text>
}

type PlaceholderMeasurement = { fontScale: number; height: number }

function composerEmptyHeight(fontScale: number, placeholder: PlaceholderMeasurement | null, allowance: PlaceholderMeasurement | null, reserveAllowance: boolean) {
  const minimumHeight = 24 * fontScale + 24
  if (fontScale <= 1.3) return minimumHeight
  return Math.max(minimumHeight,
    placeholder?.fontScale === fontScale ? placeholder.height + 24 : minimumHeight,
    reserveAllowance && allowance?.fontScale === fontScale ? allowance.height + 24 : minimumHeight,
  )
}

function ComposerTextInput({ props, tokens, inputRef, onFocusChange, availableWidth, onPasteFit }: Readonly<{
  props: MobileComposerProps
  tokens: AppTokensV2
  inputRef: React.RefObject<TextInput | null>
  onFocusChange: (focused: boolean) => void
  availableWidth: number | undefined
  onPasteFit: (fits: boolean) => void
}>) {
  const { t } = useTranslation()
  const { fontScale } = useWindowDimensions()
  const [contentHeight, setContentHeight] = useState(48)
  const [placeholderHeight, setPlaceholderHeight] = useState<PlaceholderMeasurement | null>(null)
  const [allowancePlaceholderHeight, setAllowancePlaceholderHeight] = useState<PlaceholderMeasurement | null>(null)
  const [placeholderLayout, setPlaceholderLayout] = useState<{ text: string; fontScale: number; fits: boolean } | null>(null)
  const largeText = fontScale > 1.3
  const measurePlaceholder = props.state === 'offline' || props.state === 'atLimit'
  const placeholderFits = largeText || !measurePlaceholder || (!placeholderHeight && !placeholderLayout)
    || (placeholderLayout?.text === props.words.placeholder && placeholderLayout.fontScale === fontScale && placeholderLayout.fits)
  const minimumHeight = 24 * fontScale + 24
  const maximumHeight = 5 * 24 * fontScale + 24
  const emptyHeight = composerEmptyHeight(fontScale, placeholderHeight, allowancePlaceholderHeight, Boolean(props.allowanceReason))
  const inputHeight = props.value.length === 0 ? emptyHeight : Math.min(maximumHeight, Math.max(minimumHeight, contentHeight))
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  return (
<View testID="composer-text-slot" style={[styles.textSlot, { minHeight: inputHeight }]}>
        <Text testID="composer-input-minimum" pointerEvents="none" accessible={false}
          importantForAccessibility="no-hide-descendants" numberOfLines={1}
          style={[styles.inputMetrics, styles.inputMinimum]}>{props.words.inputLabel ?? props.words.placeholder}</Text>
        <TypedTextInput
          ref={inputRef}
          accessibilityLabel={props.words.inputLabel ?? props.words.placeholder}
          accessibilityState={{ disabled: inputDisabled }}
          editable={!inputDisabled}
          multiline
          placeholderTextColor={tokens.fg3}
          value={props.value}
          onChangeText={props.onChangeValue}
          onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
          onFocus={() => {
            onFocusChange(true)
            props.onInputFocus?.()
            props.onOpenConversation?.()
          }}
          onBlur={() => {
            onFocusChange(false)
            props.onInputBlur?.()
          }}
          onSubmitEditing={() => {
            if (canSend) props.onSend()
          }}
          style={[styles.inputMetrics, styles.input, { color: tokens.fg1, height: inputHeight }]}
        />
        {props.state === 'idle' ? <PasteFitMeasure props={props} availableWidth={availableWidth} onPasteFit={onPasteFit} /> : null}
        {props.value.length === 0 && measurePlaceholder ? <Text
          testID="composer-placeholder-measure"
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onTextLayout={event => setPlaceholderLayout({ text: props.words.placeholder, fontScale, fits: event.nativeEvent.lines.length <= 1 })}
          style={[styles.placeholder, { opacity: 0 }]}
        >{props.words.placeholder}</Text> : null}
        {props.value.length === 0 && largeText && props.allowanceReason ? <Text
          testID="composer-allowance-placeholder-measure"
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onLayout={event => setAllowancePlaceholderHeight({ fontScale, height: event.nativeEvent.layout.height })}
          style={[styles.placeholder, { opacity: 0 }]}
        >{t('shell.composer.limit.placeholder')}</Text> : null}
        {props.value.length === 0 && placeholderFits ? <Text
          key={`${fontScale}:${props.words.placeholder}`}
          testID="composer-placeholder"
          pointerEvents="none"
          accessible={false}
          numberOfLines={largeText ? undefined : 1}
          onLayout={event => setPlaceholderHeight({ fontScale, height: event.nativeEvent.layout.height })}
          style={[styles.placeholder, { color: tokens.fg3 }, inputDisabled ? styles.disabled : null]}
        >{props.words.placeholder}</Text> : null}
        </View>
  )
}

function OpenConversationControl({ props, tokens, onLayout }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2; onLayout: (event: LayoutChangeEvent) => void }>) {
  const triggerRef = useRef<View>(null)
  const returnFocusPending = useRef(false)
  const conversationOpen = useUIStore(state => state.astraConversationOpen)
  useEffect(() => {
    if (conversationOpen || !returnFocusPending.current) return
    const timer = setTimeout(() => {
      returnFocusPending.current = false
      if (triggerRef.current) AccessibilityInfo.sendAccessibilityEvent(triggerRef.current, 'focus')
    }, 0)
    return () => clearTimeout(timer)
  }, [conversationOpen])
  const [scale] = useState(() => new Animated.Value(1))
  const reducedMotion = usePrefersReducedMotion()
  function animate(toValue: number) {
    scale.stopAnimation()
    if (reducedMotion) { scale.setValue(1); return }
    Animated.timing(scale, {
      toValue, duration: mobileMotion.orbital.press.duration,
      easing: toAnimatedEasing(mobileMotion.easings.enter), useNativeDriver: true,
    }).start()
  }
  return <InsetFocusPressable ref={triggerRef} accessibilityRole="button" accessibilityLabel={props.conversationLabel}
      onLayout={onLayout}
      onPress={() => { returnFocusPending.current = true; props.onOpenConversation?.() }}
      onPressIn={() => animate(mobileMotion.orbital.press.scale)} onPressOut={() => animate(1)}
      style={({ pressed }) => [styles.openConversation, pressed ? { backgroundColor: tokens.bgHover } : null]}>
      <Animated.View style={{ transform: [{ scale }] }}><AstraGlyph size={20} color={tokens.fg3} /></Animated.View>
    </InsetFocusPressable>
}

function ComposerTextAction({ words, tokens, canClear, canPaste, inMenu, onClear, onPaste }: Readonly<{
  words: ComposerProps['words']; tokens: AppTokensV2; canClear: boolean; canPaste: boolean; inMenu: boolean; onClear: () => void; onPaste: () => void
}>) {
  if (inMenu || (!canClear && !canPaste)) return null
  return <InsetFocusPressable accessibilityRole="button" accessibilityLabel={canClear ? words.clear : words.paste}
    focusColor={tokens.primary}
    onPress={canClear ? onClear : onPaste}
    style={({ pressed }) => [styles.iconButton, pressed ? { backgroundColor: tokens.bgHover } : null]}>
    {canClear ? <X size={20} strokeWidth={2} color={tokens.fg2} /> : <ClipboardIcon size={20} strokeWidth={2} color={tokens.fg2} />}
  </InsetFocusPressable>
}

function ComposerTextControls({ props, tokens, inMenu, onPasteText, onClear, onLayout, disclosure }: Readonly<{ props: ComposerProps; tokens: AppTokensV2; inMenu: boolean; disclosure?: React.ReactNode; onPasteText: (text: string) => void; onClear: () => void; onLayout: (event: LayoutChangeEvent) => void }>) {
  const canClear = props.state === 'idle' && props.value.length > 0
  const canPaste = props.state === 'idle' && props.value.length === 0
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
      const hasText = await Clipboard.hasStringAsync()
      const text = hasText ? await Clipboard.getStringAsync() : ''
      const session = useAuthStore.getState()
      if (!scope.active || accountGeneration !== getAccountGeneration()
        || session.isAuthenticated !== isAuthenticated || session.user?.userId !== accountId) return
      if (text.length === 0) useAppToastStore.getState().showInfo(props.words.nothingToPaste)
      else onPasteText(text)
    } catch (error) {
      captureError(error)
    } finally { scope.pending = false }
  }
  return <View testID="composer-text-controls" onLayout={onLayout} style={styles.textControls}>
  {disclosure || (props.state !== 'recording' && props.state !== 'transcribing') ? <View testID="composer-text-action-slot" accessible={false} style={styles.textActionSlot}>
    {disclosure ?? <ComposerTextAction words={props.words} tokens={tokens} canClear={canClear} canPaste={canPaste} inMenu={inMenu} onClear={onClear} onPaste={() => void pasteMessage()} />}
  </View> : null}
  <ComposerControls props={props} tokens={tokens} onPaste={canPaste && inMenu ? () => void pasteMessage() : undefined}
    onClear={canClear && inMenu ? onClear : undefined} />
  </View>
}

function ComposerInputRow({ props, tokens, inputRef, disclosure }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2; inputRef: React.RefObject<TextInput | null>; disclosure?: React.ReactNode }>) {
  const [focused, setFocused] = useState(false)
  const [pasteInMenu, setPasteInMenu] = useState(false)
  const [widths, setWidths] = useState({ field: 0, entry: 0, actions: 0, send: 0 })
  function measureWidth(part: keyof typeof widths, event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width
    setWidths(previous => previous[part] === width ? previous : { ...previous, [part]: width })
  }
  const hasConversationEntry = Boolean(props.onOpenConversation && props.conversationLabel)
  const conversationEntryWidth = hasConversationEntry ? widths.entry : 0
  const availableWidth = widths.field > 0 && widths.actions > 0 && widths.send > 0
    && (!hasConversationEntry || widths.entry > 0)
    ? widths.field - 2 * styles.field.padding - conversationEntryWidth - widths.actions - widths.send - styles.trailingControls.gap
    : undefined
  const pasteFocus = useRef<string | null>(null)
  useEffect(() => {
    if (pasteFocus.current === null || props.value !== pasteFocus.current || props.state !== 'idle') return
    const end = pasteFocus.current.length
    pasteFocus.current = null
    inputRef.current?.focus()
    inputRef.current?.setSelection(end, end)
  }, [props.value, props.state, inputRef])
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = canSend || props.state === 'sending'
  function clearMessage() { props.onChangeValue(''); inputRef.current?.focus() }

  return (
    <View testID="composer-field" onLayout={event => measureWidth('field', event)} style={[styles.field, { backgroundColor: tokens.bgField }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fieldOutline, composerFieldStyle(tokens, focused, inputDisabled)]} />
      <View testID="composer-leading-controls" style={styles.leadingControls}>
      {props.onOpenConversation && props.conversationLabel ? (
          <OpenConversationControl props={props} tokens={tokens} onLayout={event => measureWidth('entry', event)} />
      ) : null}
        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} tokens={tokens} /> : <ComposerTextInput props={props} tokens={tokens} inputRef={inputRef} onFocusChange={setFocused} availableWidth={availableWidth} onPasteFit={fits => setPasteInMenu(!fits)} />}
      </View>

      <View style={styles.trailingControls}>
        <ComposerTextControls props={props} tokens={tokens} inMenu={Boolean(disclosure) || pasteInMenu} disclosure={disclosure} onLayout={event => measureWidth('actions', event)} onClear={clearMessage} onPasteText={text => {
          pasteFocus.current = text
          props.onChangeValue(text)
        }} />

      <InsetFocusPressable
        testID={sendIsAccent ? 'composer-send-accent' : 'composer-send-neutral'}
        onLayout={event => measureWidth('send', event)}
        focusColor={tokens.primary}
        focusContrastColor={sendIsAccent ? tokens.bg : undefined}
        accessibilityRole="button"
        accessibilityLabel={props.words.send}
        accessibilityState={{ disabled: !canSend, busy: props.state === 'sending' }}
        disabled={!canSend}
        onPress={() => {
          if (canSend) props.onSend()
        }}
        style={({ pressed }) => [
          styles.sendButton,
          {
            backgroundColor: sendIsAccent
              ? pressed
                ? tokens.primaryPressed
                : tokens.primary
              : tokens.bgWell,
          },
          !canSend && props.state !== 'sending' ? styles.disabled : null,
        ]}
      >
        {props.state === 'sending' ? <ActivityIndicator accessible={false} importantForAccessibility="no-hide-descendants" size="small" color={tokens.fgOnPrimary} /> : <ArrowUp size={20} strokeWidth={2} color={sendIsAccent ? tokens.fgOnPrimary : tokens.fg3} />}
      </InsetFocusPressable>
      </View>
    </View>
  )
}

function ComposerError({ props, tokens }: Readonly<{ props: ComposerProps; tokens: AppTokensV2 }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  if (!props.errorMessage && !props.errorRecovery) return null
  return <View style={styles.limitStatus}>
    {props.errorMessage ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive"
      style={[styles.limitReason, { color: tokens.statusBadText }]}>{props.errorMessage}</Text> : null}
    {props.errorRecovery ? <InsetFocusPressable accessibilityRole="button" accessibilityLabel={props.errorRecovery.label} onPress={props.errorRecovery.onSelect}
      style={({ pressed }) => [styles.retry, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: prefersReducedMotion ? 1 : 0.96 }] } : null]}>
      <Text style={[styles.retryText, { color: tokens.fg2 }]}>{props.errorRecovery.label}</Text>
    </InsetFocusPressable> : null}
  </View>
}

function RetryControl({ props, tokens }: Readonly<{ props: ComposerProps; tokens: AppTokensV2 }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  if (!props.onRetry) return null
  return (
    <InsetFocusPressable
      accessibilityRole="button"
      onPress={props.onRetry}
      accessibilityLabel={props.words.retry}
      style={({ pressed }) => [styles.iconButton, { alignSelf: 'flex-start' }, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: prefersReducedMotion ? 1 : 0.96 }] } : null]}
    >
      <AstraGlyph size={20} color={tokens.fg2} />
    </InsetFocusPressable>
  )
}

function ComposerDisclosure({ collapsed, tokens, onToggle, ref }: Readonly<{ collapsed: boolean; tokens: AppTokensV2; onToggle: () => void; ref: React.Ref<View> }>) {
  const { t } = useTranslation()
  return <InsetFocusPressable ref={ref} testID={collapsed ? 'composer-collapse-row' : 'composer-collapse-control'} accessibilityRole="button"
    accessibilityLabel={t(collapsed ? 'shell.composer.expand' : 'shell.composer.collapse')} accessibilityState={{ expanded: !collapsed }}
    onPress={onToggle}
    style={({ pressed }) => [collapsed ? styles.collapseRow : styles.collapseControl, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}>
    {collapsed ? <AstraGlyph size={20} color={tokens.fg2} /> : null}
    <ChevronDown size={20} color={tokens.fg2} style={collapsed ? { transform: [{ rotate: '180deg' }] } : undefined} />
  </InsetFocusPressable>
}

function ComposerContent({ props, tokens, focusTarget, disclosure }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null>; disclosure?: React.ReactNode }>) {
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const showAllowanceStatus = Boolean(props.allowanceReason && props.renewalHint)
    && (props.state === 'idle' || props.state === 'sending' || props.state === 'atLimit')
  const withSuggestions = props.state === 'idle' && props.suggestions.length > 0
  return <>
      {hasAttachments && props.attachWords && props.onAttachRemove ? (
        <AttachmentTray
          attachments={attachments}
          words={props.attachWords}
          onRemove={props.onAttachRemove}
          tokens={tokens}
        />
      ) : null}

      <ComposerError props={props} tokens={tokens} />
      {showAllowanceStatus ? <AllowanceStatus props={props} tokens={tokens} focusTarget={focusTarget} disclosure={disclosure} /> : <ComposerStatus props={props} tokens={tokens} focusTarget={focusTarget} disclosure={disclosure} />}
      <ComposerInputRow props={props} tokens={tokens} inputRef={focusTarget} disclosure={withSuggestions ? undefined : disclosure} />
      {!showAllowanceStatus && props.usageMessage ? <Text testID="composer-usage" style={[styles.usage, { color: tokens.fg3 }]}>{props.usageMessage}</Text> : null}
      <RetryControl props={props} tokens={tokens} />
  </>
}

export function Composer(props: Readonly<MobileComposerProps>) {
  const contentId = useId()
  const savedCollapsed = useUIStore(state => state.habitComposerCollapsed)
  const collapsed = Boolean(props.collapsible && savedCollapsed)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const inputDisabled = props.state !== 'idle'
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const canRetry = props.onRetry !== undefined

  const focusTarget = useRef<TextInput>(null)
  const composerRef = useRef<View>(null)
  const expandedDisclosureRef = useRef<View>(null)
  const collapsedDisclosureRef = useRef<View>(null)
  const disclosureFocusPending = useRef(false)
  function toggleCollapsed() {
    disclosureFocusPending.current = true
    useUIStore.getState().setHabitComposerCollapsed(!collapsed)
  }
  useEffect(() => {
    if (!disclosureFocusPending.current) return
    disclosureFocusPending.current = false
    const target = collapsed ? collapsedDisclosureRef.current : expandedDisclosureRef.current
    if (target) AccessibilityInfo.sendAccessibilityEvent(target, 'focus')
  }, [collapsed])
  const focusedTarget = useRef<'container' | 'input' | null>(null)
  const autoFocusApplied = useRef(false)
  useEffect(() => {
    if (!props.inputSelection) return
    focusTarget.current?.focus()
    focusTarget.current?.setSelection(props.inputSelection.start, props.inputSelection.end)
  }, [props.inputSelection])
  useEffect(() => {
    if (!props.autoFocus) {
      autoFocusApplied.current = false
      return
    }
    const initialFocus = !autoFocusApplied.current
    autoFocusApplied.current = true
    if (inputDisabled && (initialFocus || focusedTarget.current === 'input')) {
      composerRef.current?.setNativeProps({ hasTVPreferredFocus: true })
    }
    else if (!inputDisabled && (initialFocus || focusedTarget.current === 'container')) {
      focusTarget.current?.focus()
      if (initialFocus) focusTarget.current?.setSelection(props.value.length, props.value.length)
    }
  }, [inputDisabled, props.autoFocus, props.value])
  const testID = [
    'composer',
    props.state,
    hasAttachments ? 'attachments' : null,
    canRetry ? 'retry' : null,
  ].filter(Boolean).join('-')

  const disclosure = props.collapsible ? <ComposerDisclosure collapsed={false} tokens={tokens} onToggle={toggleCollapsed} ref={expandedDisclosureRef} /> : undefined
  const content = <ComposerContent props={props} tokens={tokens} focusTarget={focusTarget} disclosure={disclosure} />
  return (
    <View
      ref={composerRef}
      focusable={props.autoFocus}
      onFocus={(event) => {
        const target = event.nativeEvent.target
        focusedTarget.current = target === findNodeHandle(composerRef.current)
          ? 'container'
          : target === findNodeHandle(focusTarget.current) ? 'input' : null
      }}
      onBlur={() => { focusedTarget.current = null }}
      testID={testID}
      accessibilityState={{ busy: props.state === 'sending' }}
      style={[styles.root, collapsed ? styles.collapsed : null, { backgroundColor: tokens.bg, borderTopColor: tokens.hairline }]}
    >
      {collapsed ? <ComposerDisclosure collapsed tokens={tokens} onToggle={toggleCollapsed} ref={collapsedDisclosureRef} /> : null}
      {props.collapsible ? <View nativeID={contentId} accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
        style={{ display: collapsed ? 'none' : 'flex', gap: 12 }}>{content}</View> : content}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    gap: 12,
    padding: SPACING.s16,
  },
  collapsed: { paddingVertical: SPACING.s4, gap: 0 },
  collapseControl: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.s12 },
  suggestionStrip: { flex: 1, minWidth: 0 },
  collapseRow: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.s8, borderRadius: 12, overflow: 'hidden' },
  tray: {
    gap: 8,
  },
  attachmentRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.s12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachmentNameControl: {
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    paddingVertical: SPACING.s8,
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fullAttachmentName: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  attachmentName: {
    minWidth: 0,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  suggestions: {
    gap: COMPOSER_CHIP_GAP,
    alignItems: 'flex-start',
  },
  suggestion: {
    minHeight: 48,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: COMPOSER_CHIP_GAP,
    paddingHorizontal: SPACING.s12,
    paddingVertical: SPACING.s12,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionContent: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: COMPOSER_CHIP_GAP,
  },
  suggestionIcon: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  suggestionText: {
    minWidth: 0,
    flexShrink: 1,
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  voiceStatus: {
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordingTime: {
    fontFamily: 'GeistMono_400Regular',
    fontVariant: ['tabular-nums'],
    fontSize: 14,
  },
  statusText: {
    flexShrink: 1,
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  usage: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, fontVariant: ['tabular-nums'] },
  allowanceText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  allowanceSlot: { minHeight: 96 },
  allowancePreview: { opacity: 0 },
  allowanceUsage: { position: 'absolute', top: 0, start: 0, end: 0 },
  limitReason: {
    minHeight: 48,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  limitStatus: {
    gap: 8,
  },
  openConversation: {
    minWidth: 48,
    maxWidth: '100%',
    flexDirection: 'row',
    gap: SPACING.s8,
    paddingHorizontal: SPACING.s8,
    paddingVertical: SPACING.s4,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  field: {
    minHeight: 56,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.s4,
    borderRadius: 28,
  },
  fieldOutline: {
    borderRadius: 28,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textControls: {
    minWidth: 48,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: INTERACTION_FILL_CLEARANCE,
  },
  textActionSlot: {
    width: 48,
    minHeight: 48,
  },
  trailingControls: {
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: INTERACTION_FILL_CLEARANCE,
  },
  leadingControls: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
    position: 'relative',
  },
  placeholder: {
    position: 'absolute',
    start: 8,
    end: 8,
    top: 12,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  inputMetrics: {
    paddingHorizontal: SPACING.s8,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  inputMinimum: {
    height: 0,
    color: 'transparent',
  },
  input: {
    width: '100%',
    minHeight: 48,
    minWidth: 0,
    paddingVertical: SPACING.s12,
    textAlignVertical: 'top',
  },
  iconButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  sendButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.4,
  },
  retry: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: SPACING.s12,
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})

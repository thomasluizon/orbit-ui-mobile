import { PersonalText } from '@/components/ui/personal-text'
import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { subscribeComposerRecordingTime } from '@orbit/shared/hooks'
import { COMPOSER_CHIP_GAP, COMPOSER_CHIP_PEEK, resolveComposerStripLayout } from '@orbit/shared/chat'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AccessibilityInfo, Animated, findNodeHandle, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { useUIStore } from '@/stores/ui-store'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ArrowUp, FileText, Image, Plus, RefreshCw, Square, X } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { mobileMotion, toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
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
}: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null> }>) {
  const { fontScale } = useWindowDimensions()
  const [availableWidth, setAvailableWidth] = useState(0)
  const [measurements, setMeasurements] = useState<Record<string, number>>({})
  const widths = suggestions.map(suggestion => measurements[suggestion.id] ?? 0)
  const layout = resolveComposerStripLayout(availableWidth, widths)
  const maxWidth = availableWidth > 0 ? availableWidth - COMPOSER_CHIP_GAP - COMPOSER_CHIP_PEEK : undefined
  return (
    <View testID="composer-suggestions-layout" onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)}>
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
              { maxWidth,
                backgroundColor: pressed ? tokens.bgHover : tokens.bgWell, borderColor: tokens.hairline },
            ]}
          >
            <View
              testID="composer-suggestion-content"
              onLayout={event => {
                const width = event.nativeEvent.layout.width + 2 * (styles.suggestion.paddingHorizontal + styles.suggestion.borderWidth)
                setMeasurements(previous => previous[suggestion.id] === width ? previous : { ...previous, [suggestion.id]: width })
              }}
              style={styles.suggestionContent}
            >
              {suggestion.icon ? <View style={[styles.suggestionIcon, { height: 20 * fontScale }]}>{suggestion.icon}</View> : null}
              <Text style={[styles.suggestionText, { color: tokens.fg2 }]}>{suggestion.label}</Text>
            </View>
          </InsetFocusPressable>
        ))}
      </ScrollView>
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

function ComposerStatus({ props, tokens, focusTarget }: Readonly<{ props: ComposerProps; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null> }>) {
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
    />
  )
}

type MobileComposerProps = ComposerProps & {
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

function ComposerControls({ props, tokens }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2 }>) {
  const menu = useAnchoredMenu()
  const voiceActive = props.state === 'recording' || props.state === 'transcribing'
  const isRecording = props.state === 'recording'
  const inputDisabled = props.state !== 'idle'
  const disabled = voiceActive ? props.state === 'transcribing' : inputDisabled && !(props.state === 'atLimit' && props.onVoice)
  const menuOpen = menu.visible && !disabled && !voiceActive
  const items = [
    ...(props.onAttachImage ? [{ id: 'image', label: props.attachWords.image, icon: 'photo', disabled: inputDisabled }] : []),
    ...(props.onAttachFile ? [{ id: 'file', label: props.attachWords.file, icon: 'file', disabled: inputDisabled }] : []),
    ...(props.onVoice ? [{ id: 'voice', label: props.voiceWords.start, icon: 'microphone' }] : []),
  ]
  if (!voiceActive && items.length === 0) return null
  return <View testID="composer-controls" style={styles.controls}>
    <MenuAnchorHost anchorRef={menu.anchorRef}>
      <InsetFocusPressable accessibilityRole="button" accessibilityLabel={voiceActive ? props.voiceWords.stop : props.words.actions}
        focusColor={isRecording ? tokens.fgOnPrimary : tokens.fg1}
        accessibilityState={{ disabled, ...(!voiceActive ? { expanded: menuOpen } : {}) }} disabled={disabled} onPress={voiceActive ? props.onVoice : menu.open}
        style={({ pressed }) => composerActionStyle(tokens, isRecording, disabled, pressed)}>
        <ComposerActionIcon state={props.state} tokens={tokens} />
      </InsetFocusPressable>
    </MenuAnchorHost>
    <Menu open={menuOpen} anchorRef={menu.anchorRef} title={props.words.actions} items={items} onClose={menu.close} onSelect={(id) => {
      if (id === 'image') props.onAttachImage?.()
      if (id === 'file') props.onAttachFile?.()
      if (id === 'voice') props.onVoice?.()
    }} />
  </View>
}

function ComposerTextInput({ props, tokens, inputRef, onFocusChange }: Readonly<{
  props: MobileComposerProps
  tokens: AppTokensV2
  inputRef: React.RefObject<TextInput | null>
  onFocusChange: (focused: boolean) => void
}>) {
  const { fontScale } = useWindowDimensions()
  const [contentHeight, setContentHeight] = useState(48)
  const [placeholderHeight, setPlaceholderHeight] = useState<{ fontScale: number; height: number } | null>(null)
  const [placeholderLayout, setPlaceholderLayout] = useState<{ text: string; fontScale: number; fits: boolean } | null>(null)
  const largeText = fontScale > 1.3
  const measurePlaceholder = props.state === 'offline' || props.state === 'atLimit'
  const placeholderFits = largeText || !measurePlaceholder || placeholderLayout?.text !== props.words.placeholder || placeholderLayout.fontScale !== fontScale || placeholderLayout.fits
  const minimumHeight = 24 * fontScale + 24
  const maximumHeight = 5 * 24 * fontScale + 24
  const emptyHeight = largeText && placeholderHeight?.fontScale === fontScale
    ? Math.max(minimumHeight, placeholderHeight.height + 24) : minimumHeight
  const inputHeight = props.value.length === 0 ? emptyHeight : Math.min(maximumHeight, Math.max(minimumHeight, contentHeight))
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  return (
<View testID="composer-text-slot" style={styles.textSlot}>
        <TextInput
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
          style={[styles.input, { color: tokens.fg1, height: inputHeight }]}
        />
        {props.value.length === 0 && measurePlaceholder ? <Text
          testID="composer-placeholder-measure"
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onTextLayout={event => setPlaceholderLayout({ text: props.words.placeholder, fontScale, fits: event.nativeEvent.lines.length <= 1 })}
          style={[styles.placeholder, { opacity: 0 }]}
        >{props.words.placeholder}</Text> : null}
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

function OpenConversationControl({ props, tokens }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2 }>) {
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
      onPress={() => { returnFocusPending.current = true; props.onOpenConversation?.() }}
      onPressIn={() => animate(mobileMotion.orbital.press.scale)} onPressOut={() => animate(1)}
      style={({ pressed }) => [styles.openConversation, pressed ? { backgroundColor: tokens.bgHover } : null]}>
      <Animated.View style={{ transform: [{ scale }] }}><AstraGlyph size={20} color={tokens.fg3} /></Animated.View>
    </InsetFocusPressable>
}

function ComposerInputRow({ props, tokens, inputRef }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2; inputRef: React.RefObject<TextInput | null> }>) {
  const [focused, setFocused] = useState(false)
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = canSend || props.state === 'sending'

  return (
    <View testID="composer-field" style={[styles.field, { backgroundColor: tokens.bgField }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fieldOutline, composerFieldStyle(tokens, focused, inputDisabled)]} />
      {props.onOpenConversation && props.conversationLabel ? (
          <OpenConversationControl props={props} tokens={tokens} />
      ) : null}
        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} tokens={tokens} /> : <ComposerTextInput props={props} tokens={tokens} inputRef={inputRef} onFocusChange={setFocused} />}

        <ComposerControls props={props} tokens={tokens} />

      <InsetFocusPressable
        testID={sendIsAccent ? 'composer-send-accent' : 'composer-send-neutral'}
        focusColor={sendIsAccent ? tokens.fgOnPrimary : tokens.fg1}
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
        {props.state === 'sending' ? <ActivityIndicator size="small" color={tokens.fgOnPrimary} /> : <ArrowUp size={20} strokeWidth={2} color={sendIsAccent ? tokens.fgOnPrimary : tokens.fg3} />}
      </InsetFocusPressable>
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
      style={({ pressed }) => [styles.retry, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: prefersReducedMotion ? 1 : 0.96 }] } : null]}
    >
      <RefreshCw size={16} strokeWidth={2} color={tokens.fg2} />
      <Text style={[styles.retryText, { color: tokens.fg2 }]}>{props.words.retry}</Text>
    </InsetFocusPressable>
  )
}

export function Composer(props: Readonly<MobileComposerProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const inputDisabled = props.state !== 'idle'
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const canRetry = props.onRetry !== undefined
  const focusTarget = useRef<TextInput>(null)
  const composerRef = useRef<View>(null)
  const focusedTarget = useRef<'container' | 'input' | null>(null)
  const autoFocusApplied = useRef(false)
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
    else if (!inputDisabled && (initialFocus || focusedTarget.current === 'container')) focusTarget.current?.focus()
  }, [inputDisabled, props.autoFocus])
  const testID = [
    'composer',
    props.state,
    hasAttachments ? 'attachments' : null,
    canRetry ? 'retry' : null,
  ].filter(Boolean).join('-')

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
      style={[styles.root, { backgroundColor: tokens.bg, borderTopColor: tokens.hairline }]}
    >
      {hasAttachments && props.attachWords && props.onAttachRemove ? (
        <AttachmentTray
          attachments={attachments}
          words={props.attachWords}
          onRemove={props.onAttachRemove}
          tokens={tokens}
        />
      ) : null}

      <ComposerError props={props} tokens={tokens} />
      <ComposerStatus props={props} tokens={tokens} focusTarget={focusTarget} />
      <ComposerInputRow props={props} tokens={tokens} inputRef={focusTarget} />
      <RetryControl props={props} tokens={tokens} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    gap: 12,
    padding: 16,
  },
  tray: {
    gap: 8,
  },
  attachmentRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachmentNameControl: {
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    paddingVertical: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  field: {
    minHeight: 56,
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 4,
    borderRadius: 28,
  },
  fieldOutline: {
    borderRadius: 28,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textSlot: {
    flex: 1,
    minWidth: 0,
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
  input: {
    minHeight: 48,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
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
    paddingHorizontal: 12,
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

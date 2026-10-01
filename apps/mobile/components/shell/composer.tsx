import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { subscribeComposerRecordingTime } from '@orbit/shared/hooks'
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, findNodeHandle, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUp, FileText, Image, Mic, RefreshCw, Square, X } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { mobileMotion, toAnimatedEasing } from '@/lib/motion'

function animatePressScale(scale: Animated.Value, toValue: number) {
  scale.stopAnimation()
  Animated.timing(scale, {
    toValue,
    duration: mobileMotion.orbital.press.duration,
    easing: toAnimatedEasing(mobileMotion.easings.enter),
    useNativeDriver: true,
  }).start()
}

function AttachmentIcon({ kind, color }: Readonly<Pick<ComposerAttachment, 'kind'> & { color: string }>) {
  return kind === 'image' ? (
    <Image size={20} strokeWidth={1.8} color={color} />
  ) : (
    <FileText size={20} strokeWidth={1.8} color={color} />
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
  return (
    <View accessible={false} testID="composer-attachment-tray" style={styles.tray}>
      {attachments.map((attachment) => (
        <View
          key={attachment.id}
          testID={`composer-attachment-${attachment.kind}`}
          style={[styles.attachmentRow, { backgroundColor: tokens.bgWell, borderColor: tokens.hairline }]}
        >
          <AttachmentIcon kind={attachment.kind} color={tokens.fg2} />
          <Text numberOfLines={1} style={[styles.attachmentName, { color: tokens.fg2 }]}>
            {attachment.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={words.remove(attachment.name)}
            onPress={() => onRemove(attachment.id)}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? { backgroundColor: tokens.bgHover } : null,
            ]}
          >
            <X size={20} strokeWidth={1.8} color={tokens.fg3} />
          </Pressable>
        </View>
      ))}
    </View>
  )
}

function SuggestionStrip({
  suggestions,
  label,
  tokens,
  focusTarget,
}: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string; tokens: AppTokensV2; focusTarget: React.RefObject<TextInput | null> }>) {
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.suggestions}
    >
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion.id}
          accessibilityRole="button"
          accessibilityLabel={suggestion.label}
          onPress={() => {
            if (focusTarget.current) AccessibilityInfo.sendAccessibilityEvent(focusTarget.current, 'focus')
            suggestion.onSelect()
          }}
          style={({ pressed }) => [
            styles.suggestion,
            { backgroundColor: pressed ? tokens.bgHover : tokens.bgWell, borderColor: tokens.hairline },
          ]}
        >
          {suggestion.icon}
          <Text numberOfLines={1} style={[styles.suggestionText, { color: tokens.fg2 }]}>{suggestion.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
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
    <View testID="composer-voice-row" style={styles.voiceStatus}>
      {state === 'recording' ? <Text accessible={false} style={[styles.recordingTime, { color: tokens.fg2 }]}>{elapsed}</Text> : null}
      <Text numberOfLines={1} style={[styles.statusText, { color: tokens.fg2 }]}>
        {state === 'recording' ? words.recording : words.transcribing}
      </Text>
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
    return props.words.offlineReason ? <Text style={[styles.limitReason, { color: tokens.fg2 }]}>{props.words.offlineReason}</Text> : null
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
    backgroundColor: tokens.bgField,
    borderColor: showFocusBorder ? tokens.primary : tokens.borderControl,
    borderWidth: showFocusBorder ? 2 : 1,
  }
}

function ComposerControls({ props, tokens }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2 }>) {
  const inputDisabled = props.state !== 'idle'
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const voiceDisabled = isTranscribing || props.state === 'sending' || props.state === 'offline'
  return (
        <View testID="composer-controls" style={styles.controls}>
        {!isRecording && !isTranscribing && props.onAttachFile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.attachWords.file}
            accessibilityState={{ disabled: inputDisabled }}
            disabled={inputDisabled}
            onPress={props.onAttachFile}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? { backgroundColor: tokens.bgHover } : null,
              inputDisabled ? styles.disabled : null,
            ]}
          >
            <FileText size={20} strokeWidth={1.8} color={tokens.fg3} />
          </Pressable>
        ) : null}

        {!isRecording && !isTranscribing && props.onAttachImage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.attachWords.image}
            accessibilityState={{ disabled: inputDisabled }}
            disabled={inputDisabled}
            onPress={props.onAttachImage}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? { backgroundColor: tokens.bgHover } : null,
              inputDisabled ? styles.disabled : null,
            ]}
          >
            <Image size={20} strokeWidth={1.8} color={tokens.fg3} />
          </Pressable>
        ) : null}

        {props.onVoice ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRecording || isTranscribing ? props.voiceWords.stop : props.voiceWords.start}
            accessibilityState={{ disabled: voiceDisabled }}
            disabled={voiceDisabled}
            onPress={props.onVoice}
            style={({ pressed }) => [
              styles.iconButton,
              isRecording ? { backgroundColor: pressed ? tokens.primaryPressed : tokens.primary } : null,
              pressed && !isRecording ? { backgroundColor: tokens.bgHover } : null,
              voiceDisabled ? styles.disabled : null,
            ]}
          >
            {isRecording || isTranscribing ? (
              <Square size={16} fill={isRecording ? tokens.fgOnPrimary : tokens.fg3} color={isRecording ? tokens.fgOnPrimary : tokens.fg3} />
            ) : (
              <Mic size={20} strokeWidth={1.8} color={tokens.fg3} />
            )}
          </Pressable>
        ) : null}
        </View>
  )
}

function ComposerTextInput({ props, tokens, inputRef, inputMinimum, onFocusChange }: Readonly<{
  props: MobileComposerProps
  tokens: AppTokensV2
  inputRef: React.RefObject<TextInput | null>
  inputMinimum: number
  onFocusChange: (focused: boolean) => void
}>) {
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  return (
<View testID="composer-text-slot" style={[styles.textSlot, { minWidth: inputMinimum }]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={props.words.inputLabel ?? props.words.placeholder}
          accessibilityState={{ disabled: inputDisabled }}
          editable={!inputDisabled}
          multiline
          placeholderTextColor={tokens.fg3}
          value={props.value}
          onChangeText={props.onChangeValue}
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
          style={[styles.input, { color: tokens.fg1 }]}
        />
        {props.value.length === 0 ? <Text
          testID="composer-placeholder"
          pointerEvents="none"
          accessible={false}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.placeholder, { color: tokens.fg3 }, inputDisabled ? styles.disabled : null]}
        >{props.words.placeholder}</Text> : null}
        </View>
  )
}

function ComposerInputRow({ props, tokens, inputRef }: Readonly<{ props: MobileComposerProps; tokens: AppTokensV2; inputRef: React.RefObject<TextInput | null> }>) {
  const [fieldWidth, setFieldWidth] = useState<number>()
  const [focused, setFocused] = useState(false)
  const [openConversationScale] = useState(() => new Animated.Value(1))
  const inputDisabled = props.state !== 'idle'
  const inputMinimum = fieldWidth === undefined ? 176 : Math.min(176, Math.max(0, fieldWidth - 16 - (focused && !inputDisabled ? 4 : 2)))
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = canSend || props.state === 'sending'

  return (
    <View style={styles.inputRow}>
      {props.onOpenConversation && props.conversationLabel ? (
        <Animated.View style={{ transform: [{ scale: openConversationScale }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.conversationLabel}
            onPress={props.onOpenConversation}
            onPressIn={() => animatePressScale(openConversationScale, mobileMotion.orbital.press.scale)}
            onPressOut={() => animatePressScale(openConversationScale, 1)}
            style={({ pressed }) => [styles.openConversation, pressed ? { backgroundColor: tokens.bgHover } : null]}
          >
            <AstraGlyph size={20} color={tokens.fg3} />
          </Pressable>
        </Animated.View>
      ) : null}
      <View
        testID="composer-field"
        accessibilityLiveRegion="polite"
        onLayout={(event) => setFieldWidth(event.nativeEvent.layout.width)}
        style={[styles.field, composerFieldStyle(tokens, focused, inputDisabled)]}
      >
        {isRecording || isTranscribing ? <VoiceStatus state={props.state} words={props.voiceWords} tokens={tokens} /> : <ComposerTextInput props={props} tokens={tokens} inputRef={inputRef} inputMinimum={inputMinimum} onFocusChange={setFocused} />}

        <ComposerControls props={props} tokens={tokens} />
      </View>

      <Pressable
        testID={sendIsAccent ? 'composer-send-accent' : 'composer-send-neutral'}
        accessibilityRole="button"
        accessibilityLabel={props.words.send}
        accessibilityState={{ disabled: !canSend }}
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
        <ArrowUp size={20} strokeWidth={2} color={sendIsAccent ? tokens.fgOnPrimary : tokens.fg3} />
      </Pressable>
    </View>
  )
}

function RetryControl({ props, tokens }: Readonly<{ props: ComposerProps; tokens: AppTokensV2 }>) {
  if (!props.onRetry) return null
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onRetry}
      style={({ pressed }) => [styles.retry, pressed ? styles.retryPressed : null]}
    >
      <RefreshCw size={16} strokeWidth={1.8} color={tokens.fg2} />
      <Text style={[styles.retryText, { color: tokens.fg2 }]}>{props.words.retry}</Text>
    </Pressable>
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
  attachmentName: {
    minWidth: 0,
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  suggestions: {
    gap: 8,
  },
  suggestion: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  voiceStatus: {
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    paddingHorizontal: 8,
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
    minHeight: 44,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  limitStatus: {
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  openConversation: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  field: {
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  textSlot: {
    flexBasis: 176,
    flexGrow: 1,
    flexShrink: 1,
    position: 'relative',
  },
  placeholder: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 12,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  input: {
    minHeight: 48,
    maxHeight: 96,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  sendButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.4,
  },
  retry: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})

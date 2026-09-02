import {
  hasComposerContent,
  type ComposerAttachWords,
  type ComposerAttachment,
  type ComposerProps,
  type ComposerVoiceWords,
} from '@orbit/shared/contracts/composer'
import { useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUp, FileText, Image, Mic, RefreshCw, Square, X } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useTourTarget } from '@/hooks/use-tour-target'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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
    <View accessible accessibilityLabel={words.trayLabel} style={styles.tray}>
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
}: Readonly<Pick<ComposerProps, 'suggestions'> & { label: string; tokens: AppTokensV2 }>) {
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
          onPress={suggestion.onSelect}
          style={({ pressed }) => [
            styles.suggestion,
            { backgroundColor: pressed ? tokens.bgHover : tokens.bgWell, borderColor: tokens.hairline },
          ]}
        >
          {suggestion.icon}
          <Text style={[styles.suggestionText, { color: tokens.fg2 }]}>{suggestion.label}</Text>
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
  return (
    <View accessibilityLiveRegion="polite" style={styles.voiceStatus}>
      <View
        style={[
          styles.voiceDot,
          { backgroundColor: state === 'recording' ? tokens.statusBad : tokens.primary },
        ]}
      />
      <Text style={[styles.statusText, { color: tokens.fg2 }]}>
        {state === 'recording' ? words.recording : words.transcribing}
      </Text>
    </View>
  )
}

function ComposerStatus({ props, tokens }: Readonly<{ props: ComposerProps; tokens: AppTokensV2 }>) {
  if (props.state === 'atLimit' || props.state === 'offline') {
    return (
      <View style={styles.limitStatus}>
        <Text style={[styles.limitReason, { color: tokens.fg2 }]}>{props.limitReason}</Text>
        {props.limitRecovery}
      </View>
    )
  }
  if (props.state === 'recording' || props.state === 'transcribing') {
    return <VoiceStatus state={props.state} words={props.voiceWords} tokens={tokens} />
  }
  return (
    <SuggestionStrip
      suggestions={props.suggestions}
      label={props.words.suggestionsLabel}
      tokens={tokens}
    />
  )
}

function ComposerInputRow({ props, tokens }: Readonly<{ props: ComposerProps; tokens: AppTokensV2 }>) {
  const voiceRef = useRef<View>(null)
  useTourTarget('tour-chat-voice', voiceRef)
  const inputDisabled = props.state !== 'idle'
  const canSend = props.state === 'idle' && hasComposerContent(props.value, props.attachments)
  const isBlocked = props.state === 'atLimit' || props.state === 'offline'
  const isRecording = props.state === 'recording'
  const isTranscribing = props.state === 'transcribing'
  const sendIsAccent = props.state === 'idle' || props.state === 'sending'
  const voiceDisabled = isTranscribing || props.state === 'sending' || isBlocked

  return (
    <View style={styles.inputRow}>
      {props.onOpenConversation && props.conversationLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.conversationLabel}
          onPress={props.onOpenConversation}
          style={styles.openConversation}
        >
          <AstraGlyph size={20} color={tokens.fg3} />
        </Pressable>
      ) : null}
      <View
        style={[styles.field, { backgroundColor: tokens.bgField, borderColor: tokens.borderControl }]}
      >
        <TextInput
          accessibilityLabel={props.words.placeholder}
          accessibilityState={{ disabled: inputDisabled }}
          editable={!inputDisabled}
          multiline
          placeholder={props.words.placeholder}
          placeholderTextColor={tokens.fg3}
          value={props.value}
          onChangeText={props.onChangeValue}
          onSubmitEditing={() => {
            if (canSend) props.onSend()
          }}
          style={[styles.input, { color: tokens.fg1 }]}
        />

        {props.onAttachFile ? (
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

        {props.onAttachImage ? (
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
            ref={voiceRef}
            testID="tour-chat-voice"
            accessibilityRole="button"
            accessibilityLabel={isRecording ? props.voiceWords.stop : props.voiceWords.start}
            accessibilityState={{ disabled: voiceDisabled }}
            disabled={voiceDisabled}
            onPress={props.onVoice}
            style={({ pressed }) => [
              styles.iconButton,
              isRecording ? { backgroundColor: tokens.primary } : null,
              pressed && !isRecording ? { backgroundColor: tokens.bgHover } : null,
              voiceDisabled ? styles.disabled : null,
            ]}
          >
            {isRecording ? (
              <Square size={16} fill={tokens.fgOnPrimary} color={tokens.fgOnPrimary} />
            ) : (
              <Mic size={20} strokeWidth={1.8} color={tokens.fg3} />
            )}
          </Pressable>
        ) : null}
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
          !canSend ? styles.disabled : null,
        ]}
      >
        <ArrowUp size={20} strokeWidth={2} color={sendIsAccent ? tokens.fgOnPrimary : tokens.fg4} />
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

export function Composer(props: Readonly<ComposerProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const inputDisabled = props.state !== 'idle'
  const attachments = props.attachments ?? []
  const hasAttachments = attachments.length > 0
  const canRetry = props.onRetry !== undefined
  const testID = [
    'composer',
    props.state,
    hasAttachments ? 'attachments' : null,
    canRetry ? 'retry' : null,
  ].filter(Boolean).join('-')

  return (
    <View
      testID={testID}
      accessibilityState={{ disabled: inputDisabled, busy: props.state === 'sending' }}
      className="flex-col gap-3 p-4"
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

      <ComposerStatus props={props} tokens={tokens} />
      <ComposerInputRow props={props} tokens={tokens} />
      <RetryControl props={props} tokens={tokens} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  voiceStatus: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
  },
  statusText: {
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
  },
  field: {
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
  input: {
    minHeight: 48,
    maxHeight: 96,
    minWidth: 0,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
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

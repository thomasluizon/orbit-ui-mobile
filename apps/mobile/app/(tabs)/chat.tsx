import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Sparkles,
  SendHorizontal,
  Image as ImageIcon,
  Mic,
  Square,
  X,
} from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_STARTER_CHIP_KEYS,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
  getChatImageValidationError,
  resolveChatImageMimeType,
} from '@orbit/shared/chat'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { ChatMessage, ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import { getErrorMessage } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { apiClient } from '@/lib/api-client'
import { MessageBubble, TypingIndicator } from '@/components/message-bubble'
import { useChatStore } from '@/stores/chat-store'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Animated Sparkle Icon for empty state
// ---------------------------------------------------------------------------

function AnimatedSparkle() {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.7)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [scale, opacity])

  return (
    <View style={styles.sparkleOuter}>
      <View style={styles.sparkleGlow} />
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Sparkles size={28} color={colors.primary} />
      </Animated.View>
    </View>
  )
}

function AnimatedVisualizerBar({ delay }: Readonly<{ delay: number }>) {
  const scale = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 520,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.45,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    )

    animation.start()
    return () => animation.stop()
  }, [delay, scale])

  return (
    <Animated.View
      style={[
        styles.visualizerBar,
        {
          transform: [{ scaleY: scale }],
        },
      ]}
    />
  )
}

function RecordingVisualizer() {
  return (
    <View style={styles.visualizer}>
      {VISUALIZER_BAR_OFFSETS.map((offset) => (
        <AnimatedVisualizerBar
          key={`bar-${offset}`}
          delay={Math.round(offset * 1000)}
        />
      ))}
    </View>
  )
}

export default function ChatScreen() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const flatListRef = useRef<FlatList<ChatMessage>>(null)
  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const addMessage = useChatStore((s) => s.addMessage)
  const setIsTyping = useChatStore((s) => s.setIsTyping)

  const {
    isRecording,
    isSupported: speechSupported,
    transcript,
    error: speechError,
    selectedLanguage: speechLang,
    setSelectedLanguage: setSpeechLang,
    toggleRecording,
    recordingDuration,
  } = useSpeechToText()

  const prevIsRecording = useRef(false)
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showLangPicker, setShowLangPicker] = useState(false)

  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 10
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit
  const canSend =
    (input.trim().length > 0 || selectedImage !== null) &&
    !isTyping &&
    !atMessageLimit &&
    !isRecording
  const showSuggestions = messages.length === 0 && !isTyping

  const currentLangFlag = useMemo(
    () => SPEECH_LANGUAGES.find((lang) => lang.value === speechLang)?.flag ?? '\u{1F310}',
    [speechLang],
  )

  const starterChips = useMemo(
    () => CHAT_STARTER_CHIP_KEYS.map((key) => t(key)),
    [t],
  )

  const suggestionChips = useMemo(
    () => [
      { key: 'meditated', label: t('chat.suggestion.meditated') },
      { key: 'exercise', label: t('chat.suggestion.exercise') },
      { key: 'groceries', label: t('chat.suggestion.groceries') },
    ],
    [t],
  )

  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [recordingDuration])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true })
    }, 100)
  }, [])

  useEffect(() => {
    if (prevIsRecording.current && !isRecording && transcript.trim()) {
      setInput((current) => (current ? `${current} ${transcript.trim()}` : transcript.trim()))
    }
    prevIsRecording.current = isRecording
  }, [isRecording, transcript])

  useEffect(() => {
    if (speechError) {
      setSendError(speechError)
      const timer = setTimeout(() => {
        setSendError((current) => (current === speechError ? null : current))
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [speechError])

  useEffect(() => {
    if (isRecording) {
      setShowLangPicker(false)
    }
  }, [isRecording])

  function validateImageAsset(asset: ImagePicker.ImagePickerAsset): string | null {
    const validationError = getChatImageValidationError({
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      name: asset.fileName,
      uri: asset.uri,
    })

    if (validationError === 'type') return t('chat.imageError')
    if (validationError === 'size') return t('chat.imageSizeError')
    return null
  }

  const openFilePicker = useCallback(async () => {
    setShowLangPicker(false)

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setSendError(t('chat.imagePermissionError'))
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsMultipleSelection: false,
      quality: 1,
    })

    if (result.canceled) return

    const asset = result.assets[0]
    if (!asset) return

    const validationError = validateImageAsset(asset)
    if (validationError) {
      setSendError(validationError)
      return
    }

    setSendError(null)
    setSelectedImage(asset)
    setImagePreview(asset.uri)
  }, [t])

  const removeImage = useCallback(() => {
    setSelectedImage(null)
    setImagePreview(null)
  }, [])

  function buildImageUpload(asset: ImagePicker.ImagePickerAsset): Blob {
    const mimeType =
      resolveChatImageMimeType({
        mimeType: asset.mimeType,
        name: asset.fileName,
        uri: asset.uri,
      }) ?? 'image/jpeg'

    const extension = mimeType.split('/')[1] ?? 'jpg'

    return {
      uri: asset.uri,
      type: mimeType,
      name: asset.fileName ?? `orbit-chat-image.${extension}`,
    } as unknown as Blob
  }

  const sendMessage = useCallback(
    async (content?: string) => {
      const messageContent = content ?? input.trim()
      if ((!messageContent && !selectedImage) || isTyping) return

      setSendError(null)
      setShowLangPicker(false)

      const attachedImage = selectedImage
      const attachedPreview = imagePreview

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: messageContent || '(image)',
        imageUrl: attachedPreview,
        timestamp: new Date(),
      }

      addMessage(userMessage)
      setInput('')
      setSelectedImage(null)
      setImagePreview(null)
      scrollToBottom()
      setIsTyping(true)
      scrollToBottom()

      try {
        const formData = new FormData()
        if (messageContent) formData.append('message', messageContent)
        if (attachedImage) {
          formData.append('image', buildImageUpload(attachedImage))
        }

        const currentMessages = useChatStore.getState().messages
        const recentHistory = currentMessages
          .slice(-11, -1)
          .map((m) => ({ role: m.role, content: m.content }))

        formData.append('history', JSON.stringify(recentHistory))

        const response = await apiClient<ChatResponse>(API.chat.send, {
          method: 'POST',
          body: formData,
        })

        setIsTyping(false)

        const aiMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: 'ai',
          content: response.aiMessage || '',
          actions: response.actions,
          timestamp: new Date(),
        }

        addMessage(aiMessage)
        scrollToBottom()

        if (!hasProAccess) {
          queryClient.setQueryData<Profile>(profileKeys.detail(), (current) =>
            current
              ? { ...current, aiMessagesUsed: (current.aiMessagesUsed ?? 0) + 1 }
              : current,
          )
        }

        if (response.actions?.some((a) => a.status === 'Success')) {
          queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
        }
      } catch (err: unknown) {
        setIsTyping(false)
        setSendError(getErrorMessage(err, t('chat.sendError')))

        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: 'ai',
          content: t('chat.aiError'),
          timestamp: new Date(),
        }

        addMessage(errorMessage)
        scrollToBottom()
      }
    },
    [
      addMessage,
      hasProAccess,
      imagePreview,
      input,
      isTyping,
      queryClient,
      scrollToBottom,
      selectedImage,
      setIsTyping,
      t,
    ],
  )

  const handleSend = useCallback(() => {
    sendMessage()
  }, [sendMessage])
  const styles = useMemo(() => createStyles(colors), [colors])

  const handleBreakdownConfirmed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }, [queryClient])

  // Render message item
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        onBreakdownConfirmed={handleBreakdownConfirmed}
      />
    ),
    [handleBreakdownConfirmed],
  )

  const keyExtractor = useCallback((item: ChatMessage) => item.id, [])

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            activeOpacity={0.7}
            onPress={() => router.push('/' as Href)}
            style={styles.headerButton}
          >
            <ArrowLeft size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('chat.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {showSuggestions ? (
          <View style={styles.emptyState}>
            <AnimatedSparkle />
            <Text style={styles.emptyText}>{t('chat.suggestion.prompt')}</Text>
            <View style={styles.suggestionsContainer}>
              {suggestionChips.map((chip) => (
                <TouchableOpacity
                  key={chip.key}
                  style={styles.suggestionChip}
                  onPress={() => sendMessage(chip.label)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionChipText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          />
        )}

        <View style={styles.inputArea}>
          {sendError && <Text style={styles.errorText}>{sendError}</Text>}

          {imagePreview && (
            <View style={styles.imagePreviewRow}>
              <View style={styles.imagePreviewCard}>
                <Image source={{ uri: imagePreview }} style={styles.imagePreview} />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.removeImage')}
                  activeOpacity={0.8}
                  onPress={removeImage}
                  style={styles.imageRemoveButton}
                >
                  <X size={12} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {messages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickChipsContent}
              style={styles.quickChipsScroll}
            >
              {starterChips.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={styles.quickChip}
                  onPress={() => sendMessage(chip)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.inputBar}>
            {isRecording ? (
              <>
                <View style={styles.recordingContent}>
                  <View style={styles.recordingStatus}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTime}>{recordingTime}</Text>
                  </View>
                  <RecordingVisualizer />
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.stopRecording')}
                  activeOpacity={0.7}
                  onPress={toggleRecording}
                  style={styles.stopButton}
                >
                  <Square size={14} color={colors.white} fill={colors.white} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.attachImage')}
                  activeOpacity={0.7}
                  onPress={() => {
                    void openFilePicker()
                  }}
                  style={styles.iconButton}
                >
                  <ImageIcon size={15} color={colors.textMuted} />
                </TouchableOpacity>

                {speechSupported && (
                  <View style={styles.languageControl}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.toggleMic')}
                      activeOpacity={0.7}
                      disabled={isTyping}
                      onPress={toggleRecording}
                      style={styles.iconButton}
                    >
                      <Mic size={16} color={colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.speechLanguage')}
                      activeOpacity={0.7}
                      onPress={() => setShowLangPicker((current) => !current)}
                      style={styles.languageFlagButton}
                    >
                      <Text style={styles.languageFlagText}>{currentLangFlag}</Text>
                    </TouchableOpacity>

                    {showLangPicker && (
                      <View style={styles.languagePicker}>
                        {SPEECH_LANGUAGES.map((lang) => (
                          <TouchableOpacity
                            key={lang.value}
                            activeOpacity={0.7}
                            onPress={() => {
                              setSpeechLang(lang.value)
                              setShowLangPicker(false)
                            }}
                            style={[
                              styles.languageOption,
                              speechLang === lang.value && styles.languageOptionActive,
                            ]}
                          >
                            <Text style={styles.languageOptionFlag}>{lang.flag}</Text>
                            <Text
                              style={[
                                styles.languageOptionText,
                                speechLang === lang.value && styles.languageOptionTextActive,
                              ]}
                            >
                              {lang.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                <TextInput
                  style={styles.textInput}
                  value={input}
                  onChangeText={setInput}
                  placeholder={t('chat.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={2000}
                  returnKeyType="default"
                  blurOnSubmit={false}
                  onSubmitEditing={handleSend}
                />

                <TouchableOpacity
                  style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.7}
                >
                  <SendHorizontal size={16} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>

          {!hasProAccess && atMessageLimit && (
            <Text style={styles.limitText}>{t('chat.limitReachedError')}</Text>
          )}
          {!hasProAccess && !atMessageLimit && (
            <Text style={styles.usageText}>
              {aiMessagesUsed}/{aiMessagesLimit} {t('chat.messagesUsed')}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type AppColors = ReturnType<typeof createColors>

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 20,
  },
  sparkleOuter: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary_15,
  },

  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 0,
    maxWidth: 320,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  messageList: {
    paddingVertical: 16,
  },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 14,
    color: colors.red400,
    textAlign: 'center',
    marginBottom: 8,
  },
  imagePreviewRow: {
    paddingBottom: 8,
  },
  imagePreviewCard: {
    alignSelf: 'flex-start',
    position: 'relative',
  },
  imagePreview: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  imageRemoveButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipsScroll: {
    marginBottom: 12,
  },
  quickChipsContent: {
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border50,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  languageControl: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageFlagButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  languageFlagText: {
    fontSize: 12,
  },
  languagePicker: {
    position: 'absolute',
    left: 0,
    bottom: 40,
    minWidth: 148,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceOverlay,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 20,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  languageOptionActive: {
    backgroundColor: colors.primary_10,
  },
  languageOptionFlag: {
    fontSize: 13,
  },
  languageOptionText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  languageOptionTextActive: {
    color: colors.primary400,
    fontWeight: '700',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxHeight: 120,
    minHeight: 36,
  },
  recordingContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red500,
  },
  recordingTime: {
    color: colors.red400,
    fontSize: 14,
    fontWeight: '600',
  },
  visualizer: {
    flex: 1,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  visualizerBar: {
    width: 4,
    height: 18,
    borderRadius: 9999,
    backgroundColor: colors.red400,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // shadow-glow-sm equivalent
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  stopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.red500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: {
    fontSize: 10,
    color: colors.amber400,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  usageText: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  })
}

import { createAstraAllowanceTranslator, formatAPIDateInTimeZone } from '@orbit/shared/utils'
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Linking } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { BlockAnswerSubmission, buildComposerChips, resolveComposerChipStatus, resolveComposerChipSurface, AI_MESSAGE_COUNTER_THRESHOLD, ChatTurnReconciliation } from "@orbit/shared/chat"
import { toComposerSuggestions, type ComposerProps } from "@orbit/shared/contracts/composer"
import type { ChatMessage } from "@orbit/shared/types"
import { CHAT_DRAFT_STORAGE_KEY, createChatThreadScroll } from "@orbit/shared/hooks"
import { useProfile } from "@/hooks/use-profile"
import { useHabitDetail, useHabits } from "@/hooks/use-habit-queries"
import { useSpeechToText } from "@/hooks/use-speech-to-text"
import { useChatStore } from "@/stores/chat-store"
import { useUIStore } from "@/stores/ui-store"
import { useResetOnAccountChange } from "@/hooks/use-session-reset"
import { usePrefersReducedMotion } from "@/lib/motion"
import type { UseChatComposerOptions, AttemptedSend } from './use-chat-composer-types'
import type { useChatComposerAttachmentState, useChatComposerTextFile, useChatComposerImage } from './use-chat-composer-attachments'
import type { useChatSendMessage, useChatSendRetry } from './use-chat-send-stream'

type ChatComposerStateInputs = Pick<UseChatComposerOptions, 'selectedDate' | 'includeGeneral'> & { currentDate: UseChatComposerOptions['today']; pathname: string }

export function useChatComposerState({ currentDate, selectedDate, pathname, includeGeneral }: ChatComposerStateInputs) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const allowanceText = useMemo(() => createAstraAllowanceTranslator(t, profile, i18n.language), [t, profile, i18n.language])

  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion)
  const calendarHasError = useUIStore((state) => state.calendarHasError)
  const today = currentDate ?? formatAPIDateInTimeZone(new Date(), profile?.timeZone)
  const date = selectedDate ?? today
  const surface = resolveComposerChipSurface(pathname)
  const habitsQuery = useHabits(surface === "progress"
    ? {}
    : { dateFrom: date, dateTo: date, includeOverdue: date === today, includeGeneral: includeGeneral || undefined },
    { completeDay: true })
  const detailId = surface === "habitDetail" ? pathname.split("/")[2] ?? null : null
  const detailQuery = useHabitDetail(detailId)

  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const queuedPrompts = useChatStore(state => state.queuedPrompts)
  const queuePaused = useChatStore(state => state.queuePaused)
  const queueReady = useChatStore(state => state.queueReady)
  const replyActive = useChatStore(state => state.replyActive)
  const stopReply = useRef<(() => void) | null>(null)

  const streamingMessageId = useChatStore((s) => s.streamingMessageId)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const appendToMessageContent = useChatStore((s) => s.appendToMessageContent)
  const setIsTyping = useChatStore((s) => s.setIsTyping)
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId)
  const input = useChatStore((s) => s.draft)
  const setInput = useChatStore((s) => s.setDraft)
  const draftHydrated = useChatStore((s) => s.draftHydrated)
  const hydrateDraft = useChatStore((s) => s.hydrateDraft)

  const {
    isRecording,
    isTranscribing,
    isSupported: speechSupported,
    transcript,
    error: speechError,
    toggleRecording,
    recordingDuration,
  } = useSpeechToText()

  const flatListRef = useRef<FlatList<ChatMessage>>(null)
  const [threadScroll] = useState(createChatThreadScroll)
  const prefersReducedMotion = usePrefersReducedMotion()
  const prefersReducedMotionRef = useRef(prefersReducedMotion)
  useEffect(() => {
    prefersReducedMotionRef.current = prefersReducedMotion
  }, [prefersReducedMotion])
  const pendingVoiceCommitRef = useRef(false)

  const [sendError, setSendError] = useState<string | null>(null)
  const [activeSteps, setActiveSteps] = useState<{ domain: string; access: string }[]>([])
  const activeStepsRef = useRef<{ domain: string; access: string }[]>([])
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null)
  const [dailyBudgetDate, setDailyBudgetDate] = useState<string | null>(null)
  const [turnReconciliation] = useState(() => new ChatTurnReconciliation())
  const [blockSubmission] = useState(() => new BlockAnswerSubmission())
  return { turnReconciliation, blockSubmission, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, setSendError, profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, messages, draftHydrated, hydrateDraft, input, isRecording, pendingVoiceCommitRef, transcript, setInput, recordingDuration, threadScroll, flatListRef, prefersReducedMotionRef, queryClient, t, allowanceText, updateMessage, addMessage, setIsTyping, setStreamingMessageId, i18n, stopReply, appendToMessageContent, queuePaused, queueReady, queuedPrompts, lastFailedSend, surface, habitsQuery, detailQuery, calendarHasError, date, contextualSuggestion, speechError, sendError, toggleRecording, isTranscribing, speechSupported, activeSteps }
}

type ChatComposerSessionInputs = Pick<ReturnType<typeof useChatComposerState>, 'turnReconciliation' | 'blockSubmission' | 'activeStepsRef' | 'setActiveSteps' | 'setLastFailedSend' | 'setDailyBudgetDate' | 'setSendError'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'setSelectedImage' | 'setImagePreview' | 'setSelectedTextFile' | 'imageSelectionVersionRef'>

export function useChatComposerSession({ turnReconciliation, blockSubmission, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, setSendError, setSelectedImage, setImagePreview, setSelectedTextFile, imageSelectionVersionRef }: ChatComposerSessionInputs) {
  /**
     * The root layout keeps this hook mounted through an account change, so the previous account's
     * attempted send would otherwise stay armed behind Retry and post its text and image under the
     * next account's token. The store reset cannot reach React state, so it follows the session
     * itself, and every field added here is covered by the same subscription.
     */
  useResetOnAccountChange(() => {
    imageSelectionVersionRef.current += 1
    turnReconciliation.reset()
    blockSubmission.reset()
    activeStepsRef.current = []
    setActiveSteps([])
    setLastFailedSend(null)
    setDailyBudgetDate(null)
    setSendError(null)
    setSelectedImage(null)
    setImagePreview(null)
    setSelectedTextFile(null)
    useUIStore.getState().setAstraConversationOpen(false)
  })

}

type ChatComposerAvailabilityInputs = Pick<ReturnType<typeof useChatComposerState>, 'profile' | 'dailyBudgetDate' | 'today' | 'replyActive' | 'isTyping' | 'streamingMessageId' | 'messages'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'selectedImage' | 'selectedTextFile'>

export function useChatComposerAvailability({ profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, selectedImage, selectedTextFile, messages }: ChatComposerAvailabilityInputs) {
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? (hasProAccess ? 50 : 5)
  const dailyBudgetReached = dailyBudgetDate === today
  const atMessageLimit = dailyBudgetReached || aiMessagesUsed >= aiMessagesLimit
  const isSending = replyActive || isTyping || streamingMessageId !== null
  const imageName = selectedImage?.fileName ?? selectedImage?.uri.split("/").at(-1)
  const attachments = useMemo(
    () => [
      ...(selectedTextFile
        ? [{ id: "chat-file", kind: "file" as const, name: selectedTextFile.name }]
        : []),
      ...(selectedImage && imageName
        ? [{ id: "chat-image", kind: "image" as const, name: imageName }]
        : []),
    ],
    [imageName, selectedImage, selectedTextFile],
  )
  const showSuggestions = messages.length === 0 && !isTyping && !atMessageLimit
  return { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, attachments, aiMessagesUsed, hasProAccess, showSuggestions }
}

type ChatDraftPersistenceInputs = Pick<ReturnType<typeof useChatComposerState>, 'draftHydrated' | 'hydrateDraft' | 'input' | 'isRecording' | 'pendingVoiceCommitRef' | 'transcript' | 'setInput'>

export function useChatDraftPersistence({ draftHydrated, hydrateDraft, input, isRecording, pendingVoiceCommitRef, transcript, setInput }: ChatDraftPersistenceInputs) {
  useEffect(() => {
    if (draftHydrated) return
    let active = true
    void AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY).then((storedDraft) => {
      if (active) hydrateDraft(storedDraft)
    })
    return () => {
      active = false
    }
  }, [draftHydrated, hydrateDraft])

  useEffect(() => {
    if (!draftHydrated) return
    if (input.trim()) {
      void AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input)
    } else {
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    }
  }, [draftHydrated, input])

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommitRef.current = true
    } else if (pendingVoiceCommitRef.current && transcript.trim()) {
      pendingVoiceCommitRef.current = false
      setInput((current) => current ? `${current} ${transcript.trim()}` : transcript.trim())
    }
  }, [isRecording, pendingVoiceCommitRef, setInput, transcript])

}

type ChatComposerScrollInputs = Pick<ReturnType<typeof useChatComposerState>, 'recordingDuration' | 'threadScroll' | 'flatListRef' | 'prefersReducedMotionRef'>

export function useChatComposerScroll({ recordingDuration, threadScroll, flatListRef, prefersReducedMotionRef }: ChatComposerScrollInputs) {
  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }, [recordingDuration])

  const scrollToBottom = useCallback((afterScroll?: () => void) => {
    setTimeout(() => {
      if (threadScroll.isFollowing()) flatListRef.current?.scrollToEnd({ animated: !prefersReducedMotionRef.current })
      afterScroll?.()
    }, 100)
  }, [flatListRef, prefersReducedMotionRef, threadScroll])
  return { scrollToBottom, recordingTime }
}

type ChatComposerSuggestionsInputs = Pick<ReturnType<typeof useChatComposerState>, 'surface' | 'habitsQuery' | 'detailQuery' | 'calendarHasError' | 'date' | 'today' | 'profile' | 'contextualSuggestion' | 't' | 'allowanceText' | 'queuedPrompts' | 'queuePaused' | 'setSendError' | 'speechError'> & Pick<UseChatComposerOptions, 'totalHabitCount' | 'isOnline'> & Pick<ReturnType<typeof useChatSendMessage>, 'sendMessage'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'aiMessagesLimit' | 'aiMessagesUsed' | 'dailyBudgetReached' | 'isSending' | 'atMessageLimit'> & Pick<ReturnType<typeof useChatSendRetry>, 'sendQueuedPrompt'>

export function useChatComposerSuggestions({ surface, habitsQuery, detailQuery, calendarHasError, date, today, totalHabitCount, profile, contextualSuggestion, t, sendMessage, aiMessagesLimit, aiMessagesUsed, dailyBudgetReached, allowanceText, queuedPrompts, queuePaused, isSending, isOnline, atMessageLimit, setSendError, sendQueuedPrompt, speechError }: ChatComposerSuggestionsInputs) {
  const chipStatus = resolveComposerChipStatus(surface, {
    habitsError: habitsQuery.isError,
    habitsReady: Boolean(habitsQuery.data),
    detailError: detailQuery.isError,
    detailReady: Boolean(detailQuery.data),
    calendarError: calendarHasError,
  })
  const composerSuggestions = useMemo(() => {
    const chips = buildComposerChips({
      surface,
      status: chipStatus,
      habits: habitsQuery.data?.topLevelHabits ?? [],
      selectedDateIsToday: date === today,
      totalHabitCount: totalHabitCount === undefined ? habitsQuery.data?.totalCount ?? null : totalHabitCount,
      profile: profile ?? null,
      detailHabit: detailQuery.data,
      contextualSuggestion,
    })
    return toComposerSuggestions(chips.map(({ id, key, params, promptKey, label: providedLabel, prompt: providedPrompt }) => {
      const label = providedLabel ?? t(key)
      const prompt = providedPrompt ?? (promptKey ? t(promptKey, params) : label)
      return {
        id, label, onSelect: () => {
          void sendMessage(prompt, undefined, contextualSuggestion?.id === id ? contextualSuggestion : undefined)
        }
      }
    }))
  }, [surface, chipStatus, habitsQuery.data, detailQuery.data, contextualSuggestion, totalHabitCount, profile, date, today, sendMessage, t])

  const remainingMessages = aiMessagesLimit - aiMessagesUsed
  const nearMessageLimit = remainingMessages <= AI_MESSAGE_COUNTER_THRESHOLD
  const renewalHint = nearMessageLimit && !dailyBudgetReached ? allowanceText("shell.composer.limit.renewal") : undefined
  const allowanceReason = nearMessageLimit && !dailyBudgetReached ? allowanceText("shell.composer.limit.reason", { allowance: aiMessagesLimit }) : undefined

  const usageMessage = nearMessageLimit && !dailyBudgetReached && remainingMessages > 0
    ? allowanceText("shell.composer.usage", { used: aiMessagesUsed, limit: aiMessagesLimit }) : undefined

  const messageLimitReason = dailyBudgetReached ? t("chat.dailyBudgetReached") : allowanceText("shell.composer.limit.reason", { allowance: aiMessagesLimit })
  const messageLimitPlaceholder = dailyBudgetReached ? t('shell.composer.limit.placeholder') : allowanceText('shell.composer.limit.placeholder')

  const queue = useMemo(() => ({
    label: t('shell.composer.queue.label'),
    items: queuedPrompts,
    pausedReason: queuePaused ? t('shell.composer.queue.paused') : undefined,
    canSend: !isSending && isOnline && !atMessageLimit,
    removeLabel: (message: string) => t('shell.composer.queue.remove', { message }),
    sendLabel: (message: string) => t('shell.composer.queue.send', { message }),
    onRemove: (id: string) => { useChatStore.getState().removeQueuedPrompt(id); setSendError(null) },
    onSend: (id: string) => { void sendQueuedPrompt(id) },
  }), [atMessageLimit, isOnline, isSending, queuePaused, queuedPrompts, sendQueuedPrompt, setSendError, t])

  const speechRecovery = useMemo(() => speechError === t('speech.micDenied')
    ? { errorRecovery: { label: t('common.openSettings'), onSelect: () => { void Linking.openSettings() } } }
    : {}, [speechError, t])
  return { queue, usageMessage, renewalHint, allowanceReason, speechRecovery, composerSuggestions, messageLimitPlaceholder, messageLimitReason }
}

type ChatComposerPropsInputs = Pick<ReturnType<typeof useChatComposerState>, 't' | 'stopReply' | 'input' | 'speechError' | 'sendError' | 'setInput' | 'isRecording' | 'toggleRecording' | 'isTranscribing' | 'speechSupported'> & Pick<UseChatComposerOptions, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'isSending' | 'attachments' | 'atMessageLimit'> & Pick<ReturnType<typeof useChatComposerSuggestions>, 'queue' | 'usageMessage' | 'renewalHint' | 'allowanceReason' | 'speechRecovery' | 'composerSuggestions' | 'messageLimitPlaceholder' | 'messageLimitReason'> & Pick<ReturnType<typeof useChatSendMessage>, 'sendMessage'> & Pick<ReturnType<typeof useChatComposerTextFile>, 'openTextFilePicker' | 'removeTextFile'> & Pick<ReturnType<typeof useChatComposerImage>, 'openFilePicker' | 'removeImage'> & Pick<ReturnType<typeof useChatSendRetry>, 'canRetryLastSend' | 'retryLastSend'>

export function useChatComposerProps({ t, isOnline, isSending, queue, stopReply, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, speechRecovery, setInput, sendMessage, composerSuggestions, openTextFilePicker, openFilePicker, attachments, removeTextFile, removeImage, canRetryLastSend, retryLastSend, isRecording, toggleRecording, isTranscribing, speechSupported, atMessageLimit, messageLimitPlaceholder, messageLimitReason }: ChatComposerPropsInputs) {
  const composerProps = useMemo(() => {
    const { words, voiceWords } = createComposerWords({ t, isOnline, isSending })
    const common = {
      queue,
      ...(isSending ? { replyControl: { label: t('shell.composer.queue.stop'), onStop: () => stopReply.current?.() } } : {}),
      usageMessage,
      renewalHint,
      allowanceReason,
      words,
      value: input,
      errorMessage: speechError ?? sendError ?? undefined,
      ...speechRecovery,
      onChangeValue: setInput,
      onSend: () => void sendMessage(),
      suggestions: composerSuggestions,
      onAttachFile: () => void openTextFilePicker(),
      onAttachImage: () => void openFilePicker(),
      attachWords: {
        file: t("shell.composer.attach.file"),
        image: t("shell.composer.attach.image"),
        trayLabel: t("shell.composer.attach.trayLabel"),
        remove: (name: string) => t("shell.composer.attach.remove", { name }),
      },
      attachments,
      onAttachRemove: (id: string) => {
        if (id === "chat-file") removeTextFile()
        if (id === "chat-image") removeImage()
      },
      ...(canRetryLastSend ? { onRetry: () => void retryLastSend() } : {}),
    }

    if (isRecording) return { ...common, state: "recording", onVoice: toggleRecording, voiceWords }
    if (isTranscribing) return { ...common, state: "transcribing", onVoice: toggleRecording, voiceWords }

    if (!isOnline) {
      const limitReason = t("shell.composer.offline.reason")
      return speechSupported
        ? { ...common, state: "offline", limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: "offline", limitReason }
    }

    if (atMessageLimit) {
      const limitWords = { ...words, placeholder: messageLimitPlaceholder }
      const limitReason = messageLimitReason
      return speechSupported
        ? { ...common, words: limitWords, suggestions: [] as const, state: "atLimit", limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, words: limitWords, suggestions: [] as const, state: "atLimit", limitReason }
    }

    const state: "idle" | "sending" = isSending ? "sending" : "idle"
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state }
  }, [t, isOnline, isSending, queue, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, speechRecovery, setInput, composerSuggestions, attachments, canRetryLastSend, isRecording, toggleRecording, isTranscribing, atMessageLimit, speechSupported, stopReply, sendMessage, openTextFilePicker, openFilePicker, removeTextFile, removeImage, retryLastSend, messageLimitPlaceholder, messageLimitReason]) as ComposerProps
  return { composerProps }
}

function createComposerWords({ t, isOnline, isSending }: Pick<ChatComposerPropsInputs, 't' | 'isOnline' | 'isSending'>) {
  const words = {
    placeholder: t(isOnline ? "shell.composer.placeholder" : "shell.composer.offline.placeholder"),
    inputLabel: t("shell.composer.inputLabel"),
    ...(!isOnline ? { offlineReason: t("shell.composer.offline.reason") } : {}),
    send: t(isSending ? 'shell.composer.queue.add' : 'shell.composer.send'),
    clear: t("shell.composer.clear"),
    paste: t("shell.composer.paste"),
    nothingToPaste: t("shell.composer.nothingToPaste"),
    actions: t("shell.composer.actions"),
    suggestionsLabel: t("shell.composer.suggestionsLabel"),
    retry: t("shell.composer.retry"),
  }
  const voiceWords = {
    start: t("shell.composer.voice.start"),
    stop: t("shell.composer.voice.stop"),
    recording: t("shell.composer.voice.recording"),
    transcribing: t("shell.composer.voice.transcribing"),
  }
  return { words, voiceWords }
}

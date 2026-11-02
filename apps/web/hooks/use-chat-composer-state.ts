'use client'

import { createAstraAllowanceTranslator } from '@orbit/shared/utils'
import { mediaQueryMatches } from '@/lib/media-query'
import { useState, useRef, useId, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { hasComposerContent, toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { BlockAnswerSubmission, buildComposerChips, resolveComposerChipStatus, resolveComposerChipSurface, AI_MESSAGE_COUNTER_THRESHOLD, ChatTurnReconciliation } from '@orbit/shared/chat'
import { CHAT_DRAFT_STORAGE_KEY, createChatThreadScroll } from '@orbit/shared/hooks'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { useHabitDetail, useHabits } from '@/hooks/use-habit-queries'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import type { UseChatComposerOptions, AttemptedSend } from './use-chat-composer-types'
import type { useChatComposerAttachments } from './use-chat-composer-attachments'
import type { useChatSendMessage, useChatSendRetry } from './use-chat-send-stream'

function subscribeToNetworkStatus(onStoreChange: () => void): () => void {
  globalThis.addEventListener('online', onStoreChange)
  globalThis.addEventListener('offline', onStoreChange)
  return () => {
    globalThis.removeEventListener('online', onStoreChange)
    globalThis.removeEventListener('offline', onStoreChange)
  }
}

function readNetworkStatus(): boolean {
  return globalThis.navigator.onLine
}

function readServerNetworkStatus(): boolean {
  return true
}

type ChatComposerStateInputs = { options: UseChatComposerOptions }

export function useChatComposerState({ options }: ChatComposerStateInputs) {
  const t = useTranslations()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const allowanceText = useMemo(() => createAstraAllowanceTranslator(t, profile, locale), [t, profile, locale])

  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion)
  const calendarHasError = useUIStore((state) => state.calendarHasError)
  const today = options.today ?? formatAPIDateInTimeZone(new Date(), profile?.timeZone)
  const selectedDate = options.selectedDate ?? today
  const surface = resolveComposerChipSurface(options.pathname ?? '/')
  const habitsQuery = useHabits(surface === 'progress'
    ? {}
    : { dateFrom: selectedDate, dateTo: selectedDate, includeOverdue: selectedDate === today, includeGeneral: options.includeGeneral || undefined },
    undefined, { completeDay: true })
  const detailId = surface === 'habitDetail' ? options.pathname?.split('/')[2] ?? null : null
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

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [threadScroll] = useState(createChatThreadScroll)
  const composerInputId = useId()
  const pendingVoiceCommitRef = useRef(false)

  const [sendError, setSendError] = useState<string | null>(null)
  const [activeSteps, setActiveSteps] = useState<{ domain: string; access: string }[]>([])
  const activeStepsRef = useRef<{ domain: string; access: string }[]>([])
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null)
  const [dailyBudgetDate, setDailyBudgetDate] = useState<string | null>(null)
  const [turnReconciliation] = useState(() => new ChatTurnReconciliation())
  const [blockSubmission] = useState(() => new BlockAnswerSubmission())
  return { setSendError, turnReconciliation, blockSubmission, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, input, messages, recordingDuration, chatContainerRef, threadScroll, queryClient, isRecording, isTranscribing, lastFailedSend, queuedPrompts, allowanceText, updateMessage, addMessage, setIsTyping, setInput, t, setStreamingMessageId, draftHydrated, composerInputId, hydrateDraft, pendingVoiceCommitRef, transcript, locale, stopReply, appendToMessageContent, queuePaused, queueReady, surface, habitsQuery, detailQuery, calendarHasError, selectedDate, contextualSuggestion, speechError, sendError, toggleRecording, speechSupported, activeSteps }
}

type ChatComposerSessionInputs = Pick<ReturnType<typeof useChatComposerState>, 'turnReconciliation' | 'blockSubmission' | 'activeStepsRef' | 'setActiveSteps' | 'setLastFailedSend' | 'setDailyBudgetDate' | 'setSendError'>

export function useChatComposerSession({ turnReconciliation, blockSubmission, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, setSendError }: ChatComposerSessionInputs) {
  /**
     * The app shell keeps this hook mounted through an account change, so the previous account's
     * attempted send would otherwise stay armed behind Retry and post its text under the next
     * account's cookie. The store reset cannot reach React state, so it follows the session
     * itself.
     */
  useResetOnAccountChange(() => {
    turnReconciliation.reset()
    blockSubmission.reset()
    activeStepsRef.current = []
    setActiveSteps([])
    setLastFailedSend(null)
    setDailyBudgetDate(null)
    setSendError(null)
    useUIStore.getState().setAstraConversationOpen(false)
  })

  const isOnline = useSyncExternalStore(
    subscribeToNetworkStatus,
    readNetworkStatus,
    readServerNetworkStatus,
  )
  return { isOnline }
}

type ChatComposerAvailabilityInputs = Pick<ReturnType<typeof useChatComposerState>, 'profile' | 'dailyBudgetDate' | 'today' | 'replyActive' | 'isTyping' | 'streamingMessageId' | 'input' | 'messages'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'selectedTextFile' | 'selectedImage'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'>

export function useChatComposerAvailability({ profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, selectedTextFile, selectedImage, input, isOnline, messages }: ChatComposerAvailabilityInputs) {
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? (hasProAccess ? 50 : 5)
  const dailyBudgetReached = dailyBudgetDate === today
  const atMessageLimit = dailyBudgetReached || aiMessagesUsed >= aiMessagesLimit
  const isSending = replyActive || isTyping || streamingMessageId !== null
  const attachments = useMemo(
    () => [
      ...(selectedTextFile
        ? [{ id: 'chat-file', kind: 'file' as const, name: selectedTextFile.name }]
        : []),
      ...(selectedImage
        ? [{ id: 'chat-image', kind: 'image' as const, name: selectedImage.name }]
        : []),
    ],
    [selectedImage, selectedTextFile],
  )
  const canSend =
    hasComposerContent(input, attachments) && !atMessageLimit && isOnline
  const showSuggestions = messages.length === 0 && !isTyping && !atMessageLimit
  return { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, attachments, aiMessagesUsed, hasProAccess, canSend, showSuggestions }
}

type ChatComposerScrollInputs = Pick<ReturnType<typeof useChatComposerState>, 'recordingDuration' | 'chatContainerRef' | 'threadScroll'>

export function useChatComposerScroll({ recordingDuration, chatContainerRef, threadScroll }: ChatComposerScrollInputs) {
  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [recordingDuration])

  const scrollToBottom = useCallback((afterScroll?: () => void) => {
    requestAnimationFrame(() => {
      const el = chatContainerRef.current
      if (el && threadScroll.isFollowing()) el.scrollTo({
        top: el.scrollHeight,
        behavior: mediaQueryMatches('(prefers-reduced-motion: reduce)', true) ? 'auto' : 'smooth',
      })
      afterScroll?.()
    })
  }, [chatContainerRef, threadScroll])
  return { scrollToBottom, recordingTime }
}

type ChatDraftPersistenceInputs = Pick<ReturnType<typeof useChatComposerState>, 'draftHydrated' | 'composerInputId' | 'hydrateDraft' | 'input' | 'isRecording' | 'pendingVoiceCommitRef' | 'transcript' | 'setInput'>

export function useChatDraftPersistence({ draftHydrated, composerInputId, hydrateDraft, input, isRecording, pendingVoiceCommitRef, transcript, setInput }: ChatDraftPersistenceInputs) {
  useEffect(() => {
    if (!draftHydrated) {
      const textarea = document.getElementById(composerInputId) as HTMLTextAreaElement | null
      hydrateDraft(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY), textarea?.value)
    }
  }, [composerInputId, draftHydrated, hydrateDraft])

  useEffect(() => {
    if (!draftHydrated) return
    const trimmedDraft = input.trim()
    if (!trimmedDraft) {
      globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
      return
    }
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input)
  }, [draftHydrated, input])

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommitRef.current = true
    } else if (pendingVoiceCommitRef.current && transcript.trim()) {
      pendingVoiceCommitRef.current = false
      setInput((current) => (current ? `${current} ${transcript.trim()}` : transcript.trim()))
    }
  }, [isRecording, pendingVoiceCommitRef, setInput, transcript])

}

type ChatComposerSuggestionsInputs = Pick<ReturnType<typeof useChatComposerState>, 'surface' | 'habitsQuery' | 'detailQuery' | 'calendarHasError' | 'selectedDate' | 'today' | 'profile' | 'contextualSuggestion' | 't' | 'allowanceText' | 'queuedPrompts' | 'queuePaused' | 'setSendError'> & { options: UseChatComposerOptions } & Pick<ReturnType<typeof useChatSendMessage>, 'sendMessage'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'aiMessagesLimit' | 'aiMessagesUsed' | 'dailyBudgetReached' | 'isSending' | 'atMessageLimit'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatSendRetry>, 'sendQueuedPrompt'>

export function useChatComposerSuggestions({ surface, habitsQuery, detailQuery, calendarHasError, selectedDate, today, options, profile, contextualSuggestion, t, sendMessage, aiMessagesLimit, aiMessagesUsed, dailyBudgetReached, allowanceText, queuedPrompts, queuePaused, isSending, isOnline, atMessageLimit, setSendError, sendQueuedPrompt }: ChatComposerSuggestionsInputs) {
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
      selectedDateIsToday: selectedDate === today,
      totalHabitCount: options.totalHabitCount === undefined ? habitsQuery.data?.totalCount ?? null : options.totalHabitCount,
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
  }, [surface, chipStatus, habitsQuery.data, detailQuery.data, contextualSuggestion, options.totalHabitCount, profile, selectedDate, today, sendMessage, t])

  const remainingMessages = aiMessagesLimit - aiMessagesUsed
  const nearMessageLimit = remainingMessages <= AI_MESSAGE_COUNTER_THRESHOLD
  const renewalHint = nearMessageLimit && !dailyBudgetReached ? allowanceText('shell.composer.limit.renewal') : undefined
  const allowanceReason = nearMessageLimit && !dailyBudgetReached ? allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }) : undefined

  const usageMessage = nearMessageLimit && !dailyBudgetReached && remainingMessages > 0
    ? allowanceText('shell.composer.usage', { used: aiMessagesUsed, limit: aiMessagesLimit }) : undefined

  const messageLimitReason = dailyBudgetReached ? t('chat.dailyBudgetReached') : allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit })
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
  return { queue, usageMessage, renewalHint, allowanceReason, composerSuggestions, messageLimitPlaceholder, messageLimitReason }
}

type ChatComposerPropsInputs = Pick<ReturnType<typeof useChatComposerState>, 't' | 'stopReply' | 'input' | 'speechError' | 'sendError' | 'setInput' | 'isRecording' | 'toggleRecording' | 'isTranscribing' | 'speechSupported'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'> & Pick<ReturnType<typeof useChatComposerAvailability>, 'isSending' | 'attachments' | 'atMessageLimit'> & Pick<ReturnType<typeof useChatComposerSuggestions>, 'queue' | 'usageMessage' | 'renewalHint' | 'allowanceReason' | 'composerSuggestions' | 'messageLimitPlaceholder' | 'messageLimitReason'> & Pick<ReturnType<typeof useChatSendMessage>, 'sendMessage'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'handlePaste' | 'openTextFilePicker' | 'openFilePicker' | 'removeTextFile' | 'removeImage'> & Pick<ReturnType<typeof useChatSendRetry>, 'canRetryLastSend' | 'retryLastSend'>

export function useChatComposerProps({ t, isOnline, isSending, queue, stopReply, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, setInput, sendMessage, handlePaste, composerSuggestions, openTextFilePicker, openFilePicker, attachments, removeTextFile, removeImage, canRetryLastSend, retryLastSend, isRecording, toggleRecording, isTranscribing, speechSupported, atMessageLimit, messageLimitPlaceholder, messageLimitReason }: ChatComposerPropsInputs) {
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
      onChangeValue: setInput,
      onSend: () => void sendMessage(),
      onPaste: handlePaste,
      suggestions: composerSuggestions,
      onAttachFile: openTextFilePicker,
      onAttachImage: openFilePicker,
      attachWords: {
        file: t('shell.composer.attach.file'),
        image: t('shell.composer.attach.image'),
        trayLabel: t('shell.composer.attach.trayLabel'),
        remove: (name: string) => t('shell.composer.attach.remove', { name }),
      },
      attachments,
      onAttachRemove: (id: string) => {
        if (id === 'chat-file') removeTextFile()
        if (id === 'chat-image') removeImage()
      },
      ...(canRetryLastSend ? { onRetry: () => void retryLastSend() } : {}),
    }

    if (isRecording) return { ...common, state: 'recording', onVoice: toggleRecording, voiceWords }
    if (isTranscribing) return { ...common, state: 'transcribing', onVoice: toggleRecording, voiceWords }

    if (!isOnline) {
      const limitReason = t('shell.composer.offline.reason')
      return speechSupported
        ? { ...common, state: 'offline', limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: 'offline', limitReason }
    }

    if (atMessageLimit) {
      const limitWords = { ...words, placeholder: messageLimitPlaceholder }
      const limitReason = messageLimitReason
      return speechSupported
        ? { ...common, words: limitWords, suggestions: [] as const, state: 'atLimit', limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, words: limitWords, suggestions: [] as const, state: 'atLimit', limitReason }
    }

    const state: 'idle' | 'sending' = isSending ? 'sending' : 'idle'
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state }
  }, [t, isOnline, isSending, queue, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, setInput, handlePaste, composerSuggestions, openTextFilePicker, openFilePicker, attachments, canRetryLastSend, isRecording, toggleRecording, isTranscribing, atMessageLimit, speechSupported, stopReply, sendMessage, removeTextFile, removeImage, retryLastSend, messageLimitPlaceholder, messageLimitReason]) as ComposerProps & { onPaste: typeof handlePaste }
  return { composerProps }
}

function createComposerWords({ t, isOnline, isSending }: Pick<ChatComposerPropsInputs, 't' | 'isOnline' | 'isSending'>) {
  const words = {
    placeholder: t(isOnline ? 'shell.composer.placeholder' : 'shell.composer.offline.placeholder'),
    inputLabel: t('shell.composer.inputLabel'),
    ...(!isOnline ? { offlineReason: t('shell.composer.offline.reason') } : {}),
    send: t(isSending ? 'shell.composer.queue.add' : 'shell.composer.send'),
    clear: t('shell.composer.clear'),
    paste: t('shell.composer.paste'),
    nothingToPaste: t('shell.composer.nothingToPaste'),
    actions: t('shell.composer.actions'),
    suggestionsLabel: t('shell.composer.suggestionsLabel'),
    retry: t('shell.composer.retry'),
  }
  const voiceWords = {
    start: t('shell.composer.voice.start'),
    stop: t('shell.composer.voice.stop'),
    recording: t('shell.composer.voice.recording'),
    transcribing: t('shell.composer.voice.transcribing'),
  }
  return { words, voiceWords }
}

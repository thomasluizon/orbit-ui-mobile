import { BlockAnswerSubmission,ChatTurnReconciliation } from '../chat'
import { createChatThreadScroll } from './chat-thread-scroll-core'
import type { StateSetter } from './state-adapter'
import { hasComposerContent,toComposerSuggestions,type ComposerProps,type ComposerAttachment } from '../contracts/composer'
import { buildComposerChips,resolveComposerChipStatus,AI_MESSAGE_COUNTER_THRESHOLD,type ComposerChipSurface } from '../chat'
import type { ChatStoreState } from '../stores/chat-store'
import type { Profile } from '../types/profile'
import type { HabitDetail,NormalizedHabit } from '../types/habit'
import type { QueryClient } from '@tanstack/query-core'

type Translate = (key: string, values?: Record<string, string | number | Date>) => string

type ComposerAvailabilityInputs = Pick<ChatStoreState, 'replyActive' | 'isTyping' | 'streamingMessageId' | 'messages'> & {
  profile: Profile | undefined
  dailyBudgetDate: string | null
  today: string
  input: string
  isOnline: boolean
  attachments: ComposerAttachment[]
}

export function buildComposerAvailability({ profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, messages, input, isOnline, attachments }: ComposerAvailabilityInputs) {
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? (hasProAccess ? 50 : 5)
  const dailyBudgetReached = dailyBudgetDate === today
  const atMessageLimit = dailyBudgetReached || aiMessagesUsed >= aiMessagesLimit
  const isSending = replyActive || isTyping || streamingMessageId !== null
  const canSend = hasComposerContent(input, attachments) && !atMessageLimit && isOnline
  const showSuggestions = messages.length === 0 && !isTyping && !atMessageLimit
  return { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, attachments, aiMessagesUsed, hasProAccess, canSend, showSuggestions }
}

interface ComposerSuggestionsInputs extends Pick<ChatStoreState, 'contextualSuggestion' | 'queuedPrompts' | 'queuePaused'> {
  surface: ComposerChipSurface
  habitsQuery: { isError: boolean; data?: { topLevelHabits: NormalizedHabit[]; totalCount: number } }
  detailQuery: { isError: boolean; data?: HabitDetail | null }
  calendarHasError: boolean
  selectedDate: string
  today: string
  totalHabitCount?: number | null
  profile: Profile | undefined
  t: Translate
  allowanceText: Translate
  sendMessage: (content?: string, requestContext?: undefined, contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>) => Promise<void>
  aiMessagesLimit: number
  aiMessagesUsed: number
  dailyBudgetReached: boolean
  isSending: boolean
  isOnline: boolean
  atMessageLimit: boolean
  setSendError: (error: string | null) => void
  sendQueuedPrompt: (id: string) => Promise<void>
  getChat: () => ChatStoreState
}

export function buildComposerSuggestions({ surface, habitsQuery, detailQuery, calendarHasError, selectedDate, today, totalHabitCount, profile, contextualSuggestion, t, sendMessage, aiMessagesLimit, aiMessagesUsed, dailyBudgetReached, allowanceText, queuedPrompts, queuePaused, isSending, isOnline, atMessageLimit, setSendError, sendQueuedPrompt, getChat }: ComposerSuggestionsInputs) {
  const chipStatus = resolveComposerChipStatus(surface, {
    habitsError: habitsQuery.isError,
    habitsReady: Boolean(habitsQuery.data),
    detailError: detailQuery.isError,
    detailReady: Boolean(detailQuery.data),
    calendarError: calendarHasError,
  })
  const composerSuggestions = (() => {
    const chips = buildComposerChips({
      surface,
      status: chipStatus,
      habits: habitsQuery.data?.topLevelHabits ?? [],
      selectedDateIsToday: selectedDate === today,
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
  })()

  const remainingMessages = aiMessagesLimit - aiMessagesUsed
  const nearMessageLimit = remainingMessages <= AI_MESSAGE_COUNTER_THRESHOLD
  const renewalHint = nearMessageLimit && !dailyBudgetReached ? allowanceText('shell.composer.limit.renewal') : undefined
  const allowanceReason = nearMessageLimit && !dailyBudgetReached ? allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }) : undefined

  const usageMessage = nearMessageLimit && !dailyBudgetReached && remainingMessages > 0
    ? allowanceText('shell.composer.usage', { used: aiMessagesUsed, limit: aiMessagesLimit }) : undefined

  const messageLimitReason = dailyBudgetReached ? t('chat.dailyBudgetReached') : allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit })
  const messageLimitPlaceholder = dailyBudgetReached ? t('shell.composer.limit.placeholder') : allowanceText('shell.composer.limit.placeholder')

  const queue = ({
    label: t('shell.composer.queue.label'),
    items: queuedPrompts,
    pausedReason: queuePaused ? t('shell.composer.queue.paused') : undefined,
    canSend: !isSending && isOnline && !atMessageLimit,
    removeLabel: (message: string) => t('shell.composer.queue.remove', { message }),
    sendLabel: (message: string) => t('shell.composer.queue.send', { message }),
    onRemove: (id: string) => { getChat().removeQueuedPrompt(id); setSendError(null) },
    onSend: (id: string) => { void sendQueuedPrompt(id) },
  })
  return { queue, usageMessage, renewalHint, allowanceReason, composerSuggestions, messageLimitPlaceholder, messageLimitReason }
}


interface ComposerPropsInputs {
  t: Translate
  isOnline: boolean
  isSending: boolean
  queue: ComposerProps['queue']
  stopReply: { current: (() => void) | null }
  usageMessage: string | undefined
  renewalHint: string | undefined
  allowanceReason: string | undefined
  input: string
  speechError: string | null
  sendError: string | null
  setInput: (value: string) => void
  sendMessage: () => Promise<void>
  composerSuggestions: ComposerProps['suggestions']
  openTextFilePicker: () => void | Promise<void>
  openFilePicker: () => void | Promise<void>
  attachments: ComposerAttachment[]
  removeTextFile: () => void
  removeImage: () => void
  canRetryLastSend: boolean
  retryLastSend: () => Promise<void>
  isRecording: boolean
  toggleRecording: () => void
  isTranscribing: boolean
  speechSupported: boolean
  atMessageLimit: boolean
  messageLimitPlaceholder: string
  messageLimitReason: string
}

export function buildChatComposerProps<PlatformProps extends object>({ t, isOnline, isSending, queue, stopReply, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, setInput, sendMessage, composerSuggestions, openTextFilePicker, openFilePicker, attachments, removeTextFile, removeImage, canRetryLastSend, retryLastSend, isRecording, toggleRecording, isTranscribing, speechSupported, atMessageLimit, messageLimitPlaceholder, messageLimitReason }: ComposerPropsInputs, platformProps: PlatformProps): ComposerProps & PlatformProps {
  const props = (() => {
    const { words, voiceWords } = createComposerWords(t, isOnline, isSending)
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
      ...platformProps,
      suggestions: composerSuggestions,
      onAttachFile: () => { void openTextFilePicker() },
      onAttachImage: () => { void openFilePicker() },
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

    if (isRecording) return { ...common, state: 'recording' as const, onVoice: toggleRecording, voiceWords }
    if (isTranscribing) return { ...common, state: 'transcribing' as const, onVoice: toggleRecording, voiceWords }

    if (!isOnline) {
      const limitReason = t('shell.composer.offline.reason')
      return speechSupported
        ? { ...common, state: 'offline' as const, limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: 'offline' as const, limitReason }
    }

    if (atMessageLimit) {
      const limitWords = { ...words, placeholder: messageLimitPlaceholder }
      const limitReason = messageLimitReason
      return speechSupported
        ? { ...common, words: limitWords, suggestions: [] as const, state: 'atLimit' as const, limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, words: limitWords, suggestions: [] as const, state: 'atLimit' as const, limitReason }
    }

    const state: 'idle' | 'sending' = isSending ? 'sending' : 'idle'
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state }
  })()
  return props as ComposerProps & PlatformProps
}

function createComposerWords(t: Translate, isOnline: boolean, isSending: boolean) {
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



type ToolStep = { domain: string; access: string }

export interface ComposerState<Attempt, HabitsQuery = unknown, DetailQuery = unknown> extends Pick<ChatStoreState,
  'messages' | 'isTyping' | 'queuedPrompts' | 'queuePaused' | 'queueReady' | 'replyActive' |
  'streamingMessageId' | 'addMessage' | 'updateMessage' | 'appendToMessageContent' |
  'setIsTyping' | 'setStreamingMessageId' | 'draftHydrated' | 'hydrateDraft'> {
  profile: Profile | undefined
  queryClient: QueryClient
  allowanceText: Translate
  contextualSuggestion: ChatStoreState['contextualSuggestion']
  calendarHasError: boolean
  today: string
  surface: ComposerChipSurface
  habitsQuery: HabitsQuery
  detailQuery: DetailQuery
  input: string
  setInput: ChatStoreState['setDraft']
  stopReply: { current: (() => void) | null }
  pendingVoiceCommitRef: { current: boolean }
  threadScroll: ReturnType<typeof createChatThreadScroll>
  sendError: string | null
  setSendError: StateSetter<string | null>
  activeSteps: ToolStep[]
  setActiveSteps: StateSetter<ToolStep[]>
  activeStepsRef: { current: ToolStep[] }
  lastFailedSend: Attempt | null
  setLastFailedSend: StateSetter<Attempt | null>
  dailyBudgetDate: string | null
  setDailyBudgetDate: StateSetter<string | null>
  turnReconciliation: ChatTurnReconciliation
  blockSubmission: BlockAnswerSubmission
}

export function createComposerRuntime(): Pick<ComposerState<never>, 'stopReply' | 'pendingVoiceCommitRef' | 'threadScroll' | 'activeStepsRef' | 'turnReconciliation' | 'blockSubmission'> {
  return { stopReply: { current: null }, pendingVoiceCommitRef: { current: false }, threadScroll: createChatThreadScroll(),
    activeStepsRef: { current: [] }, turnReconciliation: new ChatTurnReconciliation(), blockSubmission: new BlockAnswerSubmission() }
}

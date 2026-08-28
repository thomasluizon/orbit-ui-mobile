'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { goalKeys, habitKeys, profileKeys, tagKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import {
  CHAT_STARTER_CHIP_KEYS,
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  consumeChatSseStream,
} from '@orbit/shared/chat'
import {
  buildAgentExecutionMessage,
  CHAT_DRAFT_STORAGE_KEY,
  classifySendFailure,
  findPremiumPolicyDenial,
  invalidateAgentQueries,
  selectActionInvalidations,
} from '@orbit/shared/hooks'
import {
  buildRecentChatHistory,
  canAccessEntitlement,
  detectDefaultTimeFormat,
  formatAccountMidnight,
  getFriendlyErrorMessage,
  resolveUpgradeEntitlementFromPolicyDenial,
} from '@orbit/shared/utils'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useChatStore } from '@/stores/chat-store'
import { useProfile } from '@/hooks/use-profile'
import { useChatImageAttachment } from '@/hooks/use-chat-image-attachment'
import { useChatPendingOperations } from '@/hooks/use-chat-pending-operations'

interface AttemptedSend {
  content: string
  image: File | null
  preview: string | null
}

interface StreamSendFailure {
  status: number | null
  error: string
  code: string | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

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

async function* streamTextChunks(
  body: ReadableStream<Uint8Array>,
  onActivity: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    let result = await reader.read()
    while (!result.done) {
      onActivity()
      yield decoder.decode(result.value, { stream: true })
      result = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Drives the chat composer: draft + speech input, image attachment, the SSE
 * streaming send pipeline, and pending-operation step-up flows. The streaming
 * send is the one sanctioned client-side `fetch` to the API (a Server Action
 * cannot return a streaming `ReadableStream`); see apps/web/CLAUDE.md.
 */
export function useChatComposer() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile } = useProfile()

  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const streamingMessageId = useChatStore((s) => s.streamingMessageId)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const appendToMessageContent = useChatStore((s) => s.appendToMessageContent)
  const setIsTyping = useChatStore((s) => s.setIsTyping)
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId)

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
  const pendingVoiceCommit = useRef(false)

  const [input, setInput] = useState<string>(() => {
    if (!('localStorage' in globalThis)) return ''
    // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- guarded by the `'localStorage' in globalThis` SSR check above (the repo's canonical guard, #490); never reads on the server; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    return globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY) ?? ''
  })
  const [sendError, setSendError] = useState<string | null>(null)
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null)
  const [previousSpeechError, setPreviousSpeechError] = useState<string | null>(speechError)

  const {
    fileInputRef,
    selectedImage,
    imagePreview,
    openFilePicker,
    handleFileSelect,
    handlePaste,
    removeImage,
    clearImage,
  } = useChatImageAttachment(setSendError)

  if (speechError !== previousSpeechError) {
    setPreviousSpeechError(speechError)
    if (speechError) {
      setSendError(speechError)
    }
  }

  const isOnline = useSyncExternalStore(
    subscribeToNetworkStatus,
    readNetworkStatus,
    readServerNetworkStatus,
  )

  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 20
  const accountTimeZone = profile?.timeZone ?? null
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit
  const isSending = isTyping || streamingMessageId !== null
  const canSend =
    (input.trim().length > 0 || selectedImage !== null) &&
    !isSending &&
    !atMessageLimit &&
    isOnline
  const showSuggestions = messages.length === 0 && !isTyping

  const starterChips = useMemo(
    () => CHAT_STARTER_CHIP_KEYS.map((key) => t(key)),
    [t],
  )

  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [recordingDuration])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = chatContainerRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const shouldRouteToUpgrade = useCallback(
    (resolution: { shouldUpgrade: boolean; requirement: 'pro' | 'yearlyPro' | null }) =>
      resolution.shouldUpgrade && !canAccessEntitlement(profile, resolution.requirement),
    [profile],
  )

  const appendExecutionMessage = useCallback(async (response: AgentExecuteOperationResponse) => {
    addMessage({
      id: crypto.randomUUID(),
      role: 'ai',
      content: buildAgentExecutionMessage(response, {
        done: t('chat.operationDone'),
        failed: t('chat.operationFailed'),
      }),
      operations: [response.operation],
      pendingOperations: response.pendingOperation ? [response.pendingOperation] : undefined,
      policyDenials: response.policyDenial ? [response.policyDenial] : undefined,
      timestamp: new Date(),
    })

    scrollToBottom()

    if (response.operation.status === 'Succeeded') {
      await invalidateAgentQueries(queryClient)
    }
    if (response.policyDenial) {
      const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(response.policyDenial)
      if (shouldRouteToUpgrade(upgradeResolution)) {
        setSendError(response.policyDenial.reason)
        router.push('/upgrade')
      }
    }
  }, [addMessage, queryClient, router, scrollToBottom, shouldRouteToUpgrade, t])

  const {
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = useChatPendingOperations(appendExecutionMessage)

  const handleFailedSend = useCallback((
    failureInput: StreamSendFailure,
    attempted: AttemptedSend,
    draftMessageId: string | null,
  ) => {
    setIsTyping(false)
    const resolvedError = failureInput.error.trim() || t('chat.sendError')
    const failure = classifySendFailure({
      status: failureInput.status,
      code: failureInput.code,
      reason: resolvedError,
    })

    if (failure.kind === 'upgrade' && shouldRouteToUpgrade(failure.upgrade)) {
      setSendError(t('chat.proGate.body'))
      router.push('/upgrade')
      return
    }

    if (failure.kind === 'timeout') {
      setSendError(t('chat.timeoutError'))
      setLastFailedSend(attempted)
    } else if (failure.kind === 'limit') {
      setSendError(t('chat.limitReachedError'))
    } else {
      setSendError(t('chat.sendError'))
      setLastFailedSend(attempted)
    }

    if (draftMessageId) {
      updateMessage(draftMessageId, { content: t('chat.aiError') })
    } else {
      addMessage({
        id: crypto.randomUUID(),
        role: 'ai',
        content: t('chat.aiError'),
        timestamp: new Date(),
      })
    }
    scrollToBottom()
  }, [addMessage, router, scrollToBottom, setIsTyping, shouldRouteToUpgrade, t, updateMessage])

  const applyFinalResponse = useCallback(async (response: ChatResponse, draftMessageId: string | null) => {
    setIsTyping(false)

    const finalFields = {
      content: response.aiMessage || '',
      actions: response.actions,
      operations: response.operations,
      pendingOperations: response.pendingOperations,
      policyDenials: response.policyDenials,
      correlationId: response.correlationId,
      relatedSurfaces: response.relatedSurfaces,
      habitList: response.habitList,
      goalList: response.goalList,
    }
    if (draftMessageId) {
      updateMessage(draftMessageId, finalFields)
    } else {
      addMessage({
        id: crypto.randomUUID(),
        role: 'ai',
        timestamp: new Date(),
        ...finalFields,
      })
    }
    if (useChatStore.getState().streamingMessageId === draftMessageId) {
      setStreamingMessageId(null)
    }

    scrollToBottom()

    const premiumDenial = findPremiumPolicyDenial(response.policyDenials)
    if (premiumDenial) {
      const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(premiumDenial)
      if (shouldRouteToUpgrade(upgradeResolution)) {
        router.push('/upgrade')
      }
    }

    if (!hasProAccess) {
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, aiMessagesUsed: old.aiMessagesUsed + 1 } : old,
      )
    }

    const invalidations = selectActionInvalidations(response.actions)
    if (invalidations.habits) {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    }
    if (invalidations.goals) {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    }
    if (invalidations.tags) {
      void queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    }

    if (response.operations?.some((operation) => operation.status === 'Succeeded')) {
      await invalidateAgentQueries(queryClient)
    }
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess aliases profile.hasProAccess and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [addMessage, hasProAccess, queryClient, router, scrollToBottom, setIsTyping, setStreamingMessageId, shouldRouteToUpgrade, updateMessage])

  useEffect(() => {
    const trimmedDraft = input.trim()
    if (!trimmedDraft) {
      globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
      return
    }
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input)
  }, [input])

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommit.current = true
    } else if (pendingVoiceCommit.current && transcript.trim()) {
      pendingVoiceCommit.current = false
      setInput((current) => (current ? `${current} ${transcript.trim()}` : transcript.trim()))
    }
  }, [isRecording, transcript])

  useEffect(() => {
    if (!speechError) return
    const timer = globalThis.setTimeout(() => {
      setSendError((current) => (current === speechError ? null : current))
    }, 4000)
    return () => globalThis.clearTimeout(timer)
  }, [speechError])

  const buildChatFormData = useCallback((attempted: AttemptedSend) => {
    const formData = new FormData()
    if (attempted.content) formData.append('message', attempted.content)
    if (attempted.image) formData.append('image', attempted.image)

    const recentHistory = buildRecentChatHistory(useChatStore.getState().messages)
    formData.append('history', JSON.stringify(recentHistory))
    formData.append('clientContext', JSON.stringify({
      platform: 'web',
      locale,
      timeFormat: detectDefaultTimeFormat(locale),
      currentAppArea: 'chat',
      supportsHabitListCard: true,
      supportsGoalListCard: true,
    }))
    return formData
  }, [locale])

  const runStreamingSend = useCallback(async (attempted: AttemptedSend) => {
    const controller = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const armIdleTimer = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS)
    }

    let draftMessageId: string | null = null
    const ensureDraftMessage = () => {
      if (draftMessageId) return draftMessageId
      draftMessageId = crypto.randomUUID()
      setStreamingMessageId(draftMessageId)
      setIsTyping(false)
      addMessage({ id: draftMessageId, role: 'ai', content: '', timestamp: new Date() })
      scrollToBottom()
      return draftMessageId
    }

    try {
      armIdleTimer()
      const response = await fetch(API.chat.stream, {
        method: 'POST',
        body: buildChatFormData(attempted),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const errorBody = (await response.json().catch(() => null)) as
          | { error?: string; errorCode?: string }
          | null
        handleFailedSend(
          {
            status: response.status,
            error: errorBody?.error ?? t('chat.sendError'),
            code: errorBody?.errorCode ?? null,
          },
          attempted,
          draftMessageId,
        )
        return
      }

      const outcome = await consumeChatSseStream(
        streamTextChunks(response.body, armIdleTimer),
        {
          onDelta: (text) => {
            appendToMessageContent(ensureDraftMessage(), text)
            scrollToBottom()
          },
          onReset: () => {
            if (draftMessageId) updateMessage(draftMessageId, { content: '' })
            setIsTyping(true)
          },
        },
      )

      if (outcome.kind === 'final') {
        await applyFinalResponse(outcome.response, draftMessageId)
        return
      }
      if (outcome.kind === 'error') {
        handleFailedSend(
          { status: outcome.status, error: outcome.error, code: outcome.code },
          attempted,
          draftMessageId,
        )
        return
      }
      handleFailedSend(
        { status: null, error: t('chat.sendError'), code: null },
        attempted,
        draftMessageId,
      )
    } catch (error: unknown) {
      handleFailedSend(
        {
          status: isAbortError(error) ? 408 : null,
          error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'),
          code: null,
        },
        attempted,
        draftMessageId,
      )
    } finally {
      clearTimeout(idleTimer)
      if (useChatStore.getState().streamingMessageId === draftMessageId) {
        setStreamingMessageId(null)
      }
    }
  }, [
    addMessage,
    appendToMessageContent,
    applyFinalResponse,
    buildChatFormData,
    handleFailedSend,
    scrollToBottom,
    setIsTyping,
    setStreamingMessageId,
    t,
    updateMessage,
  ])

  const performSend = useCallback(
    async (attempted: AttemptedSend, isRetry: boolean) => {
      setSendError(null)
      setLastFailedSend(null)

      if (!isRetry) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'user',
          content: attempted.content || '(image)',
          imageUrl: attempted.preview,
          timestamp: new Date(),
        })
      }

      scrollToBottom()
      setIsTyping(true)
      scrollToBottom()

      await runStreamingSend(attempted)
    },
    [addMessage, runStreamingSend, scrollToBottom, setIsTyping],
  )

  const sendMessage = useCallback(
    async (content?: string) => {
      const typedContent = content || input.trim()
      const sendState = useChatStore.getState()
      if (
        (!typedContent && !selectedImage) ||
        sendState.isTyping ||
        sendState.streamingMessageId !== null
      ) return

      const attempted: AttemptedSend = {
        content: typedContent,
        image: selectedImage,
        preview: imagePreview,
      }

      setInput('')
      clearImage()

      await performSend(attempted, false)
    },
    [
      clearImage,
      imagePreview,
      input,
      performSend,
      selectedImage,
    ],
  )

  const retryLastSend = useCallback(async () => {
    const sendState = useChatStore.getState()
    if (!lastFailedSend || sendState.isTyping || sendState.streamingMessageId !== null) return
    await performSend(lastFailedSend, true)
  }, [lastFailedSend, performSend])

  const canRetryLastSend = lastFailedSend !== null && !isSending

  const composerSuggestions = useMemo<ComposerSuggestions>(() => {
    const makeSuggestion = (key: (typeof CHAT_STARTER_CHIP_KEYS)[number]) => {
      const label = t(key)
      return { id: key, label, onSelect: () => void sendMessage(label) }
    }
    return [
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[0]),
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[1]),
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[2]),
      makeSuggestion(CHAT_STARTER_CHIP_KEYS[3]),
    ]
  }, [sendMessage, t])

  const composerProps = useMemo(() => {
    const words = {
      placeholder: t('shell.composer.placeholder'),
      send: t('shell.composer.send'),
      suggestionsLabel: t('shell.composer.suggestionsLabel'),
      retry: t('shell.composer.retry'),
    }
    const voiceWords = {
      start: t('shell.composer.voice.start'),
      stop: t('shell.composer.voice.stop'),
      recording: t('shell.composer.voice.recording'),
      transcribing: t('shell.composer.voice.transcribing'),
    }
    const common = {
      words,
      value: input,
      onChangeValue: setInput,
      onSend: () => void sendMessage(),
      onPaste: handlePaste,
      suggestions: composerSuggestions,
      onAttach: openFilePicker,
      attachWords: {
        add: t('shell.composer.attach.add'),
        trayLabel: t('shell.composer.attach.trayLabel'),
        remove: (name: string) => t('shell.composer.attach.remove', { name }),
      },
      attachments: selectedImage
        ? [{ id: 'chat-image', kind: 'image' as const, name: selectedImage.name }]
        : [],
      onAttachRemove: removeImage,
      ...(canRetryLastSend ? { onRetry: () => void retryLastSend() } : {}),
    }

    if (isRecording) return { ...common, state: 'recording', onVoice: toggleRecording, voiceWords }
    if (isTranscribing) return { ...common, state: 'transcribing', onVoice: toggleRecording, voiceWords }

    if (atMessageLimit) {
      const limitReason = accountTimeZone
        ? t('shell.composer.limit.reasonWithTime', {
            allowance: aiMessagesLimit,
            resetsAt: formatAccountMidnight(locale, accountTimeZone),
          })
        : t('shell.composer.limit.reasonAtMidnight', { allowance: aiMessagesLimit })
      return speechSupported
        ? { ...common, state: 'atLimit', limitReason, onVoice: toggleRecording, voiceWords }
        : { ...common, state: 'atLimit', limitReason }
    }

    const state: 'idle' | 'sending' = isSending || !isOnline ? 'sending' : 'idle'
    return speechSupported
      ? { ...common, state, onVoice: toggleRecording, voiceWords }
      : { ...common, state }
  }, [
    aiMessagesLimit,
    atMessageLimit,
    canRetryLastSend,
    composerSuggestions,
    input,
    handlePaste,
    isOnline,
    isRecording,
    isSending,
    isTranscribing,
    locale,
    openFilePicker,
    accountTimeZone,
    removeImage,
    retryLastSend,
    selectedImage,
    sendMessage,
    speechSupported,
    t,
    toggleRecording,
  ]) as ComposerProps & { onPaste: typeof handlePaste }

  function handleBreakdownConfirmed() {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }

  return {
    chatContainerRef,
    fileInputRef,
    input,
    setInput,
    sendError,
    selectedImage,
    imagePreview,
    isRecording,
    isTranscribing,
    speechSupported,
    transcript,
    speechError,
    toggleRecording,
    recordingTime,
    starterChips,
    messages,
    isTyping,
    isSending,
    streamingMessageId,
    hasProAccess,
    aiMessagesUsed,
    aiMessagesLimit,
    atMessageLimit,
    canSend,
    isOnline,
    showSuggestions,
    openFilePicker,
    handleFileSelect,
    removeImage,
    composerProps,
    sendMessage,
    retryLastSend,
    canRetryLastSend,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    scrollToBottom,
  }
}

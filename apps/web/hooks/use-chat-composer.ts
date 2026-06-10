'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { goalKeys, habitKeys, profileKeys, tagKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
} from '@orbit/shared/types/ai'
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_STARTER_CHIP_KEYS,
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  consumeChatSseStream,
  getChatImageValidationError,
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
  getErrorMessage,
  resolveUpgradeEntitlementFromPolicyDenial,
} from '@orbit/shared/utils'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useChatStore } from '@/stores/chat-store'
import { useProfile } from '@/hooks/use-profile'
import {
  confirmPendingOperation,
  executePendingOperation,
  issuePendingOperationStepUp,
  verifyPendingOperationStepUp,
} from '@/app/actions/chat'

type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string }

type PreparedStepUpExecution =
  | {
      ok: true
      challenge: AgentStepUpChallenge
      confirmationToken: string
    }
  | { ok: false; error: string }

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

async function* streamTextChunks(
  body: ReadableStream<Uint8Array>,
  onActivity: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      onActivity()
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

export function useChatComposer() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile } = useProfile()

  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const appendToMessageContent = useChatStore((s) => s.appendToMessageContent)
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

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const langPickerRef = useRef<HTMLDivElement>(null)
  const prevIsRecording = useRef(false)

  const [input, setInput] = useState<string>(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return ''
    return globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY) ?? ''
  })
  const [sendError, setSendError] = useState<string | null>(null)
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [previousSpeechError, setPreviousSpeechError] = useState<string | null>(speechError)

  if (speechError !== previousSpeechError) {
    setPreviousSpeechError(speechError)
    if (speechError) {
      setSendError(speechError)
    }
  }

  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 20
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit
  const canSend =
    (input.trim().length > 0 || selectedImage !== null) && !isTyping && !atMessageLimit
  const showSuggestions = messages.length === 0 && !isTyping

  const starterChips = useMemo(
    () => CHAT_STARTER_CHIP_KEYS.map((key) => t(key)),
    [t],
  )

  const currentLangFlag = useMemo(
    () => SPEECH_LANGUAGES.find((l) => l.value === speechLang)?.flag ?? '\u{1F310}',
    [speechLang],
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
      content: buildAgentExecutionMessage(response),
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
  }, [addMessage, queryClient, router, scrollToBottom, shouldRouteToUpgrade])

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
      setSendError(resolvedError)
      router.push('/upgrade')
      return
    }

    if (failure.kind === 'timeout') {
      setSendError(t('chat.timeoutError'))
      setLastFailedSend(attempted)
    } else if (failure.kind === 'limit') {
      setSendError(t('chat.limitReachedError'))
    } else {
      setSendError(resolvedError)
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

    scrollToBottom()

    const premiumDenial = findPremiumPolicyDenial(response.policyDenials)
    if (premiumDenial) {
      const upgradeResolution = resolveUpgradeEntitlementFromPolicyDenial(premiumDenial)
      setSendError(premiumDenial.reason)
      if (shouldRouteToUpgrade(upgradeResolution)) {
        router.push('/upgrade')
      }
    }

    if (!hasProAccess) {
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, aiMessagesUsed: (old.aiMessagesUsed ?? 0) + 1 } : old,
      )
    }

    const invalidations = selectActionInvalidations(response.actions)
    if (invalidations.habits) {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    }
    if (invalidations.goals) {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    }
    if (invalidations.tags) {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    }

    if (response.operations?.some((operation) => operation.status === 'Succeeded')) {
      await invalidateAgentQueries(queryClient)
    }
  }, [addMessage, hasProAccess, queryClient, router, scrollToBottom, setIsTyping, shouldRouteToUpgrade, updateMessage])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [input])


  useEffect(() => {
    if (globalThis.localStorage === undefined) return
    const trimmedDraft = input.trim()
    if (!trimmedDraft) {
      globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
      return
    }
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input)
  }, [input])

  useEffect(() => {
    if (prevIsRecording.current && !isRecording && transcript.trim()) {
      setInput((current) => (current ? `${current} ${transcript.trim()}` : transcript.trim()))
    }
    prevIsRecording.current = isRecording
  }, [isRecording, transcript])

  useEffect(() => {
    if (!speechError) return
    const timer = globalThis.setTimeout(() => {
      setSendError((current) => (current === speechError ? null : current))
    }, 4000)
    return () => globalThis.clearTimeout(timer)
  }, [speechError])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        langPickerRef.current &&
        !langPickerRef.current.contains(event.target as Node)
      ) {
        setShowLangPicker(false)
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  function validateImageFile(file: File): string | null {
    const validationError = getChatImageValidationError({
      mimeType: file.type,
      fileSize: file.size,
      name: file.name,
    })
    if (validationError === 'type') return t('chat.imageError')
    if (validationError === 'size') return t('chat.imageSizeError')
    return null
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const validationErr = validateImageFile(file)
    if (validationErr) {
      setSendError(validationErr)
      event.target.value = ''
      return
    }
    setSendError(null)
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
    event.target.value = ''
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(null)
    setImagePreview(null)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue

      event.preventDefault()

      const validationErr = validateImageFile(file)
      if (validationErr) {
        setSendError(validationErr)
        return
      }

      setSendError(null)
      setSelectedImage(file)
      setImagePreview(URL.createObjectURL(file))
      return
    }
  }

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
          error: getErrorMessage(error, t('chat.sendError')),
          code: null,
        },
        attempted,
        draftMessageId,
      )
    } finally {
      clearTimeout(idleTimer)
    }
  }, [
    addMessage,
    appendToMessageContent,
    applyFinalResponse,
    buildChatFormData,
    handleFailedSend,
    scrollToBottom,
    setIsTyping,
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
      const messageContent = content || input.trim()
      if ((!messageContent && !selectedImage) || isTyping) return

      const attempted: AttemptedSend = {
        content: messageContent,
        image: selectedImage,
        preview: imagePreview,
      }

      setInput('')
      setSelectedImage(null)
      setImagePreview(null)

      await performSend(attempted, false)
    },
    [imagePreview, input, isTyping, performSend, selectedImage],
  )

  const retryLastSend = useCallback(async () => {
    if (!lastFailedSend || isTyping) return
    await performSend(lastFailedSend, true)
  }, [isTyping, lastFailedSend, performSend])

  const canRetryLastSend = lastFailedSend !== null && !isTyping

  const confirmAndExecutePendingOperation = useCallback(async (pendingOperationId: string): Promise<PendingExecutionResult> => {
    const confirmation = await confirmPendingOperation(pendingOperationId)
    if (!confirmation.ok) {
      return { ok: false, error: getErrorMessage(confirmation.error, t('chat.sendError')) }
    }

    const execution = await executePendingOperation(
      pendingOperationId,
      confirmation.data.confirmationToken,
    )

    if (!execution.ok) {
      return { ok: false, error: getErrorMessage(execution.error, t('chat.sendError')) }
    }

    await appendExecutionMessage(execution.data)
    return { ok: true, response: execution.data }
  }, [appendExecutionMessage, t])

  const preparePendingOperationStepUp = useCallback(async (
    pendingOperationId: string,
  ): Promise<PreparedStepUpExecution> => {
    const confirmation = await confirmPendingOperation(pendingOperationId)
    if (!confirmation.ok) {
      return { ok: false, error: getErrorMessage(confirmation.error, t('chat.sendError')) }
    }

    const challenge = await issuePendingOperationStepUp(pendingOperationId, locale)
    if (!challenge.ok) {
      return { ok: false, error: getErrorMessage(challenge.error, t('chat.sendError')) }
    }

    return {
      ok: true,
      challenge: challenge.data,
      confirmationToken: confirmation.data.confirmationToken,
    }
  }, [locale, t])

  const verifyAndExecutePendingOperationStepUp = useCallback(async (
    pendingOperationId: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ): Promise<PendingExecutionResult> => {
    const verification = await verifyPendingOperationStepUp(
      pendingOperationId,
      challengeId,
      code,
    )

    if (!verification.ok) {
      return { ok: false, error: getErrorMessage(verification.error, t('chat.sendError')) }
    }

    const execution = await executePendingOperation(pendingOperationId, confirmationToken)
    if (!execution.ok) {
      return { ok: false, error: getErrorMessage(execution.error, t('chat.sendError')) }
    }

    await appendExecutionMessage(execution.data)
    return { ok: true, response: execution.data }
  }, [appendExecutionMessage, t])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  function handleBreakdownConfirmed() {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const result = await preparePendingOperationStepUp(pendingOperationId)
      if (!result.ok) {
        return { ok: false as const, error: result.error }
      }
      return {
        ok: true as const,
        challengeId: result.challenge.challengeId,
        confirmationToken: result.confirmationToken,
      }
    },
    [preparePendingOperationStepUp],
  )

  const verifyStepUpForBubble = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ) => {
      const result = await verifyAndExecutePendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        confirmationToken,
      )
      return result.ok
        ? { ok: true as const, response: result.response }
        : { ok: false as const, error: result.error }
    },
    [verifyAndExecutePendingOperationStepUp],
  )

  return {
    chatContainerRef,
    textareaRef,
    fileInputRef,
    langPickerRef,
    input,
    setInput,
    sendError,
    selectedImage,
    imagePreview,
    isRecording,
    speechSupported,
    transcript,
    speechError,
    speechLang,
    setSpeechLang,
    toggleRecording,
    recordingTime,
    currentLangFlag,
    showLangPicker,
    setShowLangPicker,
    starterChips,
    messages,
    isTyping,
    hasProAccess,
    aiMessagesUsed,
    aiMessagesLimit,
    atMessageLimit,
    canSend,
    showSuggestions,
    openFilePicker,
    handleFileSelect,
    handlePaste,
    removeImage,
    sendMessage,
    retryLastSend,
    canRetryLastSend,
    handleKeyDown,
    handleBreakdownConfirmed,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    scrollToBottom,
  }
}

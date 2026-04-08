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
import { useTranslations } from 'next-intl'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_STARTER_CHIP_KEYS,
  getChatImageValidationError,
} from '@orbit/shared/chat'
import { buildRecentChatHistory, getErrorMessage } from '@orbit/shared/utils'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useChatStore } from '@/stores/chat-store'
import { useProfile } from '@/hooks/use-profile'
import { sendChatMessage } from '@/app/actions/chat'

export function useChatComposer() {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const { profile } = useProfile()

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

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const langPickerRef = useRef<HTMLDivElement>(null)
  const prevIsRecording = useRef(false)

  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showLangPicker, setShowLangPicker] = useState(false)

  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 10
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

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [input])

  useEffect(() => {
    function handleKeydown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        window.location.assign('/')
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [])

  useEffect(() => {
    if (prevIsRecording.current && !isRecording && transcript.trim()) {
      setInput((current) => (current ? `${current} ${transcript.trim()}` : transcript.trim()))
    }
    prevIsRecording.current = isRecording
  }, [isRecording, transcript])

  useEffect(() => {
    if (!speechError) return

    setSendError(speechError)
    const timer = window.setTimeout(() => {
      setSendError((current) => (current === speechError ? null : current))
    }, 4000)
    return () => window.clearTimeout(timer)
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

  const sendMessage = useCallback(
    async (content?: string) => {
      const messageContent = content || input.trim()
      if ((!messageContent && !selectedImage) || isTyping) return

      setSendError(null)

      const attachedImage = selectedImage
      const attachedPreview = imagePreview

      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: messageContent || '(image)',
        imageUrl: attachedPreview,
        timestamp: new Date(),
      })

      setInput('')
      setSelectedImage(null)
      setImagePreview(null)

      scrollToBottom()
      setIsTyping(true)
      scrollToBottom()

      try {
        const formData = new FormData()
        if (messageContent) formData.append('message', messageContent)
        if (attachedImage) formData.append('image', attachedImage)

        const currentMessages = useChatStore.getState().messages
        const recentHistory = buildRecentChatHistory(currentMessages)
        formData.append('history', JSON.stringify(recentHistory))

        const result = await sendChatMessage(formData)

        if (!result.ok) {
          setIsTyping(false)

          if (result.status === 408) {
            setSendError(t('chat.timeoutError'))
          } else if (result.status === 403) {
            setSendError(t('chat.limitReachedError'))
          } else {
            setSendError(getErrorMessage(result.error, t('chat.sendError')))
          }

          addMessage({
            id: crypto.randomUUID(),
            role: 'ai',
            content: t('chat.aiError'),
            timestamp: new Date(),
          })
          scrollToBottom()
          return
        }

        setIsTyping(false)

        addMessage({
          id: crypto.randomUUID(),
          role: 'ai',
          content: result.data.aiMessage || '',
          actions: result.data.actions,
          timestamp: new Date(),
        })

        scrollToBottom()

        if (!hasProAccess) {
          queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
            old ? { ...old, aiMessagesUsed: (old.aiMessagesUsed ?? 0) + 1 } : old,
          )
        }

        if (result.data.actions?.some((action) => action.status === 'Success')) {
          queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
        }
      } catch (error: unknown) {
        setIsTyping(false)
        setSendError(getErrorMessage(error, t('chat.sendError')))

        addMessage({
          id: crypto.randomUUID(),
          role: 'ai',
          content: t('chat.aiError'),
          timestamp: new Date(),
        })
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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  function handleBreakdownConfirmed() {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }

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
    handleKeyDown,
    handleBreakdownConfirmed,
    scrollToBottom,
  }
}

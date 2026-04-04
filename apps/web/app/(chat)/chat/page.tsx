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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Sparkles,
  Mic,
  Square,
  SendHorizontal,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { getErrorMessage } from '@orbit/shared/utils'
import { useChatStore } from '@/stores/chat-store'
import { useProfile } from '@/hooks/use-profile'
import { sendChatMessage } from '@/app/actions/chat'
import { MessageBubble } from '@/components/chat/message-bubble'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { TypingIndicator } from '@/components/chat/typing-indicator'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const STARTER_CHIP_KEYS = [
  'chat.starterChips.logHabit',
  'chat.starterChips.createRoutine',
  'chat.starterChips.howAmIDoing',
  'chat.starterChips.planWeek',
] as const

// ---------------------------------------------------------------------------
// Chat Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile } = useProfile()

  // Store
  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const addMessage = useChatStore((s) => s.addMessage)
  const setIsTyping = useChatStore((s) => s.setIsTyping)

  // Local state
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Derived
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 10
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit
  const canSend =
    (input.trim().length > 0 || selectedImage !== null) && !isTyping && !atMessageLimit
  const showSuggestions = messages.length === 0 && !isTyping

  // Translated starter chips
  const starterChips = useMemo(
    () => STARTER_CHIP_KEYS.map((key) => t(key)),
    [t],
  )

  // -------------------------------------------------------------------------
  // Scroll to bottom
  // -------------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = chatContainerRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  // -------------------------------------------------------------------------
  // Auto-resize textarea
  // -------------------------------------------------------------------------

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [input])

  // -------------------------------------------------------------------------
  // Escape key -> navigate back
  // -------------------------------------------------------------------------

  useEffect(() => {
    function handleKeydown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') router.push('/')
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [router])

  // -------------------------------------------------------------------------
  // Image handling
  // -------------------------------------------------------------------------

  function validateImageFile(file: File): string | null {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return t('chat.imageError')
    if (file.size > MAX_IMAGE_SIZE) return t('chat.imageSizeError')
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

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

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
        const recentHistory = currentMessages
          .slice(-11, -1)
          .map((m) => ({ role: m.role, content: m.content }))
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

        // Increment AI messages used counter (optimistic cache update)
        if (!hasProAccess) {
          queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
            old ? { ...old, aiMessagesUsed: (old.aiMessagesUsed ?? 0) + 1 } : old,
          )
        }

        if (result.data.actions?.some((a) => a.status === 'Success')) {
          queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
        }
      } catch (err: unknown) {
        setIsTyping(false)
        setSendError(getErrorMessage(err, t('chat.sendError')))

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
      input,
      selectedImage,
      imagePreview,
      isTyping,
      hasProAccess,
      addMessage,
      setIsTyping,
      scrollToBottom,
      queryClient,
      t,
    ],
  )

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleBreakdownConfirmed() {
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="shrink-0 chat-glass flex items-center pt-3 pb-3 z-10">
        <Link
          href="/"
          aria-label={t('common.goBack')}
          className="size-9 rounded-full hover:bg-surface-elevated flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="size-4 text-text-primary" />
        </Link>
        <h1 className="flex-1 text-center text-[length:var(--text-fluid-lg)] font-bold text-text-primary pr-10">
          {t('chat.title')}
        </h1>
      </header>

      {/* Messages area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-6 pb-4">
        {/* Empty state with suggestions */}
        {showSuggestions && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="relative flex items-center justify-center size-16">
              {/* Rotating gradient ring */}
              <div className="absolute inset-0 rounded-full animate-spin-slow orbit-ring" />
              {/* Glow */}
              <div className="absolute inset-0 rounded-full bg-primary/15 blur-md" />
              {/* Icon */}
              <Sparkles className="size-7 text-primary animate-orbit-pulse relative" />
            </div>
            <p className="text-text-secondary text-sm">{t('chat.suggestion.prompt')}</p>
            <SuggestionChips onSelect={(s) => sendMessage(s)} />
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onBreakdownConfirmed={handleBreakdownConfirmed}
          />
        ))}

        {/* Typing indicator */}
        {isTyping && <TypingIndicator />}
      </div>

      {/* Bottom input area */}
      <div className="shrink-0 chat-glass border-t border-border-muted">
        <div className="pt-3 pb-[calc(1rem+var(--safe-bottom))]">
          {/* Error banner */}
          {sendError && (
            <div className="text-sm text-red-400 pb-2 text-center">
              {sendError}
            </div>
          )}

          {/* Image preview */}
          {imagePreview && (
            <div className="pb-2">
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt=""
                  className="h-16 rounded-[var(--radius-lg)] border border-border-muted"
                />
                <button
                  aria-label={t('chat.removeImage')}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-surface-elevated border border-border p-0.5"
                  onClick={removeImage}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Starter chips */}
          {messages.length > 0 && (
            <div className="pb-3 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {starterChips.map((chip) => (
                  <button
                    key={chip}
                    className="px-4 py-1.5 rounded-full text-[11px] font-medium bg-surface-elevated border border-border/50 text-text-primary hover:bg-surface transition-colors whitespace-nowrap"
                    onClick={() => sendMessage(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Input bar */}
          <div className="bg-surface-elevated rounded-[var(--radius-lg)] border border-border-muted flex items-center gap-2 px-3 py-2">
            <button
              aria-label={t('chat.attachImage')}
              className="shrink-0 p-1 text-text-muted hover:text-text-primary transition-colors"
              onClick={openFilePicker}
            >
              <ImageIcon className="size-[15px]" />
            </button>
            <button
              aria-label={t('chat.toggleMic')}
              className="shrink-0 p-1 text-text-muted hover:text-text-primary transition-colors"
              disabled={isTyping}
              onClick={() => {
                // Voice input placeholder
              }}
            >
              <Mic className="size-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              className="flex-1 resize-none bg-transparent text-text-primary placeholder-text-muted text-sm py-2 px-3 focus:outline-none min-h-[36px] max-h-[120px]"
              rows={1}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
            <button
              disabled={!canSend}
              aria-label={t('chat.send')}
              className="shrink-0 flex items-center justify-center bg-primary rounded-[var(--radius-xl)] p-2 text-white transition-all active:scale-95 disabled:opacity-40 shadow-[var(--shadow-glow-sm)]"
              onClick={() => sendMessage()}
            >
              <SendHorizontal className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* Message limit indicators */}
          {!hasProAccess && atMessageLimit && (
            <div className="text-center pt-2 space-y-1.5">
              <p className="text-[10px] text-amber-400 font-medium">
                {t('chat.limitReachedError')}
              </p>
            </div>
          )}
          {!hasProAccess && !atMessageLimit && (
            <p className="text-[10px] text-text-muted text-center pt-2">
              {aiMessagesUsed}/{aiMessagesLimit} {t('chat.messagesUsed')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

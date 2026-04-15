import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useChatStore } from '@/stores/chat-store'

const CHAT_DRAFT_STORAGE_KEY = 'orbit-chat-draft'

/**
 * Mobile parity port of `apps/web/hooks/use-chat-composer.ts`.
 *
 * The web hook is a 600-line orchestrator that owns chat input state,
 * speech-to-text, image attachment, draft persistence to localStorage,
 * server-action dispatch, and TanStack Query cache invalidation. On
 * mobile most of those concerns are already wired inline in
 * `app/chat.tsx`, with platform-specific implementations
 * (expo-speech, expo-image-picker, AsyncStorage, direct API calls).
 *
 * This hook exposes the **subset** of composer state that is
 * platform-agnostic — input text + draft persistence — so call sites
 * that need composer state outside of `app/chat.tsx` (e.g. action
 * chips, voice composer drawer) can share it. Draft writes are
 * debounced 300ms (PLAN.md performance P1) to avoid main-thread
 * contention on every keystroke.
 *
 * The full agentic flow (sendChatMessage, pending-op confirmation,
 * step-up, mutation result handling) lives in `app/chat.tsx` because
 * it consumes the platform-specific transports (direct API calls
 * with SecureStore JWT instead of the web's Server Actions).
 */
export function useChatComposer() {
  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const [input, setInput] = useState('')
  const draftWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate draft on mount.
  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored) setInput(stored)
      })
      .catch(() => {
        // Storage failures are non-fatal — start with empty draft.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced draft persistence — 300ms after the last keystroke.
  // Stops the previous behavior of writing AsyncStorage on every char.
  useEffect(() => {
    if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current)
    draftWriteTimer.current = setTimeout(() => {
      AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input).catch(() => {
        // Persistence failures are non-fatal.
      })
    }, 300)

    return () => {
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current)
    }
  }, [input])

  const clearDraft = useCallback(() => {
    setInput('')
    AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY).catch(() => {})
  }, [])

  return {
    messages,
    isTyping,
    input,
    setInput,
    clearDraft,
  }
}

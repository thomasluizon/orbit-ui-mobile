'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_EMOJI_RECENTS_LIMIT,
  EMOJI_RECENTS_STORAGE_KEY,
  addRecent,
  parseRecents,
  removeRecent,
  stringifyRecents,
} from '@orbit/shared/utils/emoji-recents'

function readFromStorage(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return parseRecents(window.localStorage.getItem(EMOJI_RECENTS_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeToStorage(next: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EMOJI_RECENTS_STORAGE_KEY, stringifyRecents(next))
  } catch {
    // Storage quota / privacy mode -- fail silently; recents only aid UX
  }
}

/**
 * localStorage-backed recents list for the emoji picker. Returns an
 * immutable `recents` array plus `addEmoji` / `removeEmoji` helpers that
 * persist back to storage. Safe to use in SSR (no-ops until hydrated).
 */
export function useEmojiRecents(limit: number = DEFAULT_EMOJI_RECENTS_LIMIT) {
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    setRecents(readFromStorage())
  }, [])

  const addEmoji = useCallback(
    (emoji: string) => {
      setRecents((prev) => {
        const next = addRecent(prev, emoji, limit)
        writeToStorage(next)
        return next
      })
    },
    [limit],
  )

  const removeEmoji = useCallback((emoji: string) => {
    setRecents((prev) => {
      const next = removeRecent(prev, emoji)
      if (next === prev) return prev
      writeToStorage(next)
      return next
    })
  }, [])

  return { recents, addEmoji, removeEmoji }
}

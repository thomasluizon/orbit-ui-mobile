import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  DEFAULT_EMOJI_RECENTS_LIMIT,
  EMOJI_RECENTS_STORAGE_KEY,
  addRecent,
  parseRecents,
  removeRecent,
  stringifyRecents,
} from '@orbit/shared/utils/emoji-recents'

/**
 * AsyncStorage-backed recents list for the emoji picker on mobile. Mirrors
 * useEmojiRecents on web -- exposes immutable `recents` plus `addEmoji` and
 * `removeEmoji` helpers that persist back to storage.
 */
export function useEmojiRecents(limit: number = DEFAULT_EMOJI_RECENTS_LIMIT) {
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(EMOJI_RECENTS_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return
        setRecents(parseRecents(raw))
      })
      .catch(() => {
        if (cancelled) return
        setRecents([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const addEmoji = useCallback(
    (emoji: string) => {
      setRecents((prev) => {
        const next = addRecent(prev, emoji, limit)
        AsyncStorage.setItem(EMOJI_RECENTS_STORAGE_KEY, stringifyRecents(next)).catch(() => {
          /* ignore persistence failures -- recents only aid UX */
        })
        return next
      })
    },
    [limit],
  )

  const removeEmoji = useCallback((emoji: string) => {
    setRecents((prev) => {
      const next = removeRecent(prev, emoji)
      if (next === prev) return prev
      AsyncStorage.setItem(EMOJI_RECENTS_STORAGE_KEY, stringifyRecents(next)).catch(() => {
        /* ignore */
      })
      return next
    })
  }, [])

  return { recents, addEmoji, removeEmoji }
}

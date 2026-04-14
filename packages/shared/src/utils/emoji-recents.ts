/**
 * Pure, platform-agnostic helpers for managing the user's recent emoji list.
 * Storage adapters (localStorage on web, AsyncStorage on mobile) inject the
 * raw JSON string; these functions only do parsing, merging, and serialization.
 */

export const DEFAULT_EMOJI_RECENTS_LIMIT = 24
export const EMOJI_RECENTS_STORAGE_KEY = 'orbit.emojiRecents'
export const EMOJI_SKIN_TONE_STORAGE_KEY = 'orbit.emojiSkinTone'

/**
 * Parses a JSON string previously produced by stringifyRecents. Returns a
 * deduplicated array of string emojis. Any non-string values, empty strings,
 * or malformed JSON silently collapse to an empty list.
 */
export function parseRecents(raw: string | null | undefined): string[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/**
 * Serialize a recents list for storage.
 */
export function stringifyRecents(recents: string[]): string {
  return JSON.stringify(recents)
}

/**
 * Adds an emoji to the front of the recents list. Existing occurrences are
 * removed so the emoji always lands at index 0. Respects the limit by trimming
 * the tail.
 */
export function addRecent(
  existing: string[],
  emoji: string,
  limit = DEFAULT_EMOJI_RECENTS_LIMIT,
): string[] {
  const trimmed = emoji.trim()
  if (!trimmed) return existing
  const next = [trimmed, ...existing.filter((e) => e !== trimmed)]
  if (next.length > limit) next.length = limit
  return next
}

/**
 * Removes an emoji from the recents list. Returns the same reference when the
 * emoji is not present to avoid unnecessary state churn.
 */
export function removeRecent(existing: string[], emoji: string): string[] {
  const trimmed = emoji.trim()
  if (!trimmed) return existing
  if (!existing.includes(trimmed)) return existing
  return existing.filter((e) => e !== trimmed)
}

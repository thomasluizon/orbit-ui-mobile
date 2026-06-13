export interface HighlightSegment {
  text: string
  isMatch: boolean
}

/**
 * Splits text into match/non-match segments for search highlighting using
 * case-insensitive indexOf scanning, so repeated matches are all captured
 * without regex `g`-flag `lastIndex` state.
 */
export function highlightText(text: string, query: string): HighlightSegment[] {
  if (!query || !text) return [{ text: text || '', isMatch: false }]

  const segments: HighlightSegment[] = []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase().trim()

  if (!lowerQuery) return [{ text, isMatch: false }]

  let pos = 0
  let idx = lowerText.indexOf(lowerQuery, pos)

  while (idx !== -1) {
    if (idx > pos) {
      segments.push({ text: text.slice(pos, idx), isMatch: false })
    }
    segments.push({ text: text.slice(idx, idx + lowerQuery.length), isMatch: true })
    pos = idx + lowerQuery.length
    idx = lowerText.indexOf(lowerQuery, pos)
  }

  if (pos < text.length) {
    segments.push({ text: text.slice(pos), isMatch: false })
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }]
}

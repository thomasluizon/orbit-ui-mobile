interface HighlightTextProps {
  text: string
  query: string
}

interface Segment {
  text: string
  isMatch: boolean
}

/**
 * indexOf-based highlight matching (port of Nuxt utils/highlight.ts).
 * Avoids the stateful `lastIndex` bug from using regex.test() with the `g` flag.
 */
function highlightText(text: string, query: string): Segment[] {
  if (!query || !text) return [{ text: text || '', isMatch: false }]

  const segments: Segment[] = []
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

export function HighlightText({ text, query }: HighlightTextProps) {
  const segments = highlightText(text, query)

  return (
    <>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <mark key={i} className="bg-primary/30 text-inherit rounded-sm px-0.5 transition-all duration-150">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}

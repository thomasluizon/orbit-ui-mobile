import { Text, type TextStyle } from 'react-native'
import { colors } from '@/lib/theme'

interface HighlightTextProps {
  text: string
  query: string
  style?: TextStyle
}

interface Segment {
  text: string
  isMatch: boolean
}

/**
 * indexOf-based highlight matching (port of web utils/highlight.ts).
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

export function HighlightText({ text, query, style }: Readonly<HighlightTextProps>) {
  const segments = highlightText(text, query)

  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <Text
            key={`segment-${i}-${seg.text}`}
            style={{
              backgroundColor: colors.primary_30,
              borderRadius: 2,
              paddingHorizontal: 1,
            }}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={`segment-${i}-${seg.text}`}>{seg.text}</Text>
        ),
      )}
    </Text>
  )
}

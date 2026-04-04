interface HighlightTextProps {
  text: string
  query: string
}

interface Segment {
  text: string
  isMatch: boolean
}

function highlightText(text: string, query: string): Segment[] {
  if (!query || !query.trim()) {
    return [{ text, isMatch: false }]
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts
    .filter(Boolean)
    .map((part) => ({
      text: part,
      isMatch: regex.test(part) || part.toLowerCase() === query.toLowerCase(),
    }))
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

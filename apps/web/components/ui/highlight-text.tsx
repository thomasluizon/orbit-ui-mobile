import { highlightText } from '@orbit/shared/utils'

interface HighlightTextProps {
  text: string
  query: string
}

export function HighlightText({ text, query }: Readonly<HighlightTextProps>) {
  const segments = highlightText(text, query)

  return (
    <>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <mark key={`segment-${i}-${seg.text}`} className="bg-[rgba(var(--primary-rgb),0.18)] text-[var(--fg-1)] rounded-sm px-0.5 transition-colors duration-150">
            {seg.text}
          </mark>
        ) : (
          <span key={`segment-${i}-${seg.text}`}>{seg.text}</span>
        )
      )}
    </>
  )
}

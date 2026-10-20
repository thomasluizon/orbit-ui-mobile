export function measureTitleWords(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const splitWords: string[] = []
  const visibleLines = new Set<number>()
  let node = walker.nextNode()
  while (node) {
    for (const match of (node.textContent ?? '').matchAll(/\S+/gu)) {
      const range = document.createRange()
      range.setStart(node, match.index)
      range.setEnd(node, match.index + match[0].length)
      const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
      const lines = new Set(fragments.map((rect) => Math.round(rect.top)))
      if (lines.size > 1) splitWords.push(match[0])
      for (const rect of fragments) {
        if (rect.top < bounds.bottom && rect.bottom > bounds.top) visibleLines.add(Math.round(rect.top))
      }
    }
    node = walker.nextNode()
  }
  const style = getComputedStyle(element)
  return {
    splitWords,
    visibleLines: visibleLines.size,
    height: bounds.height,
    lineHeight: Number.parseFloat(style.lineHeight),
    overflowWrap: style.overflowWrap,
    overflow: style.overflow,
    textOverflow: style.textOverflow,
    lineClamp: style.webkitLineClamp,
    text: element.textContent,
  }
}

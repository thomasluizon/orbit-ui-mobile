export function measureSplitSegmentWords(): string[] {
  return [...document.querySelectorAll('[role="radiogroup"] [role="radio"] > span')].flatMap((label) => {
    const text = label.firstChild!
    return [...text.textContent!.matchAll(/\S+/g)].filter((word) => {
      const range = document.createRange()
      range.setStart(text, word.index)
      range.setEnd(text, word.index + word[0].length)
      return new Set([...range.getClientRects()].map((fragment) => Math.round(fragment.top))).size > 1
    }).map((word) => word[0])
  })
}

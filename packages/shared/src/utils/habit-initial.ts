function isContinuation(codePoint: number): boolean {
  return (codePoint >= 0x300 && codePoint <= 0x36f)
    || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
    || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
    || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe2f)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff
}

/** First visible character of a habit title, including joined emoji and combining marks. */
export function habitInitial(title: string): string {
  const symbols = Array.from(title.trim())
  if (symbols.length === 0) return ''
  let end = 1
  if (symbols[1] && isRegionalIndicator(symbols[0]!.codePointAt(0)!) && isRegionalIndicator(symbols[1].codePointAt(0)!)) end = 2
  while (end < symbols.length) {
    const next = symbols[end]!.codePointAt(0)!
    if (isContinuation(next)) end += 1
    else if (next === 0x200d && end + 1 < symbols.length) end += 2
    else break
  }
  return symbols.slice(0, end).join('').toLocaleUpperCase()
}

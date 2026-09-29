const MARK = /\p{Mark}/u
const LETTER = /\p{Letter}/u
const INDIC_LINKERS = new Set([
  0x094d, 0x09cd, 0x0acd, 0x0b4d, 0x0c4d, 0x0d4d, 0x1039, 0x17d2,
  0x1a60, 0x1b44, 0x1bab, 0x1cf5, 0x1cf6, 0xa9c0, 0xaaf6, 0x10a3f,
  0x11133, 0x113d0, 0x1193e, 0x11a3a, 0x11a47, 0x11a99, 0x11f42,
])

function isContinuation(symbol: string, codePoint: number): boolean {
  return MARK.test(symbol) || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff
}

/** First visible character of a habit title, including joined emoji and combining marks. */
export function habitInitial(title: string): string {
  const symbols = Array.from(title.trim())
  if (symbols.length === 0) return ''
  let end = 1
  let afterIndicLinker = false
  if (symbols[1] && isRegionalIndicator(symbols[0]!.codePointAt(0)!) && isRegionalIndicator(symbols[1].codePointAt(0)!)) end = 2
  while (end < symbols.length) {
    const symbol = symbols[end]!
    const next = symbol.codePointAt(0)!
    if (isContinuation(symbol, next) || INDIC_LINKERS.has(next)) {
      if (INDIC_LINKERS.has(next)) afterIndicLinker = true
      end += 1
    } else if (next === 0x200d && end + 1 < symbols.length) {
      afterIndicLinker = false
      end += 2
    }
    else if (afterIndicLinker && LETTER.test(symbol)) {
      afterIndicLinker = false
      end += 1
    }
    else break
  }
  return symbols.slice(0, end).join('').toLocaleUpperCase()
}

const MARK = /\p{Mark}/u
const PICTOGRAPH = /\p{Extended_Pictographic}/u
const INDIC_CONSONANT = new RegExp(
  String.raw`[\u{0915}-\u{0939}\u{0958}-\u{095f}\u{0978}-\u{097f}\u{0995}-\u{09a8}\u{09aa}-\u{09b0}\u{09b2}\u{09b6}-\u{09b9}\u{09dc}-\u{09dd}`
    + String.raw`\u{09df}\u{09f0}-\u{09f1}\u{0a95}-\u{0aa8}\u{0aaa}-\u{0ab0}\u{0ab2}-\u{0ab3}\u{0ab5}-\u{0ab9}\u{0af9}\u{0b15}-\u{0b28}`
    + String.raw`\u{0b2a}-\u{0b30}\u{0b32}-\u{0b33}\u{0b35}-\u{0b39}\u{0b5c}-\u{0b5d}\u{0b5f}\u{0b71}\u{0c15}-\u{0c28}\u{0c2a}-\u{0c39}`
    + String.raw`\u{0c58}-\u{0c5a}\u{0d15}-\u{0d3a}\u{1000}-\u{102a}\u{103f}\u{1050}-\u{1055}\u{105a}-\u{105d}\u{1061}\u{1065}-\u{1066}`
    + String.raw`\u{106e}-\u{1070}\u{1075}-\u{1081}\u{108e}\u{1780}-\u{17b3}\u{1a20}-\u{1a54}\u{1b0b}-\u{1b0c}\u{1b13}-\u{1b33}\u{1b45}-\u{1b4c}`
    + String.raw`\u{1b83}-\u{1ba0}\u{1bae}-\u{1baf}\u{1bbb}-\u{1bbd}\u{a989}-\u{a98b}\u{a98f}-\u{a9b2}\u{a9e0}-\u{a9e4}\u{a9e7}-\u{a9ef}\u{a9fa}-\u{a9fe}`
    + String.raw`\u{aa60}-\u{aa6f}\u{aa71}-\u{aa73}\u{aa7a}\u{aa7e}-\u{aa7f}\u{aae0}-\u{aaea}\u{abc0}-\u{abda}\u{10a00}\u{10a10}-\u{10a13}`
    + String.raw`\u{10a15}-\u{10a17}\u{10a19}-\u{10a35}\u{11103}-\u{11126}\u{11144}\u{11147}\u{11380}-\u{11389}\u{1138b}\u{1138e}`
    + String.raw`\u{11390}-\u{113b5}\u{11900}-\u{11906}\u{11909}\u{1190c}-\u{11913}\u{11915}-\u{11916}\u{11918}-\u{1192f}\u{11a00}\u{11a0b}-\u{11a32}`
    + String.raw`\u{11a50}\u{11a5c}-\u{11a83}\u{11b0a}\u{11df1}\u{11f04}-\u{11f10}\u{11f12}-\u{11f33}]`,
  'u',
)
const INDIC_LINKERS = new Set([
  0x094d, 0x09cd, 0x0acd, 0x0b4d, 0x0c4d, 0x0d4d, 0x1039, 0x17d2,
  0x1a60, 0x1b44, 0x1bab, 0x1cf5, 0x1cf6, 0xa9c0, 0xaaf6, 0x10a3f,
  0x11133, 0x113d0, 0x1193e, 0x11a3a, 0x11a47, 0x11a99, 0x11f42,
])

const ZERO_WIDTH_NON_JOINER = 0x200c

function isContinuation(symbol: string, codePoint: number): boolean {
  return MARK.test(symbol)
    || codePoint === ZERO_WIDTH_NON_JOINER
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || codePoint === 0xff9e || codePoint === 0xff9f
}

function isPrepend(codePoint: number): boolean {
  return (codePoint >= 0x0600 && codePoint <= 0x0605)
    || codePoint === 0x06dd || codePoint === 0x070f
    || (codePoint >= 0x0890 && codePoint <= 0x0891)
    || codePoint === 0x08e2 || codePoint === 0x0d4e
    || codePoint === 0x110bd || codePoint === 0x110cd
    || (codePoint >= 0x111c2 && codePoint <= 0x111c3)
    || codePoint === 0x113d1 || codePoint === 0x1193f || codePoint === 0x11941
    || (codePoint >= 0x11a84 && codePoint <= 0x11a89)
    || codePoint === 0x11d46 || codePoint === 0x11f02
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff
}

function hangulClass(codePoint: number): 'L' | 'V' | 'T' | 'LV' | 'LVT' | null {
  if ((codePoint >= 0x1100 && codePoint <= 0x115f) || (codePoint >= 0xa960 && codePoint <= 0xa97c)) return 'L'
  if ((codePoint >= 0x1160 && codePoint <= 0x11a7) || (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)) return 'V'
  if ((codePoint >= 0x11a8 && codePoint <= 0x11ff) || (codePoint >= 0xd7cb && codePoint <= 0xd7fb)) return 'T'
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) return (codePoint - 0xac00) % 28 === 0 ? 'LV' : 'LVT'
  return null
}

function joinsHangul(left: number, right: number): boolean {
  const before = hangulClass(left)
  const after = hangulClass(right)
  return (before === 'L' && (after === 'L' || after === 'V' || after === 'LV' || after === 'LVT'))
    || ((before === 'LV' || before === 'V') && (after === 'V' || after === 'T'))
    || ((before === 'LVT' || before === 'T') && after === 'T')
}

interface GraphemeCursor {
  end: number
  afterIndicLinker: boolean
  afterPictograph: boolean
}

function firstCursor(symbols: string[]): GraphemeCursor {
  let end = 1
  if (isPrepend(symbols[0]!.codePointAt(0)!)) {
    while (end < symbols.length && isPrepend(symbols[end]!.codePointAt(0)!)) end += 1
    if (end < symbols.length) end += 1
  }
  if (symbols[end] && isRegionalIndicator(symbols[end - 1]!.codePointAt(0)!) && isRegionalIndicator(symbols[end]!.codePointAt(0)!)) end += 1
  return { end, afterIndicLinker: false, afterPictograph: PICTOGRAPH.test(symbols[end - 1]!) }
}

function advanceJoiner(symbols: string[], cursor: GraphemeCursor): GraphemeCursor {
  const following = symbols[cursor.end + 1]
  const joinsIndic = !!following && cursor.afterIndicLinker && INDIC_CONSONANT.test(following)
  const joinsEmoji = !!following && cursor.afterPictograph && PICTOGRAPH.test(following)
  return {
    end: cursor.end + (joinsIndic || joinsEmoji ? 2 : 1),
    afterIndicLinker: false,
    afterPictograph: joinsEmoji,
  }
}

function advanceCluster(symbols: string[], cursor: GraphemeCursor): GraphemeCursor | null {
  const symbol = symbols[cursor.end]
  if (!symbol) return null
  const codePoint = symbol.codePointAt(0)!
  if (joinsHangul(symbols[cursor.end - 1]!.codePointAt(0)!, codePoint)) return { ...cursor, end: cursor.end + 1 }
  if (isContinuation(symbol, codePoint) || INDIC_LINKERS.has(codePoint)) {
    const afterIndicLinker = codePoint !== ZERO_WIDTH_NON_JOINER && (cursor.afterIndicLinker || INDIC_LINKERS.has(codePoint))
    return { ...cursor, end: cursor.end + 1, afterIndicLinker }
  }
  if (codePoint === 0x200d) return advanceJoiner(symbols, cursor)
  if (cursor.afterIndicLinker && INDIC_CONSONANT.test(symbol)) return { ...cursor, end: cursor.end + 1, afterIndicLinker: false }
  return null
}

/** First visible character of a habit title, including joined emoji and combining marks. */
export function habitInitial(title: string): string {
  const symbols = Array.from(title.trim())
  if (symbols.length === 0) return ''
  let cursor = firstCursor(symbols)
  while (cursor.end < symbols.length) {
    const next = advanceCluster(symbols, cursor)
    if (!next) break
    cursor = next
  }
  return symbols.slice(0, cursor.end).join('').toLocaleUpperCase()
}

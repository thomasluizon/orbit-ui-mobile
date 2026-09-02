import type { SupportedLocale } from '../types/profile'

export type HabitPhraseCadence = 'daily' | 'fixed' | 'flexible'
export type HabitPhraseTokenKind = 'daily' | 'weekday' | 'count' | 'time'

export interface HabitPhraseToken {
  start: number
  end: number
  kind: HabitPhraseTokenKind
}

export interface HabitPhraseRead {
  cadence: HabitPhraseCadence | null
  days: string[]
  frequencyQuantity: number | null
  dueTime: string | null
  emoji: string | null
  consumed: HabitPhraseToken[]
}

interface LocalePatterns {
  weekdays: Array<{ day: string; pattern: RegExp }>
  daily: RegExp
  count: RegExp
  clockWithSeparator: RegExp
  clockAfterAt: RegExp
}

const LOCALE_PATTERNS: Record<SupportedLocale, LocalePatterns> = {
  'pt-BR': {
    weekdays: [
      { day: 'Sunday', pattern: /\bdomingos?\b/giu },
      { day: 'Monday', pattern: /\bsegundas?(?:-feira)?\b/giu },
      { day: 'Tuesday', pattern: /\bter[çc]as?(?:-feira)?\b/giu },
      { day: 'Wednesday', pattern: /\bquartas?(?:-feira)?\b/giu },
      { day: 'Thursday', pattern: /\bquintas?(?:-feira)?\b/giu },
      { day: 'Friday', pattern: /\bsextas?(?:-feira)?\b/giu },
      { day: 'Saturday', pattern: /\bs[áa]bados?\b/giu },
    ],
    daily: /\b(todo dia|todos os dias|diariamente|toda manh[ãa]|toda noite)\b/giu,
    count: /\b([1-7])\s*(?:vezes|x)\s*(?:(?:por|na)\s*)?semana\b/giu,
    clockWithSeparator: /\b([01]?\d|2[0-3]):([0-5]\d)\b/gu,
    clockAfterAt: /(?<!\p{L})[àa]s\s+([01]?\d|2[0-3])(?:h([0-5]\d)?)?\b/giu,
  },
  en: {
    weekdays: [
      { day: 'Sunday', pattern: /\bsundays?\b/giu },
      { day: 'Monday', pattern: /\bmondays?\b/giu },
      { day: 'Tuesday', pattern: /\btuesdays?\b/giu },
      { day: 'Wednesday', pattern: /\bwednesdays?\b/giu },
      { day: 'Thursday', pattern: /\bthursdays?\b/giu },
      { day: 'Friday', pattern: /\bfridays?\b/giu },
      { day: 'Saturday', pattern: /\bsaturdays?\b/giu },
    ],
    daily: /\b(every day|daily|each day|every morning|every evening)\b/giu,
    count: /\b([1-7])\s*(?:times|x)\s*(?:a|per)\s*week\b/giu,
    clockWithSeparator: /\b([01]?\d|2[0-3]):([0-5]\d)\b/gu,
    clockAfterAt: /\bat\s+([01]?\d|2[0-3])(?::([0-5]\d))?\b/giu,
  },
}

const EMOJI_HINTS: ReadonlyArray<{ pattern: RegExp; emoji: string }> = [
  { pattern: /corr|run/iu, emoji: '🏃' },
  { pattern: /ler|leitur|read|livro|book/iu, emoji: '📖' },
  { pattern: /[áa]gua|water|beber|drink/iu, emoji: '💧' },
  { pattern: /casa|house|lou[çc]|dish|limp|clean/iu, emoji: '🧹' },
  { pattern: /along|stretch|yoga/iu, emoji: '🧘' },
]

interface MatchRange {
  start: number
  end: number
}

function collectMatches(pattern: RegExp, text: string): RegExpExecArray[] {
  pattern.lastIndex = 0
  return Array.from(text.matchAll(pattern))
}

function toRange(match: RegExpExecArray): MatchRange {
  return { start: match.index, end: match.index + match[0].length }
}

function overlaps(left: MatchRange, right: MatchRange): boolean {
  return left.start < right.end && left.end > right.start
}

function readTime(patterns: LocalePatterns, text: string): { value: string | null; token: HabitPhraseToken | null } {
  const matches = [
    ...collectMatches(patterns.clockAfterAt, text),
    ...collectMatches(patterns.clockWithSeparator, text),
  ].sort((left, right) => left.index - right.index || right[0].length - left[0].length)
  const match = matches[0]
  if (!match) return { value: null, token: null }
  const hours = match[1]?.padStart(2, '0')
  if (!hours) return { value: null, token: null }
  return {
    value: `${hours}:${(match[2] ?? '00').padStart(2, '0')}`,
    token: { ...toRange(match), kind: 'time' },
  }
}

export function readHabitPhrase(text: string, locale: SupportedLocale): HabitPhraseRead {
  const patterns = LOCALE_PATTERNS[locale]
  const weekdayMatches = patterns.weekdays.flatMap(({ day, pattern }) =>
    collectMatches(pattern, text).map((match) => ({ day, match })),
  )
  const countMatch = collectMatches(patterns.count, text)[0]
  const dailyMatch = collectMatches(patterns.daily, text)[0]

  let cadence: HabitPhraseCadence | null = null
  let days: string[] = []
  let frequencyQuantity: number | null = null
  let cadenceTokens: HabitPhraseToken[] = []

  if (weekdayMatches.length > 0) {
    cadence = 'fixed'
    days = [...new Set(weekdayMatches.map(({ day }) => day))]
    cadenceTokens = weekdayMatches.map(({ match }) => ({ ...toRange(match), kind: 'weekday' }))
  } else if (countMatch) {
    cadence = 'flexible'
    frequencyQuantity = Number.parseInt(countMatch[1]!, 10)
    cadenceTokens = [{ ...toRange(countMatch), kind: 'count' }]
  } else if (dailyMatch) {
    cadence = 'daily'
    cadenceTokens = [{ ...toRange(dailyMatch), kind: 'daily' }]
  }

  const time = readTime(patterns, text)
  const consumed = [...cadenceTokens]
  if (time.token && !consumed.some((token) => overlaps(token, time.token!))) consumed.push(time.token)
  consumed.sort((left, right) => left.start - right.start)

  return {
    cadence,
    days,
    frequencyQuantity,
    dueTime: time.value,
    emoji: EMOJI_HINTS.find(({ pattern }) => pattern.test(text))?.emoji ?? null,
    consumed,
  }
}

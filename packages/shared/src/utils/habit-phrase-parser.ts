import type { SupportedLocale } from '../types/profile'
import { MAX_HABIT_INTERVAL_WEEKS } from '../types/habit'

export type HabitPhraseCadence = 'daily' | 'fixed' | 'flexible'
export type HabitPhraseTokenKind = 'daily' | 'weekday' | 'count' | 'time' | 'interval'

export interface HabitPhraseToken { start: number; end: number; kind: HabitPhraseTokenKind }
export interface HabitPhraseRead {
  cadence: HabitPhraseCadence | null
  days: string[]
  frequencyQuantity: number | null
  intervalWeeks: number | null
  dueTime: string | null
  emoji: string | null
  consumed: HabitPhraseToken[]
}
export interface HabitPhraseSegment { text: string; consumed: boolean }

interface NormalizedPhrase { text: string; originalStarts: number[]; originalEnds: number[] }
interface LocalePatterns {
  weekdays: Array<{ day: string; pattern: RegExp }>
  daily: RegExp
  count: RegExp
  interval: RegExp
  times: RegExp[]
  numberWords: Readonly<Record<string, number>>
}

const PORTUGUESE_NUMBERS: Readonly<Record<string, number>> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20,
}
const ENGLISH_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, once: 1, two: 2, twice: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
}
const PT_NUMBER = '(?:\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte)'
const EN_NUMBER = '(?:\\d{1,3}|one|once|two|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)'

const LOCALE_PATTERNS: Record<SupportedLocale, LocalePatterns> = {
  'pt-BR': {
    weekdays: [
      { day: 'Sunday', pattern: /\bdom(?:ingo)?s?\b/gu },
      { day: 'Monday', pattern: /\bseg(?:unda)?s?(?:-feira)?\b/gu },
      { day: 'Tuesday', pattern: /\btercas?(?:-feiras?)?\b/gu },
      { day: 'Wednesday', pattern: /\bqua(?:rta)?s?(?:-feira)?\b/gu },
      { day: 'Thursday', pattern: /\bqui(?:nta)?s?(?:-feira)?\b/gu },
      { day: 'Friday', pattern: /\bsex(?:ta)?s?(?:-feira)?\b/gu },
      { day: 'Saturday', pattern: /\bsab(?:ado)?s?\b/gu },
    ],
    daily: /(?<![a-z])(todo dia|todos os dias|diariamente|toda manha|toda noite)(?![a-z])/gu,
    count: new RegExp(`\\b(${PT_NUMBER})\\s*(?:vez|vezes|x)\\s*(?:(?:por|na|a|em)\\s*)?semana\\b`, 'gu'),
    interval: new RegExp(`\\ba\\s+cada\\s+(${PT_NUMBER})\\s+semanas?\\b`, 'gu'),
    times: [
      /\b(?:as|a)\s+([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)?\b/gu,
      /\b([01]?\d|2[0-3]):([0-5]\d)\b/gu,
      /\b([01]?\d|2[0-3])h([0-5]\d)?\b/gu,
    ],
    numberWords: PORTUGUESE_NUMBERS,
  },
  en: {
    weekdays: [
      { day: 'Sunday', pattern: /\b(?:sun|sunday)s?\b/gu },
      { day: 'Monday', pattern: /\b(?:mon|monday)s?\b/gu },
      { day: 'Tuesday', pattern: /\b(?:tue|tues|tuesday)s?\b/gu },
      { day: 'Wednesday', pattern: /\b(?:wed|weds|wednesday)s?\b/gu },
      { day: 'Thursday', pattern: /\b(?:thu|thur|thurs|thursday)s?\b/gu },
      { day: 'Friday', pattern: /\b(?:fri|friday)s?\b/gu },
      { day: 'Saturday', pattern: /\b(?:sat|saturday)s?\b/gu },
    ],
    daily: /\b(every day|daily|each day|every morning|every evening)\b/gu,
    count: new RegExp(`\\b(?:(once|twice)|(${EN_NUMBER})\\s*(?:time|times|x))\\s*(?:(?:a|per|each)\\s*)?week\\b`, 'gu'),
    interval: new RegExp(`\\bevery\\s+(${EN_NUMBER})\\s+weeks?\\b`, 'gu'),
    times: [
      /\bat\s+([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b/gu,
      /\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/gu,
      /\b(1[0-2]|0?[1-9])\s*(am|pm)\b/gu,
    ],
    numberWords: ENGLISH_NUMBERS,
  },
}

const EMOJI_HINTS: ReadonlyArray<{ pattern: RegExp; emoji: string }> = [
  { pattern: /corr|run/iu, emoji: '🏃' },
  { pattern: /ler|leitur|read|livro|book/iu, emoji: '📖' },
  { pattern: /[áa]gua|water|beber|drink/iu, emoji: '💧' },
  { pattern: /casa|house|lou[çc]|dish|limp|clean/iu, emoji: '🧹' },
  { pattern: /along|stretch|yoga/iu, emoji: '🧘' },
]

function normalizePhrase(original: string): NormalizedPhrase {
  let text = ''
  const originalStarts: number[] = []
  const originalEnds: number[] = []
  let pendingSpaceStart: number | null = null
  for (let index = 0; index < original.length;) {
    const character = String.fromCodePoint(original.codePointAt(index)!)
    const end = index + character.length
    const normalized = character.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    if (/\s/u.test(normalized)) {
      pendingSpaceStart ??= index
    } else {
      if (pendingSpaceStart !== null && text.length > 0) {
        text += ' '
        originalStarts.push(pendingSpaceStart)
        originalEnds.push(index)
      }
      pendingSpaceStart = null
      for (const normalizedCharacter of normalized) {
        text += normalizedCharacter
        originalStarts.push(index)
        originalEnds.push(end)
      }
    }
    index = end
  }
  return { text, originalStarts, originalEnds }
}

function toToken(phrase: NormalizedPhrase, match: RegExpExecArray, kind: HabitPhraseTokenKind): HabitPhraseToken {
  const normalizedEnd = match.index + match[0].length - 1
  return { start: phrase.originalStarts[match.index]!, end: phrase.originalEnds[normalizedEnd]!, kind }
}

function maskRange(text: string, start: number, end: number): string {
  return `${text.slice(0, start)}${' '.repeat(end - start)}${text.slice(end)}`
}

function firstMatch(patterns: readonly RegExp[], text: string): RegExpExecArray | null {
  const matches = patterns.flatMap((pattern) => {
    pattern.lastIndex = 0
    return Array.from(text.matchAll(pattern))
  })
  return matches.sort((left, right) => left.index - right.index || right[0].length - left[0].length)[0] ?? null
}

function parseNumber(value: string, words: Readonly<Record<string, number>>): number {
  return words[value] ?? Number.parseInt(value, 10)
}

function parseTime(match: RegExpExecArray, locale: SupportedLocale): string {
  let hour = Number.parseInt(match[1]!, 10)
  let minute = 0
  let meridiem: string | undefined
  if (locale === 'pt-BR') {
    minute = Number.parseInt(match[2] ?? match[3] ?? '0', 10)
  } else {
    const second = match[2]
    minute = Number.parseInt(second === 'am' || second === 'pm' ? '0' : (second ?? '0'), 10)
    meridiem = match[3] ?? (second === 'am' || second === 'pm' ? second : undefined)
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function extractInterval(
  remaining: string,
  phrase: NormalizedPhrase,
  patterns: LocalePatterns,
): { intervalWeeks: number | null; token: HabitPhraseToken | null; remaining: string } {
  patterns.interval.lastIndex = 0
  const match = patterns.interval.exec(remaining)
  if (!match) return { intervalWeeks: null, token: null, remaining }

  const intervalWeeks = parseNumber(match[1]!, patterns.numberWords)
  if (intervalWeeks < 1 || intervalWeeks > MAX_HABIT_INTERVAL_WEEKS) {
    return { intervalWeeks: null, token: null, remaining }
  }

  return {
    intervalWeeks,
    token: toToken(phrase, match, 'interval'),
    remaining: maskRange(remaining, match.index, match.index + match[0].length),
  }
}

export function readHabitPhrase(text: string, locale: SupportedLocale): HabitPhraseRead {
  const phrase = normalizePhrase(text)
  const patterns = LOCALE_PATTERNS[locale]
  let remaining = phrase.text
  const consumed: HabitPhraseToken[] = []
  const timeMatch = firstMatch(patterns.times, remaining)
  let dueTime: string | null = null
  if (timeMatch) {
    dueTime = parseTime(timeMatch, locale)
    consumed.push(toToken(phrase, timeMatch, 'time'))
    remaining = maskRange(remaining, timeMatch.index, timeMatch.index + timeMatch[0].length)
  }

  const interval = extractInterval(remaining, phrase, patterns)
  const intervalWeeks = interval.intervalWeeks
  if (interval.token) consumed.push(interval.token)
  remaining = interval.remaining

  const weekdayMatches = patterns.weekdays.flatMap(({ day, pattern }) => {
    pattern.lastIndex = 0
    return Array.from(remaining.matchAll(pattern), (match) => ({ day, match }))
  }).sort((left, right) => left.match.index - right.match.index)

  let cadence: HabitPhraseCadence | null = null
  let days: string[] = []
  let frequencyQuantity: number | null = null
  if (weekdayMatches.length > 0) {
    cadence = 'fixed'
    days = [...new Set(weekdayMatches.map(({ day }) => day))]
    for (const { match } of weekdayMatches) consumed.push(toToken(phrase, match, 'weekday'))
  } else {
    patterns.count.lastIndex = 0
    const countMatch = patterns.count.exec(remaining)
    if (countMatch) {
      cadence = 'flexible'
      frequencyQuantity = parseNumber(countMatch[1] ?? countMatch[2]!, patterns.numberWords)
      consumed.push(toToken(phrase, countMatch, 'count'))
      remaining = maskRange(remaining, countMatch.index, countMatch.index + countMatch[0].length)
    }
    if (!cadence) {
      patterns.daily.lastIndex = 0
      const dailyMatch = patterns.daily.exec(remaining)
      if (dailyMatch) {
        cadence = 'daily'
        consumed.push(toToken(phrase, dailyMatch, 'daily'))
      }
    }
  }

  consumed.sort((left, right) => left.start - right.start)
  return {
    cadence,
    days,
    frequencyQuantity,
    intervalWeeks,
    dueTime,
    emoji: EMOJI_HINTS.find(({ pattern }) => pattern.test(text))?.emoji ?? null,
    consumed,
  }
}

export function segmentHabitPhrase(text: string, consumed: readonly HabitPhraseToken[]): HabitPhraseSegment[] {
  if (text.length === 0) return []
  const segments: HabitPhraseSegment[] = []
  let cursor = 0
  for (const token of consumed) {
    if (token.start > cursor) segments.push({ text: text.slice(cursor, token.start), consumed: false })
    segments.push({ text: text.slice(token.start, token.end), consumed: true })
    cursor = token.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), consumed: false })
  return segments
}

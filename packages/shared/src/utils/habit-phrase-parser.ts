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

const WEEKDAY_NEGATIONS = new Set([
  'menos', 'exceto', 'sem', 'nao', 'nunca', 'salvo', 'tirando',
  'except', 'excluding', 'not', 'never', 'without', "don't", 'cannot',
])
const WEEKDAY_QUALIFIERS = new Set([
  'on', 'in', 'at', 'for', 'from', 'to', 'of', 'the', 'an', 'this', 'that', 'these', 'those',
  'next', 'last', 'coming', 'upcoming', 'following', 'every', 'each',
  'ao', 'aos', 'as', 'no', 'nos', 'nas', 'na', 'a', 'o', 'os', 'em', 'de', 'do', 'dos', 'da', 'das',
  'para', 'um', 'uma', 'uns', 'umas', 'proxima', 'proximas', 'proximo', 'proximos',
  'neste', 'nestes', 'nesta', 'nestas', 'nesse', 'nesses', 'nessa', 'nessas',
  'este', 'estes', 'esta', 'estas', 'esse', 'esses', 'essa', 'essas', 'toda', 'todas', 'todo', 'todos',
])

const UNMODELED_WEEKDAY_QUALIFIERS = new Set([
  'first', 'second', 'third', 'fourth', 'fifth', 'last', 'next', 'coming', 'upcoming', 'following',
  'other', 'alternate', 'alternating', 'odd', 'even', 'monthly', 'fortnightly', 'biweekly',
  'month', 'months', 'year', 'years', 'this', 'that', 'these', 'those',
  'primeiro', 'primeira', 'segundo', 'terceiro', 'terceira', 'quarto',
  'quinto', 'ultimo', 'ultima', 'proximo', 'proxima', 'proximos', 'proximas',
  'alternado', 'alternada', 'alternados', 'alternadas', 'quinzenal', 'quinzenalmente',
  'mensal', 'mensalmente', 'mes', 'meses', 'ano', 'anos', 'pares', 'impares', 'sim', 'nao',
  'neste', 'nesta', 'nesse', 'nessa', 'este', 'esta', 'esse', 'essa',
])
const WEEKDAY_SUFFIX_GLUE = new Set(['of', 'the', 'every', 'each', 'in', 'on', 'de', 'do', 'da', 'cada', 'em', 'nas', 'nos'])

const LOCALE_PATTERNS: Record<SupportedLocale, LocalePatterns> = {
  'pt-BR': {
    weekdays: [
      { day: 'Sunday', pattern: /\bdom(?:ingo)?s?\b/gu },
      { day: 'Monday', pattern: /\bseg(?:unda)?s?(?:-feiras?)?\b/gu },
      { day: 'Tuesday', pattern: /\btercas?(?:-feiras?)?\b/gu },
      { day: 'Wednesday', pattern: /\bqua(?:rta)?s?(?:-feiras?)?\b/gu },
      { day: 'Thursday', pattern: /\bqui(?:nta)?s?(?:-feiras?)?\b/gu },
      { day: 'Friday', pattern: /\bsex(?:ta)?s?(?:-feiras?)?\b/gu },
      { day: 'Saturday', pattern: /\bsab(?:ado)?s?\b/gu },
    ],
    daily: /(?<![a-z])(todo dia|todos os dias|diariamente|toda manha|toda noite)(?![a-z])/gu,
    count: new RegExp(`\\b(${PT_NUMBER})\\s*(?:vez|vezes|x)\\s*(?:(?:por|na|a|em)\\s*)?semana\\b`, 'gu'),
    interval: new RegExp(`\\ba\\s+cada\\s+(${PT_NUMBER})\\s+semanas?\\b`, 'gu'),
    times: [
      /\b(?:as|a)\s+([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)?\b(?![:\dh]|[.,]\d)/gu,
      /(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3]):([0-5]\d)\b(?![:\d]|[.,]\d)/gu,
      /(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3])h([0-5]\d)?\b(?![:\d]|[.,]\d)/gu,
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
      /\bat\s+([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)?\s*(am|pm)?\b(?![:\dh]|[.,]\d)/gu,
      /(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b(?![:\d]|[.,]\d)/gu,
      /(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3])h([0-5]\d)?\b(?![:\d]|[.,]\d)/gu,
      /(?<![\w:])(?<!\d[.,])(1[0-2]|0?[1-9])\s*(am|pm)\b(?![:\d]|[.,]\d)/gu,
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
    if (!normalized && originalEnds.length > 0 && pendingSpaceStart === null) {
      originalEnds[originalEnds.length - 1] = end
    } else if (/\s/u.test(normalized)) {
      pendingSpaceStart ??= index
    } else {
      if (pendingSpaceStart !== null && text.length > 0) {
        text += ' '
        originalStarts.push(pendingSpaceStart)
        originalEnds.push(index)
      }
      pendingSpaceStart = null
      for (let offset = 0; offset < normalized.length; offset += 1) {
        text += normalized[offset]
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

function parseTime(match: RegExpExecArray): string | null {
  let hour = Number.parseInt(match[1]!, 10)
  const suffixes = match.slice(2)
  const minute = Number.parseInt(suffixes.find((value) => value && /^\d+$/u.test(value)) ?? '0', 10)
  const meridiem = suffixes.find((value) => value === 'am' || value === 'pm')
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = hour % 12 + (meridiem === 'pm' ? 12 : 0)
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function extractTime(remaining: string, phrase: NormalizedPhrase, patterns: LocalePatterns) {
  const match = firstMatch(patterns.times, remaining)
  const dueTime = match ? parseTime(match) : null
  if (!match || !dueTime) return { dueTime: null, token: null, remaining }
  return {
    dueTime, token: toToken(phrase, match, 'time'),
    remaining: maskRange(remaining, match.index, match.index + match[0].length),
  }
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

function extractCount(text: string, patterns: LocalePatterns): { match: RegExpExecArray; quantity: number } | null {
  patterns.count.lastIndex = 0
  const match = patterns.count.exec(text)
  if (!match) return null
  const quantity = parseNumber(match[1] ?? match[2]!, patterns.numberWords)
  return quantity > 0 ? { match, quantity } : null
}

function matchWeekdays(text: string, patterns: LocalePatterns) {
  return patterns.weekdays.flatMap(({ day, pattern }) => {
    pattern.lastIndex = 0
    return Array.from(text.matchAll(pattern), (match) => ({ day, match }))
  }).sort((left, right) => left.match.index - right.match.index)
}

function hasUnmodeledWeekdayQualifier(text: string, backwards: boolean): boolean {
  const words = text.trim().split(/\s+/u)
  if (backwards) words.reverse()
  for (const value of words) {
    const word = value.replace(/[,.!?;:]+$/u, '')
    if (UNMODELED_WEEKDAY_QUALIFIERS.has(word) || /^\d+(?:st|nd|rd|th|º|ª)$/u.test(word)) return true
    if (!(backwards ? WEEKDAY_QUALIFIERS : WEEKDAY_SUFFIX_GLUE).has(word)) return false
  }
  return false
}

function hasUnmodeledWeekday(text: string, patterns: LocalePatterns): boolean {
  return matchWeekdays(text, patterns).some(({ match }) => {
    const prefix = text.slice(0, match.index)
    const suffix = text.slice(match.index + match[0].length)
    return hasUnmodeledWeekdayQualifier(prefix, true) || hasUnmodeledWeekdayQualifier(suffix, false)
      || /^\s+(?:in|em)\s+(?:weeks|semanas)\b/u.test(suffix)
  })
}

function matchPortugueseAlternation(text: string, patterns: LocalePatterns) {
  const ranges: Array<{ start: number; end: number }> = []
  const weekdays = matchWeekdays(text, patterns)
  for (const [index, { day, match }] of weekdays.entries()) {
    const end = match.index + match[0].length
    const next = weekdays[index + 1]
    if (!next || next.day !== day || !/^ sim,? $/u.test(text.slice(end, next.match.index))) continue
    const nextEnd = next.match.index + next.match[0].length
    const qualifier = /^ nao\b/u.exec(text.slice(nextEnd))
    if (qualifier) ranges.push({ start: end, end: nextEnd + qualifier[0].length })
  }
  if (weekdays.length > 0) {
    for (const match of text.matchAll(/\bsemana sim,? semana nao\b/gu)) {
      ranges.push({ start: match.index, end: match.index + match[0].length })
    }
  }
  return ranges
}

function extractAlternatingWeekdays(text: string, phrase: NormalizedPhrase, patterns: LocalePatterns, locale: SupportedLocale) {
  const ranges = locale === 'pt-BR'
    ? matchPortugueseAlternation(text, patterns)
    : matchWeekdays(text, patterns).flatMap(({ match }) => {
      const qualifier = /\bevery other $/u.exec(text.slice(0, match.index))
      return qualifier ? [{ start: qualifier.index, end: match.index }] : []
    })
  const consumed: HabitPhraseToken[] = []
  let remaining = text
  for (const { start, end } of ranges) {
    consumed.push({ start: phrase.originalStarts[start]!, end: phrase.originalEnds[end - 1]!, kind: 'interval' })
    remaining = maskRange(remaining, start, end)
  }
  return { consumed, remaining }
}

function hasWeekdayNegation(text: string, locale: SupportedLocale): boolean {
  const words = Array.from(text.matchAll(/\b(don't|[a-z]+)\s+/gu))
  let cursor = text.length
  for (const match of words.reverse()) {
    if (match.index + match[0].length !== cursor) return false
    const word = match[1]!
    if (WEEKDAY_NEGATIONS.has(word)
      || (word === 'ser' && /\bsem $/u.test(text.slice(0, match.index)))
      || (locale === 'en' && word === 'no' && cursor === text.length)) return true
    if (!WEEKDAY_QUALIFIERS.has(word)) return false
    cursor = match.index
  }
  return false
}

function isWeekdayExclusionListSeparator(text: string): boolean {
  const separator = /^\s*,?\s*(?:and|e)\s+/u.exec(text) ?? /^\s*,\s*/u.exec(text)
  if (!separator) return false
  const preposition = text.slice(separator[0].length)
  return preposition === '' || /^(?:on|aos|as|no|nos|nas)\s+$/u.test(preposition)
}

function readWeekdayExclusion(
  remaining: string,
  phrase: NormalizedPhrase,
  patterns: LocalePatterns,
  locale: SupportedLocale,
): { days: string[]; consumed: HabitPhraseToken[] } | 'unresolved' | null {
  const weekdays = matchWeekdays(remaining, patterns)
  if (!weekdays.some(({ match }) => hasWeekdayNegation(remaining.slice(0, match.index), locale))) return null
  const exclusions = [...remaining.matchAll(/\b(?:menos|exceto|sem ser|except|but not)\b/gu)]
    .filter((exclusion) => weekdays.some(({ match }) => /^\s+(?:(?:on|aos|as|no|nos|nas|a|o)\s+)?$/u.test(remaining.slice(exclusion.index + exclusion[0].length, match.index))))
  if (exclusions.length !== 1) return 'unresolved'
  const exclusion = exclusions[0]!
  const prefix = remaining.slice(0, exclusion.index)
  if (/^\s*(?:do not|don't|cannot|nao|nunca|never)\b/u.test(prefix)) return 'unresolved'
  const daily = firstMatch([patterns.daily], prefix)
  if (prefix.trim() && (!daily || prefix.slice(daily.index + daily[0].length).replace(/[\s,;]+/gu, ''))) return 'unresolved'
  if (firstMatch([patterns.count, patterns.interval], prefix) || /\b(?:weekdays?|weekends?|uteis|fim|fins)\b/u.test(prefix)) return 'unresolved'
  let cursor = exclusion.index + exclusion[0].length
  for (const [index, { match }] of weekdays.entries()) {
    const glue = remaining.slice(cursor, match.index)
    const allowed = index === 0
      ? /^\s+(?:(?:on|aos|as|no|nos|nas|a|o)\s+)?$/u.test(glue)
      : isWeekdayExclusionListSeparator(glue)
    if (match.index < cursor || !allowed) return 'unresolved'
    cursor = match.index + match[0].length
  }
  if (remaining.slice(cursor).replace(/[\s,.!?;:]+/gu, '')) return 'unresolved'
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .filter((day) => !weekdays.some((weekday) => weekday.day === day))
  if (days.length === 0) return 'unresolved'
  const consumed: HabitPhraseToken[] = [{
    start: phrase.originalStarts[exclusion.index]!, end: phrase.originalEnds[cursor - 1]!, kind: 'weekday',
  }]
  if (daily) consumed.unshift(toToken(phrase, daily, 'daily'))
  return { days, consumed }
}

function subtractConsumedTokens(token: HabitPhraseToken, consumed: HabitPhraseToken[]): HabitPhraseToken[] {
  const fragments: HabitPhraseToken[] = []
  let start = token.start
  for (const existing of consumed) {
    if (existing.end <= start || existing.start >= token.end) continue
    if (existing.start > start) fragments.push({ ...token, start, end: existing.start })
    start = existing.end
  }
  if (start < token.end) fragments.push({ ...token, start })
  return fragments
}

function buildWeekdayExclusionRead(
  exclusion: { days: string[]; consumed: HabitPhraseToken[] } | 'unresolved',
  text: string,
  dueTime: string | null,
  consumed: HabitPhraseToken[],
): HabitPhraseRead {
  const resolved = exclusion !== 'unresolved'
  return {
    cadence: resolved ? 'fixed' : null, days: resolved ? exclusion.days : [],
    frequencyQuantity: null, intervalWeeks: null, dueTime,
    emoji: EMOJI_HINTS.find(({ pattern }) => pattern.test(text))?.emoji ?? null,
    consumed: resolved
      ? [...consumed, ...exclusion.consumed.flatMap((token) => subtractConsumedTokens(token, consumed))].sort((left, right) => left.start - right.start)
      : consumed,
  }
}

function extractCadence(remaining: string, phrase: NormalizedPhrase, patterns: LocalePatterns) {
  const consumed: HabitPhraseToken[] = []
  const weekdayMatches = matchWeekdays(remaining, patterns)

  let cadence: HabitPhraseCadence | null = null
  let days: string[] = []
  let frequencyQuantity: number | null = null
  if (weekdayMatches.length > 0) {
    cadence = 'fixed'
    days = [...new Set(weekdayMatches.map(({ day }) => day))]
    for (const { match } of weekdayMatches) consumed.push(toToken(phrase, match, 'weekday'))
  } else {
    const count = extractCount(remaining, patterns)
    if (count) {
      cadence = 'flexible'
      frequencyQuantity = count.quantity
      consumed.push(toToken(phrase, count.match, 'count'))
      remaining = maskRange(remaining, count.match.index, count.match.index + count.match[0].length)
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

  return { cadence, days, frequencyQuantity, consumed }
}

export function readHabitPhrase(text: string, locale: SupportedLocale): HabitPhraseRead {
  const phrase = normalizePhrase(text)
  const patterns = LOCALE_PATTERNS[locale]
  let remaining = phrase.text
  const consumed: HabitPhraseToken[] = []
  const time = extractTime(remaining, phrase, patterns)
  const dueTime = time.dueTime
  if (time.token) consumed.push(time.token)
  remaining = time.remaining

  const alternating = extractAlternatingWeekdays(remaining, phrase, patterns, locale)
  remaining = alternating.remaining
  if (hasUnmodeledWeekday(remaining, patterns)) return buildWeekdayExclusionRead('unresolved', text, dueTime, consumed)
  const exclusion = readWeekdayExclusion(remaining, phrase, patterns, locale)
  if (exclusion) return buildWeekdayExclusionRead(alternating.consumed.length > 0 ? 'unresolved' : exclusion, text, dueTime, consumed)

  const interval = extractInterval(remaining, phrase, patterns)
  const hasAlternation = alternating.consumed.length > 0
  if (hasAlternation && interval.intervalWeeks !== null && interval.intervalWeeks !== 2) {
    return buildWeekdayExclusionRead('unresolved', text, dueTime, consumed)
  }
  const intervalWeeks = hasAlternation ? 2 : interval.intervalWeeks
  consumed.push(...alternating.consumed)
  if (interval.token) consumed.push(interval.token)
  remaining = interval.remaining

  const cadenceRead = extractCadence(remaining, phrase, patterns)
  consumed.push(...cadenceRead.consumed)

  consumed.sort((left, right) => left.start - right.start)
  return {
    cadence: cadenceRead.cadence,
    days: cadenceRead.days,
    frequencyQuantity: cadenceRead.frequencyQuantity,
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

export function readTypedHabitPhrase(title: string, locale: SupportedLocale, type: 'task' | 'habit' | null | undefined, general: boolean): HabitPhraseRead {
  const read = readHabitPhrase(title, locale)
  if (!general && type !== 'task') return read
  return { ...read, cadence: null, days: [], frequencyQuantity: null, intervalWeeks: null,
    dueTime: general ? null : read.dueTime,
    consumed: general ? [] : read.consumed.filter((token) => token.kind === 'time') }
}

export function isWeeklyRecurrencePhrase(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/gu, ' ')
  return /^[.!?,;:]*\s*(?:toda semana|todas as semanas|semanalmente|every week|weekly)\s*[.!?,;:]*$/u.test(normalized)
}

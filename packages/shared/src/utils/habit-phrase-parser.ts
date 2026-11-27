import type { SupportedLocale } from '../types/profile'
import { MAX_HABIT_INTERVAL_WEEKS } from '../types/habit'
import { isHabitMonthDay, normalizeHabitMonthDays } from './month-days'

export type HabitPhraseCadence = 'daily' | 'fixed' | 'flexible' | 'monthly'
export type HabitPhraseTokenKind = 'daily' | 'weekday' | 'count' | 'time' | 'interval' | 'monthDay'

export interface HabitPhraseToken { start: number; end: number; kind: HabitPhraseTokenKind }
/** A range of the phrase, by character, with no kind. */
export type HabitPhraseSpan = Pick<HabitPhraseToken, 'start' | 'end'>
export interface HabitPhraseRead {
  cadence: HabitPhraseCadence | null
  days: string[]
  monthDays: number[]
  frequencyQuantity: number | null
  intervalWeeks: number | null
  dueTime: string | null
  consumed: HabitPhraseToken[]
}
export interface HabitPhraseSegment { text: string; consumed: boolean }

interface NormalizedPhrase { text: string; originalStarts: number[]; originalEnds: number[] }
interface LocalePatterns {
  weekdays: Array<{ day: string; pattern: RegExp; withNeighbor?: boolean }>
  daily: RegExp
  count: RegExp
  interval: RegExp
  weeklySuffix: RegExp
  monthDays: RegExp[]
  times: RegExp[]
  noon: RegExp
  isNoonOffset: (before: string, after: string) => boolean
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
const PT_NUMBER = String.raw`(?:\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte)`
const EN_NUMBER = String.raw`(?:\d{1,3}|one|once|two|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)`

const PT_MONTH_DAY = String.raw`\d{1,2}(?![\d:h])`
const PT_MONTH_DAY_LIST = String.raw`${PT_MONTH_DAY}(?:(?:\s*,\s*(?:e\s+)?|\s+e\s+)(?:(?:o\s+)?dia\s+)?${PT_MONTH_DAY})*`
const PT_MONTH_SUFFIX = String.raw`\s+(?:de cada|de todo|do|todo|a cada|cada)\s+mes`
const MONTH_DAY_LIST_END = String.raw`(?=\s*(?:[,.;!?]|$|a partir\b|comecando\b|from\b|starting\b))`
const EN_MONTH_DAY = String.raw`\d{1,2}(?:st|nd|rd|th)`
const EN_MONTH_DAY_LIST = String.raw`${EN_MONTH_DAY}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:the\s+)?${EN_MONTH_DAY})*`

const PT_DAY_PART = String.raw`(?:\s+(?:horas?|hrs?|hs|h)\b)?(?:\s+(?:d[ae]|pela|a)\s+(manha|tarde|noite|madrugada)\b)?`
const EN_DAY_PART = String.raw`(?:\s+o['\u2019]?clock\b)?(?:\s+((?:in the|at|of the) (?:morning|afternoon|evening|night))\b)?`
const EN_MERIDIEM_WORD = String.raw`(a\.m\.?|p\.m\.?|am|pm)`
const EN_MERIDIEM = String.raw`(?:\s*${EN_MERIDIEM_WORD})?${EN_DAY_PART}`
const EN_MERIDIEM_END = String.raw`(?:\b|(?<=\.))`
type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night' | 'dawn'
const DAY_PERIODS: Readonly<Record<string, DayPeriod>> = {
  manha: 'morning', tarde: 'afternoon', noite: 'night', madrugada: 'dawn',
  morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night',
}
const PERIOD_OF_DAILY_WORD: Readonly<Record<string, DayPeriod>> = {
  'toda manha': 'morning', 'toda tarde': 'afternoon', 'toda noite': 'night', 'toda madrugada': 'dawn',
  'every morning': 'morning', 'every afternoon': 'afternoon', 'every evening': 'evening', 'every night': 'night',
}
const ARTICLE_GLUE = /^\.?(?:\s+feiras?)?\s+(?:as|aos)\s+$/u
const RANGE_OPENER = /(?:^|\s)d(?:e|as?|os?)\s+$/u
const WEEKDAY_GLUE_LEAD = /^\.?(?:\s+feiras?)?/u
const WEEKDAY_DASH_GLUE = /^\s*[-\u2013\u2014]\s*$/u
const WEEKDAY_WORD_GLUE = /^\s+(\S+(?:\s+\S+)?)\s+$/u
const WEEKDAY_RANGE_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'ate a', 'ate o', 'ate ao', 'ate aos', 'ate as',
  'to', 'through', 'through to', 'thru', 'until',
  'til', 'till', "'til", "'till", '\u2019til', '\u2019till',
])
const MONTH_SCOPE_LEADS = new Set(['of', 'in', 'on', 'every', 'each', 'this', 'next', 'last'])
const MONTH_SCOPE_FILLERS = new Set(['the', 'every', 'each', 'this', 'next', 'last', 'odd', 'even'])
const PT_HOUR_RANGE_CLOCK = String.raw`(?::[0-5]\d|h(?:[0-5]\d)?)?`
function ptHourRange(opener: string, joiner: string): RegExp {
  return new RegExp(
    String.raw`\b${opener}\s+([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)?\s+${joiner}\s+(?:[01]?\d|2[0-3])${PT_HOUR_RANGE_CLOCK}\b${PT_DAY_PART}(?![:\dh]|[.,]\d)`,
    'gu',
  )
}
const PT_NOON =String.raw`\b(?:(?:ao|as|a)\s+)?meio-dia(?:\s+e\s+mei[ao]\b(?!-))?\b`
const EN_NOON = String.raw`\b(?:at\s+)?noon\b`

const PT_OFFSET_WORDS = new Set(['quarto', 'hora', 'horas', 'minuto', 'minutos', 'cinco', 'dez', 'quinze', 'vinte', 'trinta', 'quarenta', 'cinquenta'])
const PT_OFFSET_CONNECTORS = new Set(['para', 'pra', 'pro', 'antes', 'depois'])
const PT_OFFSET_ARTICLES = new Set(['o', 'do'])
const EN_OFFSET_WORDS = new Set([
  'half', 'quarter', 'five', 'ten', 'fifteen', 'twenty', 'min', 'mins', 'minute', 'minutes', 'hour', 'hours',
])
const EN_OFFSET_CONNECTORS = new Set(['past', 'after', 'to', 'before', 'till', 'til', 'until'])

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
const WEEKDAY_PREFIX_GLUE = new Set(['o', 'a', 'the', 'de', 'do', 'da'])
const WEEKDAY_PERIOD_WORDS = new Set(['month', 'months', 'year', 'years', 'mes', 'meses', 'ano', 'anos'])

interface WeekdayAlternation {
  start: number
  end: number
  weekdayIndexes: number[]
  scope: 'weekday' | 'following' | 'list'
}

function isPortugueseNoonOffset(before: string, after: string): boolean {
  const words = before.endsWith(' ') ? before.trimEnd().split(' ') : []
  if (PT_OFFSET_ARTICLES.has(words.at(-1) ?? '')) words.pop()
  const connector = words.pop() ?? ''
  const offset = words.pop() ?? ''
  if (PT_OFFSET_CONNECTORS.has(connector) && (PT_OFFSET_WORDS.has(offset) || /^\d{1,2}$/u.test(offset))) return true
  const next = /^ (?:e|menos) (\d{1,2}(?![\w:])|[a-z]+)(?: ([a-z]+))?/u.exec(after)
  if (!next) return false
  const [, first = '', second] = next
  if (first === 'um') return second === 'quarto'
  if (first === 'meia') return second === 'hora'
  return PT_OFFSET_WORDS.has(first) || /^\d/u.test(first)
}

function isEnglishNoonOffset(before: string): boolean {
  const words = before.endsWith(' ') ? before.trimEnd().split(/[\s-]+/u) : []
  const connector = words.pop() ?? ''
  const offset = words.pop() ?? ''
  return EN_OFFSET_CONNECTORS.has(connector) && (EN_OFFSET_WORDS.has(offset) || /^\d{1,2}$/u.test(offset))
}

const LOCALE_PATTERNS: Record<SupportedLocale, LocalePatterns> = {
  'pt-BR': {
    weekdays: [
      { day: 'Sunday', pattern: /\b(?:domingos?|doms?\.?)(?!\w)/gu },
      { day: 'Monday', pattern: /\b(?:segundas?|segs?)(?:-feiras?|(?<=\bsegs?)\.)?(?!\w)/gu },
      { day: 'Tuesday', pattern: /\btercas?(?:-feiras?)?(?!\w)/gu },
      { day: 'Tuesday', pattern: /\bter\.?(?!\w)/gu, withNeighbor: true },
      { day: 'Wednesday', pattern: /\b(?:quartas?|quas?)(?:-feiras?|(?<=\bquas?)\.)?(?!\w)/gu },
      { day: 'Thursday', pattern: /\b(?:quintas?|quis?)(?:-feiras?|(?<=\bquis?)\.)?(?!\w)/gu },
      { day: 'Friday', pattern: /\b(?:sextas?|sexs?)(?:-feiras?|(?<=\bsexs?)\.)?(?!\w)/gu },
      { day: 'Saturday', pattern: /\b(?:sabados?|sabs?\.?)(?!\w)/gu },
    ],
    daily: /(?<![a-z])(todo dia|todos os dias|diariamente|toda manha|toda tarde|toda noite|toda madrugada)(?![a-z])/gu,
    count: new RegExp(String.raw`\b(${PT_NUMBER})\s*(?:vez|vezes|x)\s*(?:(?:por|na|a|em)\s*)?semana\b`, 'gu'),
    interval: new RegExp(String.raw`\ba\s+cada\s+(${PT_NUMBER})\s+semanas?\b`, 'gu'),
    weeklySuffix: /^\s+((?:a cada|de cada|cada|toda|por) semana|todas as semanas)\b/u,
    monthDays: [
      new RegExp(String.raw`\b(?:todo|todos os|em todo|cada|a cada)\s+dias?\s+${PT_MONTH_DAY_LIST}(?:${PT_MONTH_SUFFIX}(?![\w:])|${MONTH_DAY_LIST_END})`, 'gu'),
      new RegExp(String.raw`\b(?:(?:no|nos|em|todo)\s+)?dias?\s+${PT_MONTH_DAY_LIST}${PT_MONTH_SUFFIX}(?![\w:])`, 'gu'),
      new RegExp(String.raw`\b(?:todo|cada|a cada)\s+mes,?\s+(?:(?:no|nos|em)\s+)?dias?\s+${PT_MONTH_DAY_LIST}(?![\w:])`, 'gu'),
    ],
    times: [
      ptHourRange('das', String.raw`(?:as|a|ate(?:\s+as)?)`),
      ptHourRange('de', String.raw`(?:as|ate(?:\s+as)?)`),
      new RegExp(String.raw`\b(?:as|a)\s+([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?|\s+e\s+(meia)\b(?!-))?\b${PT_DAY_PART}(?![:\dh]|[.,]\d)`, 'gu'),
      new RegExp(String.raw`(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3]):([0-5]\d)\b${PT_DAY_PART}(?![:\d]|[.,]\d)`, 'gu'),
      new RegExp(String.raw`(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3])h([0-5]\d)?\b${PT_DAY_PART}(?![:\d]|[.,]\d)`, 'gu'),
      /(?<![\w:])(?<!\d[.,])(1[0-2]|0?[1-9])\s+da\s+(manha|tarde|noite|madrugada)\b(?![:\d]|[.,]\d)/gu,
    ],
    noon: new RegExp(PT_NOON, 'gu'),
    isNoonOffset: isPortugueseNoonOffset,
    numberWords: PORTUGUESE_NUMBERS,
  },
  en: {
    weekdays: [
      { day: 'Sunday', pattern: /\b(?:sunday|sun)s?(?:(?<=\bsuns?)\.)?(?!\w)/gu },
      { day: 'Monday', pattern: /\b(?:monday|mon)s?(?:(?<=\bmons?)\.)?(?!\w)/gu },
      { day: 'Tuesday', pattern: /\b(?:tuesday|tues|tue)s?(?:(?<=\btues?)\.)?(?!\w)/gu },
      { day: 'Wednesday', pattern: /\b(?:wednesday|weds|wed)s?(?:(?<=\bweds?)\.)?(?!\w)/gu },
      { day: 'Thursday', pattern: /\b(?:thursday|thurs|thur|thu)s?(?:(?<=\b(?:thurs?|thus?))\.)?(?!\w)/gu },
      { day: 'Friday', pattern: /\b(?:friday|fri)s?(?:(?<=\bfris?)\.)?(?!\w)/gu },
      { day: 'Saturday', pattern: /\b(?:saturday|sat)s?(?:(?<=\bsats?)\.)?(?!\w)/gu },
    ],
    daily: /\b(every day|daily|each day|every morning|every afternoon|every evening|every night)\b/gu,
    count: new RegExp(String.raw`\b(?:(once|twice)|(${EN_NUMBER})\s*(?:time|times|x))\s*(?:(?:a|per|each)\s*)?week\b`, 'gu'),
    interval: new RegExp(String.raw`\bevery\s+(${EN_NUMBER})\s+weeks?\b`, 'gu'),
    weeklySuffix: /^\s+((?:every|each|per|a) week)\b/u,
    monthDays: [
      new RegExp(String.raw`\b(?:on\s+)?(?:the\s+)?${EN_MONTH_DAY_LIST}\s+(?:(?:of\s+)?(?:every|each)\s+month|monthly)\b`, 'gu'),
      new RegExp(String.raw`\b(?:(?:every|each)\s+month|monthly),?\s+on\s+(?:the\s+)?${EN_MONTH_DAY_LIST}(?![\w:])`, 'gu'),
      new RegExp(String.raw`\bevery\s+${EN_MONTH_DAY_LIST}(?:\s+of\s+the\s+month(?![\w:])|${MONTH_DAY_LIST_END})`, 'gu'),
    ],
    times: [
      new RegExp(String.raw`\bat\s+([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)?${EN_MERIDIEM}${EN_MERIDIEM_END}(?![:\dh]|[.,]\d)`, 'gu'),
      new RegExp(String.raw`(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3]):([0-5]\d)${EN_MERIDIEM}${EN_MERIDIEM_END}(?![:\d]|[.,]\d)`, 'gu'),
      new RegExp(String.raw`(?<![\w:])(?<!\d[.,])([01]?\d|2[0-3])h([0-5]\d)?\b${EN_DAY_PART}(?![:\d]|[.,]\d)`, 'gu'),
      new RegExp(String.raw`(?<![\w:])(?<!\d[.,])(1[0-2]|0?[1-9])\s*${EN_MERIDIEM_WORD}${EN_MERIDIEM_END}(?![:\d]|[.,]\d)`, 'gu'),
    ],
    noon: new RegExp(EN_NOON, 'gu'),
    isNoonOffset: isEnglishNoonOffset,
    numberWords: ENGLISH_NUMBERS,
  },
}

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

function firstNoonMatch(text: string, patterns: LocalePatterns): RegExpExecArray | null {
  patterns.noon.lastIndex = 0
  const matches = Array.from(text.matchAll(patterns.noon))
  return matches.find((match) => {
    const before = text.slice(0, match.index)
    return !patterns.isNoonOffset(before, text.slice(match.index + match[0].length))
  }) ?? null
}

function parseNumber(value: string, words: Readonly<Record<string, number>>): number {
  return words[value] ?? Number.parseInt(value, 10)
}

function nightHour(hour: number): number {
  if (hour === 12) return 0
  return hour < 6 ? hour : hour + 12
}

function dawnHour(hour: number): number | null {
  if (hour === 12) return 0
  return hour <= 6 ? hour : null
}

const HOUR_IN_PERIOD: Readonly<Record<DayPeriod, (hour: number) => number | null>> = {
  morning: (hour) => (hour === 12 ? null : hour),
  afternoon: (hour) => (hour === 12 ? 12 : hour + 12),
  evening: (hour) => (hour === 12 ? null : hour + 12),
  night: nightHour,
  dawn: dawnHour,
}

function meridiemHour(hour: number, meridiem: 'am' | 'pm'): number | null {
  if (hour < 1 || hour > 12) return null
  return meridiem === 'pm' ? hour % 12 + 12 : hour % 12
}

function readPeriod(dayPart: string): DayPeriod | undefined {
  return DAY_PERIODS[dayPart.replace(/^(?:in the|at|of the) /u, '')]
}

function readDayPartHour(hour: number, dayPart: string): number | null {
  if (dayPart === 'am' || dayPart === 'pm') return meridiemHour(hour, dayPart)
  const period = readPeriod(dayPart)
  return period ? readPeriodHour(hour, period) : null
}

function readPeriodHour(hour: number, period: DayPeriod): number | null {
  if (hour === 0) return period === 'morning' || period === 'dawn' || period === 'night' ? 0 : null
  if (hour <= 12) return HOUR_IN_PERIOD[period](hour)
  return HOUR_IN_PERIOD[period](hour - 12) === hour ? hour : null
}

function parseTime(match: RegExpExecArray, impliedPeriod?: DayPeriod): string | null {
  if (match[1] === undefined) return /\se\s+mei[ao]$/u.test(match[0]) ? '12:30' : '12:00'
  const clockHour = Number.parseInt(match[1], 10)
  const suffixes = match.slice(2).map((value) => (value && /^[ap]\.m/u.test(value) ? `${value[0]}m` : value))
  const minute = suffixes.includes('meia')
    ? 30
    : Number.parseInt(suffixes.find((value) => value && /^\d+$/u.test(value)) ?? '0', 10)
  const dayPart = suffixes.find((value) => value && /^(?:am|pm|manha|madrugada|tarde|noite|in the |at |of the )/u.test(value))
  const spokenHour = dayPart
    ? readDayPartHour(clockHour, dayPart)
    : (impliedPeriod && readPeriodHour(clockHour, impliedPeriod)) ?? clockHour
  if (spokenHour === null) return null
  return `${String(spokenHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function extractTime(remaining: string, phrase: NormalizedPhrase, patterns: LocalePatterns) {
  const match = firstMatch(patterns.times, remaining) ?? firstNoonMatch(remaining, patterns)
  const dueTime = match ? parseTime(match) : null
  if (!match || !dueTime) return { dueTime: null, match: null, token: null, remaining }
  return {
    dueTime, match, token: toToken(phrase, match, 'time'),
    remaining: maskRange(remaining, match.index, match.index + match[0].length),
  }
}

function applyDailyPeriod(match: RegExpExecArray | null, dueTime: string | null, period: DayPeriod | undefined): string | null {
  return match && period ? parseTime(match, period) ?? dueTime : dueTime
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

function extractMonthDays(
  remaining: string,
  phrase: NormalizedPhrase,
  patterns: LocalePatterns,
): { monthDays: number[]; token: HabitPhraseToken; remaining: string } | 'unresolved' | null {
  const match = firstMatch(patterns.monthDays, remaining)
  if (!match) return null
  const monthDays = Array.from(match[0].matchAll(/\d{1,2}/gu), (day) => Number.parseInt(day[0], 10))
  if (!monthDays.every(isHabitMonthDay)) return 'unresolved'
  return {
    monthDays: normalizeHabitMonthDays(monthDays),
    token: toToken(phrase, match, 'monthDay'),
    remaining: maskRange(remaining, match.index, match.index + match[0].length),
  }
}

function hasOtherCadence(text: string, patterns: LocalePatterns): boolean {
  return matchWeekdays(text, patterns).length > 0 || firstMatch([patterns.count, patterns.interval, patterns.daily], text) !== null
}

function buildMonthDayRead(
  monthDays: NonNullable<ReturnType<typeof extractMonthDays>>,
  patterns: LocalePatterns,
  dueTime: string | null,
  consumed: HabitPhraseToken[],
): HabitPhraseRead {
  const resolved = monthDays !== 'unresolved' && !hasOtherCadence(monthDays.remaining, patterns)
  return {
    cadence: resolved ? 'monthly' : null, days: [], monthDays: resolved ? monthDays.monthDays : [],
    frequencyQuantity: null, intervalWeeks: null, dueTime,
    consumed: resolved ? [...consumed, monthDays.token].sort((left, right) => left.start - right.start) : consumed,
  }
}

function extractCount(text: string, patterns: LocalePatterns): { match: RegExpExecArray; quantity: number } | null {
  patterns.count.lastIndex = 0
  const match = patterns.count.exec(text)
  if (!match) return null
  const quantity = parseNumber(match[1] ?? match[2]!, patterns.numberWords)
  return quantity > 0 ? { match, quantity } : null
}

const WEEKDAY_JOIN_MARK = String.raw`^\.?\s*(?:[,;/]|[-\u2013\u2014])?\s*`
const WEEKDAY_NEIGHBOR_GLUE = new RegExp(String.raw`${WEEKDAY_JOIN_MARK}(?:(?:e(?:\s+(?:as|aos))?|a|ao|aos|as|ate)\s+)?$`, 'u')
const SHORT_WEEKDAY = /^(?:seg|ter|qua|qui|sex|sab|dom)s?\.?$/u

function matchWeekdays(text: string, patterns: LocalePatterns) {
  const all = patterns.weekdays.flatMap(({ day, pattern, withNeighbor }) => {
    pattern.lastIndex = 0
    return Array.from(text.matchAll(pattern), (match) => ({ day, match, withNeighbor: withNeighbor === true }))
  })
  const standalone = all.filter((weekday) => !weekday.withNeighbor)
  const besideDay = ({ match }: (typeof all)[number]): boolean => standalone.some((other) => {
    const [first, second] = other.match.index < match.index ? [other.match, match] : [match, other.match]
    const glue = text.slice(first.index + first[0].length, second.index)
    if (first.index + first[0].length > second.index || !WEEKDAY_NEIGHBOR_GLUE.test(glue)) return false
    return SHORT_WEEKDAY.test(other.match[0]) || (RANGE_OPENER.test(text.slice(0, first.index)) && isWeekdayRangeGlue(glue))
  })
  return all
    .filter((weekday) => !weekday.withNeighbor || besideDay(weekday))
    .map(({ day, match }) => ({ day, match }))
    .sort((left, right) => left.match.index - right.match.index)
}

function hasUnmodeledWeekdayPrefix(text: string): boolean {
  for (const value of text.trim().split(/\s+/u).reverse().slice(0, 2)) {
    const word = value.replace(/[,.!?;:]+$/u, '')
    if (UNMODELED_WEEKDAY_QUALIFIERS.has(word) || /^\d+(?:st|nd|rd|th|º|ª)$/u.test(word)) return true
    if (!WEEKDAY_PREFIX_GLUE.has(word)) return false
  }
  return false
}

function startsWithMonthScope(text: string): boolean {
  if (!/^\s/u.test(text)) return false
  const [lead = '', ...rest] = text.trim().split(/\s+/u)
  if (!MONTH_SCOPE_LEADS.has(lead)) return false
  const unit = rest.find((word) => !MONTH_SCOPE_FILLERS.has(word))
  return unit !== undefined && /^(?:months?|years?)\b/u.test(unit)
}

function hasUnmodeledWeekdaySuffix(text: string): boolean {
  const word = /^\s+(\S+)/u.exec(text)?.[1]?.replace(/[,.!?;:]+$/u, '')
  if (word && UNMODELED_WEEKDAY_QUALIFIERS.has(word) && !WEEKDAY_PERIOD_WORDS.has(word)) return true
  return startsWithMonthScope(text)
    || /^\s+(?:de cada|a cada|do|da|de|cada|em|nas|nos)\s+(?:mes(?:es)?|anos?)\b/u.test(text)
    || /^\s+(?:of|in|on|every|each)\s+(?:the\s+)?(?:this|next|last|odd|even|alternate|alternating)\s+weeks?\b/u.test(text)
    || /^\s+(?:(?:de cada|a cada|do|da|de|cada|em|nas|nos)\s+)?semanas?\s+(?:pares|impares|alternadas)\b/u.test(text)
}

function hasUnmodeledWeekday(text: string, patterns: LocalePatterns): boolean {
  return matchWeekdays(text, patterns).some(({ match }) => {
    const prefix = text.slice(0, match.index)
    const suffix = text.slice(match.index + match[0].length)
    return hasUnmodeledWeekdayPrefix(prefix) || hasUnmodeledWeekdaySuffix(suffix)
  })
}

function matchPortugueseAlternation(text: string, patterns: LocalePatterns): WeekdayAlternation[] {
  const ranges: WeekdayAlternation[] = []
  const weekdays = matchWeekdays(text, patterns)
  for (const [index, { day, match }] of weekdays.entries()) {
    const end = match.index + match[0].length
    const next = weekdays[index + 1]
    if (!next || next.day !== day || !/^ sim,? $/u.test(text.slice(end, next.match.index))) continue
    const nextEnd = next.match.index + next.match[0].length
    const qualifier = /^ nao\b/u.exec(text.slice(nextEnd))
    if (qualifier) ranges.push({
      start: end, end: nextEnd + qualifier[0].length,
      weekdayIndexes: [index, index + 1], scope: 'weekday',
    })
  }
  if (weekdays.length > 0) {
    for (const match of text.matchAll(/\bsemana sim,? semana nao\b/gu)) {
      const end = match.index + match[0].length
      const weekdayIndexes = weekdays.flatMap(({ match: weekday }, index) => {
        const before = weekday.index + weekday[0].length <= match.index
          && /^\s*$/u.test(text.slice(weekday.index + weekday[0].length, match.index))
        const after = weekday.index >= end
          && /^\s+(?:(?:na|no|nas|nos|as|aos|em)\s+)?$/u.test(text.slice(end, weekday.index))
        return before || after ? [index] : []
      })
      ranges.push({ start: match.index, end, weekdayIndexes, scope: 'list' })
    }
  }
  return ranges
}

function getAlternatingWeekdayIndexes(text: string, weekdays: ReturnType<typeof matchWeekdays>, range: WeekdayAlternation): Set<number> {
  const indexes = new Set(range.weekdayIndexes)
  if (range.scope === 'weekday') return indexes
  for (const direction of range.scope === 'list' ? [-1, 1] : [1]) {
    for (const index of indexes) {
      const adjacent = index + direction
      if (!weekdays[adjacent]) continue
      const left = weekdays[Math.min(index, adjacent)]!.match
      const right = weekdays[Math.max(index, adjacent)]!.match
      if (/^\s*,?\s*(?:(?:and|e)\s+)?$/u.test(text.slice(left.index + left[0].length, right.index))) indexes.add(adjacent)
    }
  }
  return indexes
}

function extractAlternatingWeekdays(text: string, phrase: NormalizedPhrase, patterns: LocalePatterns, locale: SupportedLocale) {
  const weekdays = matchWeekdays(text, patterns)
  const ranges: WeekdayAlternation[] = locale === 'pt-BR'
    ? matchPortugueseAlternation(text, patterns)
    : weekdays.flatMap(({ match }, index) => {
      const qualifier = /\bevery other $/u.exec(text.slice(0, match.index))
      return qualifier ? [{ start: qualifier.index, end: match.index, weekdayIndexes: [index], scope: 'following' }] : []
    })
  const governed = new Set(ranges.flatMap((range) => [...getAlternatingWeekdayIndexes(text, weekdays, range)]))
  const consumed: HabitPhraseToken[] = []
  let remaining = text
  for (const { start, end } of ranges) {
    consumed.push({ start: phrase.originalStarts[start]!, end: phrase.originalEnds[end - 1]!, kind: 'interval' })
    remaining = maskRange(remaining, start, end)
  }
  return { consumed, remaining, mixed: ranges.length > 0 && governed.size !== weekdays.length }
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
): { days: string[]; consumed: HabitPhraseToken[]; dailyPeriod?: DayPeriod } | 'unresolved' | null {
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
  return { days, consumed, dailyPeriod: daily ? PERIOD_OF_DAILY_WORD[daily[1]!] : undefined }
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
  dueTime: string | null,
  consumed: HabitPhraseToken[],
): HabitPhraseRead {
  const resolved = exclusion !== 'unresolved'
  return {
    cadence: resolved ? 'fixed' : null, days: resolved ? exclusion.days : [], monthDays: [],
    frequencyQuantity: null, intervalWeeks: null, dueTime,
    consumed: resolved
      ? [...consumed, ...exclusion.consumed.flatMap((token) => subtractConsumedTokens(token, consumed))].sort((left, right) => left.start - right.start)
      : consumed,
  }
}

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function isWeekdayRangeGlue(glue: string): boolean {
  const rest = glue.replace(WEEKDAY_GLUE_LEAD, '')
  if (WEEKDAY_DASH_GLUE.test(rest)) return true
  const words = WEEKDAY_WORD_GLUE.exec(rest)?.[1]
  return words !== undefined && WEEKDAY_RANGE_WORDS.has(words.split(/\s+/u).join(' '))
}

function isWeekdayRangeLink(text: string, weekdays: ReturnType<typeof matchWeekdays>, index: number): boolean {
  const left = weekdays[index]?.match
  const right = weekdays[index + 1]?.match
  if (!left || !right) return false
  const glue = text.slice(left.index + left[0].length, right.index)
  if (!isWeekdayRangeGlue(glue)) return false
  return !ARTICLE_GLUE.test(glue) || RANGE_OPENER.test(text.slice(0, left.index))
}

function startsIsolatedWeekdayRange(text: string, weekdays: ReturnType<typeof matchWeekdays>, index: number): boolean {
  return isWeekdayRangeLink(text, weekdays, index)
    && !isWeekdayRangeLink(text, weekdays, index - 1)
    && !isWeekdayRangeLink(text, weekdays, index + 1)
}

function expandWeekdayRanges(text: string, weekdays: ReturnType<typeof matchWeekdays>): string[] {
  const days: string[] = []
  for (const [index, { day }] of weekdays.entries()) {
    if (startsIsolatedWeekdayRange(text, weekdays, index - 1)) continue
    days.push(day)
    if (!startsIsolatedWeekdayRange(text, weekdays, index)) continue
    const from = WEEK_ORDER.indexOf(day)
    const span = (WEEK_ORDER.indexOf(weekdays[index + 1]!.day) - from + 7) % 7
    const length = span === 0 ? 6 : span
    for (let step = 1; step <= length; step += 1) days.push(WEEK_ORDER[(from + step) % 7]!)
  }
  return days
}

function readFixedWeekdays(remaining: string, phrase: NormalizedPhrase, patterns: LocalePatterns, weekdayMatches: ReturnType<typeof matchWeekdays>) {
  const consumed: HabitPhraseToken[] = []
  for (const [index, { match }] of weekdayMatches.entries()) {
    if (startsIsolatedWeekdayRange(remaining, weekdayMatches, index - 1)) continue
    const closing = startsIsolatedWeekdayRange(remaining, weekdayMatches, index) ? weekdayMatches[index + 1]!.match : match
    consumed.push({ ...toToken(phrase, match, 'weekday'), end: toToken(phrase, closing, 'weekday').end })
    const weekdayEnd = closing.index + closing[0].length
    const suffix = patterns.weeklySuffix.exec(remaining.slice(weekdayEnd))
    if (!suffix) continue
    const end = weekdayEnd + suffix[0].length
    consumed.push({ start: phrase.originalStarts[end - suffix[1]!.length]!, end: phrase.originalEnds[end - 1]!, kind: 'interval' })
  }
  return { days: [...new Set(expandWeekdayRanges(remaining, weekdayMatches))], consumed }
}

function extractCadence(remaining: string, phrase: NormalizedPhrase, patterns: LocalePatterns) {
  const consumed: HabitPhraseToken[] = []
  const weekdayMatches = matchWeekdays(remaining, patterns)

  let cadence: HabitPhraseCadence | null = null
  let days: string[] = []
  let frequencyQuantity: number | null = null
  let dailyPeriod: DayPeriod | undefined
  if (weekdayMatches.length > 0) {
    cadence = 'fixed'
    const fixed = readFixedWeekdays(remaining, phrase, patterns, weekdayMatches)
    days = fixed.days
    consumed.push(...fixed.consumed)
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
        dailyPeriod = PERIOD_OF_DAILY_WORD[dailyMatch[1]!]
        consumed.push(toToken(phrase, dailyMatch, 'daily'))
      }
    }
  }

  return { cadence, days, frequencyQuantity, dailyPeriod, consumed }
}

export function readHabitPhrase(text: string, locale: SupportedLocale): HabitPhraseRead {
  const phrase = normalizePhrase(text)
  const patterns = LOCALE_PATTERNS[locale]
  let remaining = phrase.text
  const consumed: HabitPhraseToken[] = []
  const time = extractTime(remaining, phrase, patterns)
  let dueTime = time.dueTime
  if (time.token) consumed.push(time.token)
  remaining = time.remaining

  const monthDays = extractMonthDays(remaining, phrase, patterns)
  if (monthDays) return buildMonthDayRead(monthDays, patterns, dueTime, consumed)

  const alternating = extractAlternatingWeekdays(remaining, phrase, patterns, locale)
  if (alternating.mixed) return buildWeekdayExclusionRead('unresolved', dueTime, consumed)
  remaining = alternating.remaining
  if (hasUnmodeledWeekday(remaining, patterns)) return buildWeekdayExclusionRead('unresolved', dueTime, consumed)
  const exclusion = readWeekdayExclusion(remaining, phrase, patterns, locale)
  if (exclusion) {
    const read = alternating.consumed.length > 0 ? 'unresolved' : exclusion
    const period = read === 'unresolved' ? undefined : read.dailyPeriod
    return buildWeekdayExclusionRead(read, applyDailyPeriod(time.match, dueTime, period), consumed)
  }

  const interval = extractInterval(remaining, phrase, patterns)
  const hasAlternation = alternating.consumed.length > 0
  if (hasAlternation && interval.intervalWeeks !== null && interval.intervalWeeks !== 2) {
    return buildWeekdayExclusionRead('unresolved', dueTime, consumed)
  }
  const intervalWeeks = hasAlternation ? 2 : interval.intervalWeeks
  consumed.push(...alternating.consumed)
  if (interval.token) consumed.push(interval.token)
  remaining = interval.remaining

  const cadenceRead = extractCadence(remaining, phrase, patterns)
  dueTime = applyDailyPeriod(time.match, dueTime, cadenceRead.dailyPeriod)
  consumed.sort((left, right) => left.start - right.start)
  consumed.push(...cadenceRead.consumed.flatMap((token) => subtractConsumedTokens(token, consumed)))

  consumed.sort((left, right) => left.start - right.start)
  return {
    cadence: cadenceRead.cadence,
    days: cadenceRead.days,
    monthDays: [],
    frequencyQuantity: cadenceRead.frequencyQuantity,
    intervalWeeks,
    dueTime,
    consumed,
  }
}

/** The one rule for a repeat in the words: a cadence, or a bare interval such as "every 2 weeks". The guided flow and onboarding both read it here. */
export function habitPhraseRepeats(read: Pick<HabitPhraseRead, 'cadence' | 'intervalWeeks'>): boolean {
  return read.cadence !== null || read.intervalWeeks !== null
}

/** The repeat a habit form takes from the words. Only the guided flow takes a bare interval; the full form applies a cadence alone and keeps the interval words in the title. */
export function habitPhraseFormRepeats(read: Pick<HabitPhraseRead, 'cadence' | 'intervalWeeks'>, readsBareInterval: boolean): boolean {
  return readsBareInterval ? habitPhraseRepeats(read) : read.cadence !== null
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
  return { ...read, cadence: null, days: [], monthDays: [], frequencyQuantity: null, intervalWeeks: null,
    dueTime: general ? null : read.dueTime,
    consumed: general ? [] : read.consumed.filter((token) => token.kind === 'time') }
}

export function isWeeklyRecurrencePhrase(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/gu, ' ')
  return /^[.!?,;:]*\s*(?:toda semana|todas as semanas|semanalmente|every week|weekly)\s*[.!?,;:]*$/u.test(normalized)
}

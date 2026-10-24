export interface DatePhraseContext {
  referenceDate: string
  locale: string
  timeZone: string | null | undefined
}

export type DatePhraseResult = { status: 'resolved'; date: string } | {
  status: 'empty' | 'invalid' | 'ambiguous' | 'unsupported' | 'unavailable'
}

const MONTHS = [
  ['january', 'janeiro'], ['february', 'fevereiro'], ['march', 'marco'],
  ['april', 'abril'], ['may', 'maio'], ['june', 'junho'], ['july', 'julho'],
  ['august', 'agosto'], ['september', 'setembro'], ['october', 'outubro'],
  ['november', 'novembro'], ['december', 'dezembro'],
]

function monthLength(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function calendarDate(year: number, month: number, day: number): string | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > monthLength(year, month)) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  return calendarDate(year, month, day) === value
}

function resolved(date: string | null): DatePhraseResult {
  return date ? { status: 'resolved', date } : { status: 'invalid' }
}

function nextDayOfMonth(day: number, referenceDate: string): DatePhraseResult {
  if (day < 1 || day > 31) return { status: 'invalid' }
  const [year = 0, month = 0] = referenceDate.split('-').map(Number)
  for (let offset = 0; offset < 24; offset++) {
    const candidateMonth = month - 1 + offset
    const candidate = calendarDate(year + Math.floor(candidateMonth / 12), candidateMonth % 12 + 1, day)
    if (candidate && candidate >= referenceDate) return resolved(candidate)
  }
  return { status: 'invalid' }
}

function namedDate(phrase: string, referenceDate: string): DatePhraseResult | null {
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?(?: de)? ([a-z]+)(?:(?: de)? (\d{4}))?$/.exec(phrase)
  const monthFirst = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(phrase)
  if (!dayFirst && !monthFirst) return null
  const day = Number(dayFirst?.[1] ?? monthFirst?.[2])
  const name = dayFirst?.[2] ?? monthFirst?.[1]
  const month = MONTHS.findIndex((names) => names.includes(name ?? '')) + 1
  if (!month) return null
  const explicitYear = dayFirst?.[3] ?? monthFirst?.[3]
  if (explicitYear) return resolved(calendarDate(Number(explicitYear), month, day))
  if (day < 1 || day > monthLength(2000, month)) return { status: 'invalid' }
  const year = Number(referenceDate.slice(0, 4))
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = calendarDate(year + offset, month, day)
    if (candidate && candidate >= referenceDate) return resolved(candidate)
  }
  return { status: 'invalid' }
}

export function parseDatePhrase(input: string, context: DatePhraseContext): DatePhraseResult {
  const phrase = input.trim().toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').replaceAll(/\s+/g, ' ')
  if (!phrase) return { status: 'empty' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(phrase)) return isCalendarDate(phrase) ? resolved(phrase) : { status: 'invalid' }
  if (/\d+[/.\-]\d+/.test(phrase)) return { status: 'ambiguous' }
  if (context.timeZone === undefined || !isCalendarDate(context.referenceDate)) return { status: 'unavailable' }
  if (phrase === 'today' || phrase === 'hoje') return resolved(context.referenceDate)
  if (phrase === 'next week' || phrase === 'proxima semana' || phrase === 'semana que vem') {
    const [year = 0, month = 0, day = 0] = context.referenceDate.split('-').map(Number)
    const calendar = new Date(0)
    calendar.setUTCFullYear(year, month - 1, day)
    calendar.setUTCDate(day + (8 - (calendar.getUTCDay() || 7)))
    return resolved(calendarDate(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate()))
  }
  const offset = /^(?:in (\d+) days?|em (\d+) dias?)$/.exec(phrase)
  if (phrase === 'tomorrow' || phrase === 'amanha' || offset) {
    const days = offset ? Number(offset[1] ?? offset[2]) : 1
    if (days > 36600) return { status: 'invalid' }
    const [year = 0, month = 0, day = 0] = context.referenceDate.split('-').map(Number)
    const calendar = new Date(0)
    calendar.setUTCFullYear(year, month - 1, day + days)
    return resolved(calendarDate(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate()))
  }
  const bareDay = /^(?:dia (\d{1,2})|(?:on )?the (\d{1,2})(?:st|nd|rd|th)?)$/.exec(phrase)
  if (bareDay) return nextDayOfMonth(Number(bareDay[1] ?? bareDay[2]), context.referenceDate)
  return namedDate(phrase, context.referenceDate) ?? { status: 'unsupported' }
}

import { addDays } from 'date-fns'
import { formatAPIDate, parseAPIDate } from './dates'
import { parseDatePhrase, readDateWeekday } from './date-phrase-parser'

export interface CalendarJumpContext {
  /** The first day of the month the picker opened on, `yyyy-MM-dd`. A bare day such as "dia 20" reads inside it. */
  readonly monthStart: string
  readonly todayKey: string
  readonly locale: string
  readonly timeZone: string | null | undefined
}

const BARE_DAY = /^(?:dia \d{1,2}|(?:on )?the \d{1,2}(?:st|nd|rd|th)?)$/
const MAX_WEEKDAY_SEARCH = 24

function weekdayOf(date: string): number {
  return parseAPIDate(date).getDay()
}

function splitWeekday(input: string): { weekday: number | null; phrase: string } {
  const comma = input.indexOf(',')
  if (comma < 0) return { weekday: null, phrase: input.trim() }
  const weekday = readDateWeekday(input.slice(0, comma))
  return weekday === null ? { weekday: null, phrase: input.trim() } : { weekday, phrase: input.slice(comma + 1).trim() }
}

/** The date a typed phrase in the month picker names, read on the device with the habit form parser. "dia 20" is day 20 of the shown month; "sexta, dia 20" is the first day 20 from that month that falls on a Friday. Returns null when the text does not resolve. */
export function resolveCalendarJumpPhrase(input: string, context: CalendarJumpContext): string | null {
  const { weekday, phrase } = splitWeekday(input)
  let referenceDate = BARE_DAY.test(phrase.toLowerCase().replaceAll(/\s+/g, ' ')) ? context.monthStart : context.todayKey
  for (let attempt = 0; attempt < MAX_WEEKDAY_SEARCH; attempt++) {
    const result = parseDatePhrase(phrase, { referenceDate, locale: context.locale, timeZone: context.timeZone })
    if (result.status !== 'resolved') return null
    if (weekday === null || weekdayOf(result.date) === weekday) return result.date
    referenceDate = formatAPIDate(addDays(parseAPIDate(result.date), 1))
  }
  return null
}

import type { BulkCreateRequest, FrequencyUnit } from '../types/habit'
import type {
  CalendarAutoSyncState,
  CalendarAutoSyncStatus,
  CalendarSyncSuggestion,
} from '../types/calendar'
import { plural } from './plural'

export const CALENDAR_RECONNECT_REQUIRED_ERROR_CODE = 'CALENDAR_RECONNECT_REQUIRED'
export const CALENDAR_NOT_CONNECTED_ERROR_CODE = 'CALENDAR_NOT_CONNECTED'

export interface CalendarSyncEvent {
  id: string
  title: string
  description: string | null
  startDate: string | null
  startTime: string | null
  startUtc?: string | null
  endTime: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  reminders: number[]
  calendarId?: string
  calendarName?: string
}

export function filterCalendarSyncEventsByDate(
  events: CalendarSyncEvent[],
  date: string | null,
): CalendarSyncEvent[] {
  if (!date) return []
  return events.filter((event) => event.startDate === date)
}

export interface CalendarSyncParsedRecurrence {
  frequencyUnit?: FrequencyUnit
  frequencyQuantity?: number
  days?: string[]
}

export type CalendarSyncImportIssue =
  | 'weekday-interval'
  | 'ordinal-weekday'
  | 'finite-date-clamp'
  | 'finite-date-range'
  | 'utc-until-offset-shift'

export type CalendarSyncImportIssueMessageKey =
  | 'calendar.importIssue.weekdayInterval'
  | 'calendar.importIssue.ordinalWeekday'
  | 'calendar.importIssue.finiteDateClamp'
  | 'calendar.importIssue.finiteDateRange'
  | 'calendar.importIssue.utcUntilOffsetShift'

export interface CalendarSyncTranslationAdapter {
  translate: (key: string, values?: Record<string, unknown>) => string
  pluralize: (text: string, count: number) => string
}

const FREQUENCY_UNIT_MAP: Record<string, FrequencyUnit> = {
  DAILY: 'Day',
  WEEKLY: 'Week',
  MONTHLY: 'Month',
  YEARLY: 'Year',
}

const WEEKDAY_DEFINITION: Record<string, { name: string; index: number }> = {
  MO: { name: 'Monday', index: 1 },
  TU: { name: 'Tuesday', index: 2 },
  WE: { name: 'Wednesday', index: 3 },
  TH: { name: 'Thursday', index: 4 },
  FR: { name: 'Friday', index: 5 },
  SA: { name: 'Saturday', index: 6 },
  SU: { name: 'Sunday', index: 0 },
}

const ORDINAL_WEEKDAY_PATTERN = /^[+-]?\d+(?:MO|TU|WE|TH|FR|SA|SU)$/

function parseRuleParts(rule: string): Record<string, string> {
  return Object.fromEntries(
    rule
      .replace('RRULE:', '')
      .split(';')
      .map((part) => {
        const [key, value] = part.split('=')
        return key ? [key, value ?? ''] as const : null
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function parseRecurrenceInterval(rule: string): number {
  const intervalMatch = /INTERVAL=(\d+)/.exec(rule)
  return intervalMatch?.[1] ? Number.parseInt(intervalMatch[1], 10) : 1
}

function formatIntervalRecurrence(
  interval: number,
  singularKey: string,
  pluralKey: string,
  translate: CalendarSyncTranslationAdapter['translate'],
  pluralize: CalendarSyncTranslationAdapter['pluralize'],
): string {
  if (interval <= 1) {
    return translate(singularKey)
  }

  return pluralize(translate(pluralKey, { n: interval }), interval)
}

function resolveRecurrenceQuantity(
  recurrence: CalendarSyncParsedRecurrence,
): number | null {
  if (!recurrence.frequencyUnit) return null
  if (recurrence.frequencyQuantity && recurrence.frequencyQuantity >= 1) {
    return recurrence.frequencyQuantity
  }

  return 1
}

function resolveRecurrenceType(rule: string): 'daily' | 'weekly' | 'monthly' | 'yearly' | null {
  if (rule.includes('FREQ=DAILY')) return 'daily'
  if (rule.includes('FREQ=WEEKLY')) return 'weekly'
  if (rule.includes('FREQ=MONTHLY')) return 'monthly'
  if (rule.includes('FREQ=YEARLY')) return 'yearly'
  return null
}

function formatWeeklyRecurrence(
  rule: string,
  interval: number,
  { translate, pluralize }: CalendarSyncTranslationAdapter,
): string {
  const dayMatch = /BYDAY=([A-Z,]+)/.exec(rule)
  const days = dayMatch ? dayMatch[1] : ''

  if (interval > 1) {
    const base = pluralize(translate('calendar.recurrenceEveryNWeeks', { n: interval }), interval)
    return days ? `${base} (${days})` : base
  }

  if (days) return translate('calendar.recurrenceWeeklyDays', { days })
  return translate('calendar.recurrenceWeekly')
}

export function parseCalendarSyncRecurrence(
  rule: string | null,
): CalendarSyncParsedRecurrence {
  return resolveCalendarSyncRule(rule).recurrence
}

interface CalendarSyncRuleResolution {
  parts: Record<string, string>
  recurrence: CalendarSyncParsedRecurrence
  weekdayTokens: string[]
  weekdayIndexes: number[]
  hasWeekdays: boolean
}

function resolveCalendarSyncRule(rule: string | null): CalendarSyncRuleResolution {
  if (!rule) {
    return {
      parts: {},
      recurrence: {},
      weekdayTokens: [],
      weekdayIndexes: [],
      hasWeekdays: false,
    }
  }

  const parts = parseRuleParts(rule)
  const result: CalendarSyncParsedRecurrence = {}

  if (parts.FREQ && parts.FREQ in FREQUENCY_UNIT_MAP) {
    result.frequencyUnit = FREQUENCY_UNIT_MAP[parts.FREQ]
  }

  if (parts.INTERVAL) {
    const parsed = Number.parseInt(parts.INTERVAL, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      result.frequencyQuantity = parsed
    }
  } else if (result.frequencyUnit) {
    result.frequencyQuantity = 1
  }

  const weekdayTokens = parts.BYDAY?.split(',').map((day) => day.trim()) ?? []
  if (weekdayTokens.length > 0) {
    const days = weekdayTokens
      .map((day) => WEEKDAY_DEFINITION[day]?.name)
      .filter((day): day is string => !!day)

    if (days.length > 0) {
      result.days = days
    }
  }

  const weekdayIndexes = [...new Set(
    weekdayTokens
      .map((token) => WEEKDAY_DEFINITION[token]?.index)
      .filter((weekday): weekday is number => weekday !== undefined),
  )].sort((left, right) => left - right)

  return {
    parts,
    recurrence: result,
    weekdayTokens,
    weekdayIndexes,
    hasWeekdays: result.days !== undefined && result.days.length > 0,
  }
}

const ISO_DATE_LENGTH = 10
const DAYS_IN_WEEK = 7
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const SECONDS_PER_DAY = 24 * 60 * 60
const MAX_RECURRING_OFFSET_SHIFT_SECONDS = 2 * 60 * 60
const MAX_CALENDAR_SYNC_YEAR = 9999
const MAX_CALENDAR_SYNC_MONTH = MAX_CALENDAR_SYNC_YEAR * 12 + 11
const MAX_CALENDAR_SYNC_DATE = Date.UTC(MAX_CALENDAR_SYNC_YEAR, 11, 31)

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH)
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null
}

interface FiniteDateWalkResult {
  endDate: string
  skippedCandidate: boolean
}

function walkMonthlyOrYearlyDates(
  parts: Record<string, string>,
  start: Date,
  count: number | null,
  inclusiveEnd: Date | null = null,
): FiniteDateWalkResult {
  const interval = parsePositiveInteger(parts.INTERVAL) ?? 1
  const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth()
  const startDay = start.getUTCDate()
  const monthStep = parts.FREQ === 'MONTHLY' ? interval : interval * 12
  let endDate = start
  let seen = 1
  let skippedCandidate = false
  let monthNumber = startMonth

  while ((count === null || seen < count) && monthNumber <= MAX_CALENDAR_SYNC_MONTH - monthStep) {
    monthNumber += monthStep
    const year = Math.floor(monthNumber / 12)
    const month = monthNumber % 12
    const candidate = new Date(Date.UTC(year, month, startDay))
    const isValid = candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month
    const comparisonDate = isValid ? candidate : new Date(Date.UTC(year, month + 1, 0))
    if (inclusiveEnd && comparisonDate > inclusiveEnd) break

    if (!isValid) {
      skippedCandidate = true
      continue
    }

    endDate = candidate
    seen += 1
  }

  return { endDate: formatUtcDate(endDate), skippedCandidate }
}

function resolveWeekdayCountOffset(
  startWeekday: number,
  weekdays: number[],
  count: number,
): number {
  const firstWeekOffsets = weekdays
    .filter((weekday) => weekday >= startWeekday)
    .map((weekday) => weekday - startWeekday)
  if (count <= firstWeekOffsets.length) return firstWeekOffsets[count - 1] ?? 0

  const remaining = count - firstWeekOffsets.length
  const fullWeeks = Math.floor((remaining - 1) / weekdays.length)
  const finalWeekday = weekdays[(remaining - 1) % weekdays.length] ?? 0
  return DAYS_IN_WEEK - startWeekday + fullWeeks * DAYS_IN_WEEK + finalWeekday
}

function isUntilBeyondCalendarSyncRange(until: string): boolean {
  const match = /^\+?(\d{4,})(\d{2})(\d{2})(?:T\d{6}Z)?$/.exec(until)
  return match?.[1] !== undefined && Number(match[1]) > MAX_CALENDAR_SYNC_YEAR
}

function hasFiniteDateRangeIssue(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
): boolean {
  const { parts, weekdayIndexes, hasWeekdays } = resolution
  if (parts.UNTIL && isUntilBeyondCalendarSyncRange(parts.UNTIL)) return true
  if (!parts.COUNT || !startDate) return false

  const count = parsePositiveInteger(parts.COUNT)
  if (!count || count === 1) return false
  const start = new Date(`${startDate.slice(0, ISO_DATE_LENGTH)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return false

  const interval = parsePositiveInteger(parts.INTERVAL) ?? 1
  if (hasWeekdays) {
    const offsetDays = resolveWeekdayCountOffset(start.getUTCDay(), weekdayIndexes, count)
    const remainingDays = Math.floor((MAX_CALENDAR_SYNC_DATE - start.getTime()) / MILLISECONDS_PER_DAY)
    return !Number.isFinite(offsetDays) || offsetDays > remainingDays
  }

  if (parts.FREQ === 'MONTHLY' || parts.FREQ === 'YEARLY') {
    const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth()
    const frequencyMonths = parts.FREQ === 'MONTHLY' ? 1 : 12
    const lastCandidateMonth = startMonth + (count - 1) * interval * frequencyMonths
    return !Number.isFinite(lastCandidateMonth) || lastCandidateMonth > MAX_CALENDAR_SYNC_MONTH
  }

  const offsetDays = (count - 1) * interval * (parts.FREQ === 'WEEKLY' ? DAYS_IN_WEEK : 1)
  const remainingDays = Math.floor((MAX_CALENDAR_SYNC_DATE - start.getTime()) / MILLISECONDS_PER_DAY)
  return !Number.isFinite(offsetDays) || offsetDays > remainingDays
}

function resolveUnfilteredCountEndDate(
  parts: Record<string, string>,
  start: Date,
  count: number,
): FiniteDateWalkResult {
  if (parts.FREQ === 'MONTHLY' || parts.FREQ === 'YEARLY') {
    return walkMonthlyOrYearlyDates(parts, start, count)
  }

  const interval = parsePositiveInteger(parts.INTERVAL) ?? 1
  const cursor = new Date(start)
  const frequencyDays = parts.FREQ === 'WEEKLY' ? DAYS_IN_WEEK : 1
  cursor.setUTCDate(cursor.getUTCDate() + (count - 1) * interval * frequencyDays)
  return { endDate: formatUtcDate(cursor), skippedCandidate: false }
}

function parseUtcUntil(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day || instant.getUTCHours() !== hour
    || instant.getUTCMinutes() !== minute || instant.getUTCSeconds() !== second) return null
  return instant
}

interface UtcUntilContext {
  localBound: Date
  occurrenceSeconds: number
}

function resolveUtcUntilContext(
  untilUtc: Date,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): UtcUntilContext | null {
  const localStartMatch = startDate && startTime
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(`${startDate}T${startTime}`)
    : null
  const startInstant = startUtc ? new Date(startUtc) : null
  if (!localStartMatch || !startInstant || Number.isNaN(startInstant.getTime())) return null

  const [, year, month, day, hour, minute, second = '0'] = localStartMatch
  const localStartAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const offset = localStartAsUtc - startInstant.getTime()
  return {
    localBound: new Date(untilUtc.getTime() + offset),
    occurrenceSeconds: Number(hour) * 3600 + Number(minute) * 60 + Number(second),
  }
}

function resolveUtcUntilDate(
  until: string,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): string | null {
  if (/^\d{8}$/.test(until)) {
    return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
  }

  const untilUtc = parseUtcUntil(until)
  if (!untilUtc) return null
  const utcDate = formatUtcDate(untilUtc)
  const context = resolveUtcUntilContext(untilUtc, startDate, startTime, startUtc)
  if (!context) return utcDate

  const { localBound, occurrenceSeconds } = context
  const boundSeconds = localBound.getUTCHours() * 3600 + localBound.getUTCMinutes() * 60 + localBound.getUTCSeconds()
  if (occurrenceSeconds > boundSeconds) localBound.setUTCDate(localBound.getUTCDate() - 1)
  return formatUtcDate(localBound)
}

/**
 * The last date a finite RRULE still fires, as an ISO date, or null when the rule never ends.
 *
 * UNTIL is already that date. COUNT is not: it is an occurrence tally, so the date has to be walked
 * from the start. Orbit stores a bound as `endDate`, so an unmapped COUNT or UNTIL becomes a habit
 * that outlives the calendar series it came from.
 */
export function resolveCalendarSyncEndDate(
  rule: string | null,
  startDate: string | null,
  startTime: string | null = null,
  startUtc?: string | null,
): string | null {
  if (!rule) return null

  return resolveCalendarSyncEndDateFromResolution(
    resolveCalendarSyncRule(rule),
    startDate,
    startTime,
    startUtc,
  )
}

function resolveCalendarSyncEndDateFromResolution(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): string | null {
  const { parts, weekdayIndexes } = resolution

  if (parts.UNTIL) {
    return resolveUtcUntilDate(parts.UNTIL, startDate, startTime, startUtc)
  }

  if (!parts.COUNT || !startDate) return null
  const count = parsePositiveInteger(parts.COUNT)
  if (!count) return null

  const start = new Date(`${startDate.slice(0, ISO_DATE_LENGTH)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return null

  if (weekdayIndexes.length === 0) {
    return resolveUnfilteredCountEndDate(parts, start, count).endDate
  }

  const offsetDays = resolveWeekdayCountOffset(start.getUTCDay(), weekdayIndexes, count)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + offsetDays)
  return formatUtcDate(end)
}

function didFiniteDateWalkSkip(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): boolean {
  const { parts, hasWeekdays } = resolution
  if ((!parts.COUNT && !parts.UNTIL) || !startDate) return false
  if (hasWeekdays) return false
  if (parts.FREQ !== 'MONTHLY' && parts.FREQ !== 'YEARLY') return false

  const start = new Date(`${startDate.slice(0, ISO_DATE_LENGTH)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return false

  if (parts.UNTIL) {
    const endDate = resolveUtcUntilDate(parts.UNTIL, startDate, startTime, startUtc)
    if (!endDate) return false
    const inclusiveEnd = new Date(`${endDate}T00:00:00Z`)
    if (Number.isNaN(inclusiveEnd.getTime())) return false
    return walkMonthlyOrYearlyDates(parts, start, null, inclusiveEnd).skippedCandidate
  }

  const count = parsePositiveInteger(parts.COUNT)
  return count
    ? resolveUnfilteredCountEndDate(parts, start, count).skippedCandidate
    : false
}

function hasUncertainUtcUntilDate(
  parts: Record<string, string>,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): boolean {
  const untilUtc = parts.UNTIL ? parseUtcUntil(parts.UNTIL) : null
  if (!untilUtc) return false
  const context = resolveUtcUntilContext(untilUtc, startDate, startTime, startUtc)
  if (!context) return false
  const boundSeconds = context.localBound.getUTCHours() * 3600
    + context.localBound.getUTCMinutes() * 60
    + context.localBound.getUTCSeconds()
  const directDistance = Math.abs(context.occurrenceSeconds - boundSeconds)
  const wrappedDistance = SECONDS_PER_DAY - directDistance
  return Math.min(directDistance, wrappedDistance) <= MAX_RECURRING_OFFSET_SHIFT_SECONDS
}

export function getCalendarSyncImportIssue(
  rule: string | null,
  startDate: string | null = null,
  startTime: string | null = null,
  startUtc?: string | null,
): CalendarSyncImportIssue | null {
  if (!rule) return null

  return getCalendarSyncImportIssueFromResolution(
    resolveCalendarSyncRule(rule),
    startDate,
    startTime,
    startUtc,
  )
}

function getCalendarSyncImportIssueFromResolution(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): CalendarSyncImportIssue | null {
  const { parts, weekdayTokens } = resolution
  const hasOrdinalPrefix = weekdayTokens.some((day) => ORDINAL_WEEKDAY_PATTERN.test(day))
  const hasPositionalSelection = weekdayTokens.length > 0 && !!parts.BYSETPOS
  if (hasOrdinalPrefix || hasPositionalSelection) {
    return 'ordinal-weekday'
  }

  const interval = parts.INTERVAL ? Number.parseInt(parts.INTERVAL, 10) : 1
  if (weekdayTokens.length > 0 && Number.isFinite(interval) && interval > 1) {
    return 'weekday-interval'
  }

  if (hasFiniteDateRangeIssue(resolution, startDate)) {
    return 'finite-date-range'
  }

  if (didFiniteDateWalkSkip(resolution, startDate, startTime, startUtc)) {
    return 'finite-date-clamp'
  }

  if (hasUncertainUtcUntilDate(parts, startDate, startTime, startUtc)) {
    return 'utc-until-offset-shift'
  }

  return null
}

export function isCalendarSyncEventImportable(event: CalendarSyncEvent): boolean {
  return getCalendarSyncImportIssue(
    event.recurrenceRule,
    event.startDate,
    event.startTime,
    event.startUtc,
  ) === null
}

export function getCalendarSyncImportIssueMessageKey(
  issue: CalendarSyncImportIssue,
): CalendarSyncImportIssueMessageKey {
  const keys: Record<CalendarSyncImportIssue, CalendarSyncImportIssueMessageKey> = {
    'weekday-interval': 'calendar.importIssue.weekdayInterval',
    'ordinal-weekday': 'calendar.importIssue.ordinalWeekday',
    'finite-date-clamp': 'calendar.importIssue.finiteDateClamp',
    'finite-date-range': 'calendar.importIssue.finiteDateRange',
    'utc-until-offset-shift': 'calendar.importIssue.utcUntilOffsetShift',
  }
  return keys[issue]
}

export function formatCalendarSyncRecurrenceLabel(
  rule: string | null,
  translations: CalendarSyncTranslationAdapter,
): string {
  if (!rule) return ''

  const upper = rule.toUpperCase()
  const interval = parseRecurrenceInterval(upper)
  const recurrenceType = resolveRecurrenceType(upper)

  switch (recurrenceType) {
    case 'daily':
      return formatIntervalRecurrence(
        interval,
        'calendar.recurrenceDaily',
        'calendar.recurrenceEveryNDays',
        translations.translate,
        translations.pluralize,
      )
    case 'weekly':
      return formatWeeklyRecurrence(upper, interval, translations)
    case 'monthly':
      return formatIntervalRecurrence(
        interval,
        'calendar.recurrenceMonthly',
        'calendar.recurrenceEveryNMonths',
        translations.translate,
        translations.pluralize,
      )
    case 'yearly':
      return translations.translate('calendar.recurrenceYearly')
    default:
      return ''
  }
}

export function isCalendarSyncNotConnectedMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('not connected') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid authentication credentials') ||
    lower.includes('google calendar') ||
    lower.includes('calendar connection') ||
    (lower.includes('reconnect') && lower.includes('calendar'))
  )
}

export function buildCalendarSyncImportRequest(
  events: CalendarSyncEvent[],
): BulkCreateRequest {
  return {
    habits: events.map((event) => {
      const resolution = resolveCalendarSyncRule(event.recurrenceRule)
      const importIssue = getCalendarSyncImportIssueFromResolution(
        resolution,
        event.startDate,
        event.startTime,
        event.startUtc,
      )
      if (importIssue) {
        throw new Error(`Unsupported calendar recurrence: ${importIssue}`)
      }

      const recurrence = resolution.recurrence
      const days = recurrence.days ?? null
      const { hasWeekdays } = resolution
      const quantity = hasWeekdays ? 1 : resolveRecurrenceQuantity(recurrence)
      const reminderTimes = event.reminders.length > 0 ? event.reminders : null

      return {
        title: event.title,
        description: event.description,
        dueDate: event.startDate,
        dueTime: event.startTime,
        dueEndTime: event.endTime,
        frequencyUnit: hasWeekdays ? 'Day' : (recurrence.frequencyUnit ?? null),
        frequencyQuantity: quantity,
        days,
        endDate: resolveCalendarSyncEndDateFromResolution(
          resolution,
          event.startDate,
          event.startTime,
          event.startUtc,
        ),
        reminderEnabled: event.reminders.length > 0,
        reminderTimes,
        googleEventId: event.id,
      }
    }),
    fromSyncReview: true,
  }
}

export function buildCalendarAutoSyncImportRequest(
  suggestions: CalendarSyncSuggestion[],
): BulkCreateRequest {
  return buildCalendarSyncImportRequest(suggestions.map((s) => s.event))
}

export function isCalendarAutoSyncStatusReconnectRequired(
  status: CalendarAutoSyncStatus | null | undefined,
): boolean {
  return status === 'ReconnectRequired'
}

export function reconcileCalendarAutoSyncGrantRevocation(
  current: CalendarAutoSyncState | undefined,
): CalendarAutoSyncState {
  return {
    enabled: false,
    status: 'ReconnectRequired',
    lastSyncedAt: current?.lastSyncedAt ?? null,
    hasGoogleConnection: false,
  }
}

export type CalendarEventsGrantRevocationAction = 'cancel-state-read' | 'reconcile' | null

export function resolveCalendarEventsGrantRevocation(
  errorCode: string | undefined,
  current: CalendarAutoSyncState | undefined,
): CalendarEventsGrantRevocationAction {
  if (errorCode === CALENDAR_RECONNECT_REQUIRED_ERROR_CODE) return 'reconcile'
  if (errorCode !== CALENDAR_NOT_CONNECTED_ERROR_CODE) return null
  return current?.hasGoogleConnection === true ? 'reconcile' : 'cancel-state-read'
}

export function isCalendarSyncConnectionActive(
  hasGoogleConnection: boolean,
  status: CalendarAutoSyncStatus,
): boolean {
  return hasGoogleConnection && status !== 'ReconnectRequired'
}

export function getCalendarSyncClockValue(isoTimestamp: string | null): string | null {
  if (!isoTimestamp) return null
  const syncedAt = new Date(isoTimestamp)
  if (Number.isNaN(syncedAt.getTime())) return null
  const hours = String(syncedAt.getHours()).padStart(2, '0')
  const minutes = String(syncedAt.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Formats a "last synced at" timestamp into a human-readable label.
 * The translate function must handle the 'calendar.autoSync.lastSyncedNever'
 * and relative-time keys.
 */
export function formatCalendarAutoSyncLastSynced(
  isoTimestamp: string | null,
  translate: (key: string, values?: Record<string, string | number>) => string,
  now: Date = new Date(),
): string {
  if (!isoTimestamp) return translate('calendar.autoSync.lastSyncedNever')

  const then = new Date(isoTimestamp)
  if (Number.isNaN(then.getTime())) return translate('calendar.autoSync.lastSyncedNever')

  const deltaMs = now.getTime() - then.getTime()
  const deltaMinutes = Math.floor(deltaMs / 60_000)

  if (deltaMinutes < 1) return translate('calendar.autoSync.lastSyncedJustNow')
  if (deltaMinutes < 60)
    return plural(
      translate('calendar.autoSync.lastSyncedMinutesAgo', { n: deltaMinutes }),
      deltaMinutes,
    )

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24)
    return plural(
      translate('calendar.autoSync.lastSyncedHoursAgo', { n: deltaHours }),
      deltaHours,
    )

  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays === 1) return translate('calendar.autoSync.lastSyncedYesterday')
  return plural(
    translate('calendar.autoSync.lastSyncedDaysAgo', { n: deltaDays }),
    deltaDays,
  )
}

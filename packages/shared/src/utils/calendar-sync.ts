import { MAX_HABIT_INTERVAL_WEEKS, type BulkCreateRequest, type FrequencyUnit } from '../types/habit'
import type {
  CalendarAutoSyncState,
  CalendarAutoSyncStatus,
  CalendarSyncEvent,
  CalendarSyncSuggestion,
} from '../types/calendar'
import { plural } from './plural'
import { formatLocaleDateTime, resolveHourCycle } from './locale-format'

export const CALENDAR_RECONNECT_REQUIRED_ERROR_CODE = 'CALENDAR_RECONNECT_REQUIRED'
export const CALENDAR_NOT_CONNECTED_ERROR_CODE = 'CALENDAR_NOT_CONNECTED'

export type { CalendarSyncEvent } from '../types/calendar'

export function filterCalendarSyncEventsByDate(
  events: CalendarSyncEvent[],
  date: string | null,
): CalendarSyncEvent[] {
  if (!date) return []
  return events.filter((event) => event.startDate === date)
}

export function resolveCalendarImportEvents(
  reviewMode: boolean,
  suggestions: readonly CalendarSyncSuggestion[],
  eventsResult: { status: 'connected'; events: CalendarSyncEvent[] } | { status: 'not-connected' } | undefined,
): CalendarSyncEvent[] {
  if (reviewMode) return suggestions.map((suggestion) => suggestion.event)
  if (eventsResult?.status !== 'connected') return []
  return eventsResult.events.filter((event) => !event.isImported)
}

export function calendarImportEventsKey(
  reviewMode: boolean,
  weekStartDay: 0 | 1,
  events: readonly CalendarSyncEvent[],
): string {
  return `${reviewMode ? 'review' : 'manual'}:${weekStartDay}:${events.map((event) => event.id).join('|')}`
}

export function resolveCalendarImportSelection(
  initialEventId: string | null,
  reviewMode: boolean,
  events: readonly CalendarSyncEvent[],
  weekStartDay: 0 | 1,
  previousSelection: ReadonlySet<string>,
  previousEventsKey: string | null,
): Set<string> {
  const initialSelection = selectInitialCalendarImportEvent(initialEventId, reviewMode, events, weekStartDay)
  if (initialSelection) return initialSelection
  const importableEvents = events.filter((event) => isCalendarSyncEventImportable(event, weekStartDay))
  if (reviewMode && previousEventsKey !== null) {
    return new Set(importableEvents.filter((event) => previousSelection.has(event.id)).map((event) => event.id))
  }
  return new Set(importableEvents.map((event) => event.id))
}

export async function runCalendarSyncNowWithFeedback(
  run: () => Promise<unknown>,
  reportFailure: (error: unknown) => void,
  getAccountGeneration: () => number,
): Promise<void> {
  const requestGeneration = getAccountGeneration()
  try {
    await run()
  } catch (error: unknown) {
    if (getAccountGeneration() === requestGeneration) reportFailure(error)
  }
}

export interface CalendarSyncParsedRecurrence {
  frequencyUnit?: FrequencyUnit
  frequencyQuantity?: number
  days?: string[]
  intervalWeeks?: number
}

export type CalendarSyncImportIssue = 'utc-until-offset-shift'

export type CalendarSyncImportIssueMessageKey = 'calendar.importIssue.utcUntilOffsetShift'

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

export function parseCalendarSyncRecurrence(
  rule: string | null,
): CalendarSyncParsedRecurrence {
  return resolveCalendarSyncRule(rule).recurrence
}

interface CalendarSyncRuleResolution {
  parts: Record<string, string>
  recurrence: CalendarSyncParsedRecurrence
  weekdayIndexes: number[]
  hasWeekdays: boolean
}

function assignRecurrenceInterval(
  parts: Record<string, string>,
  recurrence: CalendarSyncParsedRecurrence,
): void {
  if (!parts.INTERVAL) {
    if (recurrence.frequencyUnit) recurrence.frequencyQuantity = 1
    return
  }

  const parsed = Number.parseInt(parts.INTERVAL, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return

  if (parts.FREQ === 'WEEKLY' && recurrence.days) {
    recurrence.frequencyQuantity = 1
    recurrence.intervalWeeks = parsed
  } else {
    recurrence.frequencyQuantity = parsed
  }
}

function resolveCalendarSyncRule(rule: string | null): CalendarSyncRuleResolution {
  if (!rule) {
    return {
      parts: {},
      recurrence: {},
      weekdayIndexes: [],
      hasWeekdays: false,
    }
  }

  const parts = parseRuleParts(rule)
  const result: CalendarSyncParsedRecurrence = {}

  if (parts.FREQ && parts.FREQ in FREQUENCY_UNIT_MAP) {
    result.frequencyUnit = FREQUENCY_UNIT_MAP[parts.FREQ]
  }

  const weekdayTokens = parts.BYDAY?.split(',').map((day) => day.trim()) ?? []
  const interval = parsePositiveInteger(parts.INTERVAL) ?? 1
  const hasPositionalSelection = !!parts.BYSETPOS
    || weekdayTokens.some((day) => ORDINAL_WEEKDAY_PATTERN.test(day))
  const canKeepWeekdays = !hasPositionalSelection && (interval === 1
    || (parts.FREQ === 'WEEKLY' && interval <= MAX_HABIT_INTERVAL_WEEKS))
  if (canKeepWeekdays) {
    const days = weekdayTokens
      .map((day) => WEEKDAY_DEFINITION[day]?.name)
      .filter((day): day is string => !!day)
    if (days.length > 0) result.days = days
  }
  assignRecurrenceInterval(parts, result)

  const weekdayIndexes = [...new Set(
    (result.days ? weekdayTokens : [])
      .map((token) => WEEKDAY_DEFINITION[token]?.index)
      .filter((weekday): weekday is number => weekday !== undefined),
  )].sort((left, right) => left - right)

  return {
    parts,
    recurrence: result,
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

function resolveMonthlyOrYearlyCountEndDate(
  parts: Record<string, string>,
  start: Date,
  count: number,
): string {
  const interval = parsePositiveInteger(parts.INTERVAL) ?? 1
  const frequencyMonths = parts.FREQ === 'MONTHLY' ? 1 : 12
  const monthNumber = start.getUTCFullYear() * 12 + start.getUTCMonth() + (count - 1) * interval * frequencyMonths
  const year = Math.floor(monthNumber / 12)
  const month = monthNumber % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return formatUtcDate(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))))
}

function resolveWeekdayCountOffset(
  calendarStartWeekday: number,
  calendarWeekdays: number[],
  count: number,
  intervalWeeks = 1,
  weekStartDay: 0 | 1 = 1,
): number {
  const startWeekday = (calendarStartWeekday - weekStartDay + DAYS_IN_WEEK) % DAYS_IN_WEEK
  const weekdays = calendarWeekdays.map((day) => (day - weekStartDay + DAYS_IN_WEEK) % DAYS_IN_WEEK)
    .sort((left, right) => left - right)
  const firstWeekOffsets = weekdays
    .filter((weekday) => weekday >= startWeekday)
    .map((weekday) => weekday - startWeekday)
  if (count <= firstWeekOffsets.length) return firstWeekOffsets[count - 1] ?? 0

  const remaining = count - firstWeekOffsets.length
  const fullWeeks = Math.floor((remaining - 1) / weekdays.length)
  const finalWeekday = weekdays[(remaining - 1) % weekdays.length] ?? 0
  return (fullWeeks + 1) * DAYS_IN_WEEK * intervalWeeks - startWeekday + finalWeekday
}

function isUntilBeyondCalendarSyncRange(until: string): boolean {
  const match = /^\+?(\d{4,})(\d{2})(\d{2})(?:T\d{6}Z)?$/.exec(until)
  return match?.[1] !== undefined && Number(match[1]) > MAX_CALENDAR_SYNC_YEAR
}

function hasFiniteDateRangeIssue(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
  weekStartDay: 0 | 1,
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
    const offsetDays = resolveWeekdayCountOffset(
      start.getUTCDay(), weekdayIndexes, count, parts.FREQ === 'WEEKLY' ? interval : 1, weekStartDay,
    )
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
): string {
  if (parts.FREQ === 'MONTHLY' || parts.FREQ === 'YEARLY') {
    return resolveMonthlyOrYearlyCountEndDate(parts, start, count)
  }

  const interval = parsePositiveInteger(parts.INTERVAL) ?? 1
  const cursor = new Date(start)
  const frequencyDays = parts.FREQ === 'WEEKLY' ? DAYS_IN_WEEK : 1
  cursor.setUTCDate(cursor.getUTCDate() + (count - 1) * interval * frequencyDays)
  return formatUtcDate(cursor)
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

function formatZonedDateTimeAsUtc(instant: Date, timeZone: string): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant).map(({ type, value }) => [type, value]))
  const localAsUtc = new Date(0)
  localAsUtc.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  localAsUtc.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second))
  return localAsUtc
}

function resolveUtcUntilContext(
  untilUtc: Date,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
  recurrenceTimeZone: string | null | undefined,
): UtcUntilContext | null {
  const localStartMatch = startDate && startTime
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(`${startDate}T${startTime}`)
    : null
  if (!localStartMatch) return null

  const [, year, month, day, hour, minute, second = '0'] = localStartMatch
  const occurrenceSeconds = Number(hour) * 3600 + Number(minute) * 60 + Number(second)
  const localStartAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const startInstant = startUtc ? new Date(startUtc) : null
  if (recurrenceTimeZone) {
    const sourceBound = formatZonedDateTimeAsUtc(untilUtc, recurrenceTimeZone)
    const sourceStart = startInstant && !Number.isNaN(startInstant.getTime())
      ? formatZonedDateTimeAsUtc(startInstant, recurrenceTimeZone)
      : null
    const projectionOffset = sourceStart ? localStartAsUtc - sourceStart.getTime() : 0
    const localBound = new Date(sourceBound.getTime() + projectionOffset)
    return { localBound, occurrenceSeconds }
  }

  if (!startInstant || Number.isNaN(startInstant.getTime())) return null
  const offset = localStartAsUtc - startInstant.getTime()
  return {
    localBound: new Date(untilUtc.getTime() + offset),
    occurrenceSeconds,
  }
}

function resolveUtcUntilDate(
  until: string,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
  recurrenceTimeZone: string | null | undefined,
): string | null {
  if (/^\d{8}$/.test(until)) {
    return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
  }

  const untilUtc = parseUtcUntil(until)
  if (!untilUtc) return null
  const utcDate = formatUtcDate(untilUtc)
  const context = resolveUtcUntilContext(untilUtc, startDate, startTime, startUtc, recurrenceTimeZone)
  if (!context) return utcDate

  const { localBound, occurrenceSeconds } = context
  const boundSeconds = localBound.getUTCHours() * 3600 + localBound.getUTCMinutes() * 60 + localBound.getUTCSeconds()
  if (occurrenceSeconds > boundSeconds) localBound.setUTCDate(localBound.getUTCDate() - 1)
  return formatUtcDate(localBound)
}

export function resolveCalendarSyncEndDate(
  rule: string | null,
  startDate: string | null,
  startTime: string | null = null,
  startUtc?: string | null,
  recurrenceTimeZone?: string | null,
  weekStartDay: 0 | 1 = 1,
): string | null {
  if (!rule) return null

  return resolveCalendarSyncEndDateFromResolution(
    resolveCalendarSyncRule(rule),
    startDate,
    startTime,
    startUtc,
    recurrenceTimeZone,
    weekStartDay,
  )
}

function resolveCalendarSyncEndDateFromResolution(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
  recurrenceTimeZone: string | null | undefined,
  weekStartDay: 0 | 1,
): string | null {
  const { parts, weekdayIndexes } = resolution
  if (hasFiniteDateRangeIssue(resolution, startDate, weekStartDay)) return '9999-12-31'

  if (parts.UNTIL) {
    return resolveUtcUntilDate(parts.UNTIL, startDate, startTime, startUtc, recurrenceTimeZone)
  }

  if (!parts.COUNT || !startDate) return null
  const count = parsePositiveInteger(parts.COUNT)
  if (!count) return null

  const start = new Date(`${startDate.slice(0, ISO_DATE_LENGTH)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return null

  if (weekdayIndexes.length === 0) {
    return resolveUnfilteredCountEndDate(parts, start, count)
  }

  const intervalWeeks = parts.FREQ === 'WEEKLY' ? parsePositiveInteger(parts.INTERVAL) ?? 1 : 1
  const offsetDays = resolveWeekdayCountOffset(start.getUTCDay(), weekdayIndexes, count, intervalWeeks, weekStartDay)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + offsetDays)
  return formatUtcDate(end)
}

function hasUncertainUtcUntilDate(
  parts: Record<string, string>,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
): boolean {
  const untilUtc = parts.UNTIL ? parseUtcUntil(parts.UNTIL) : null
  if (!untilUtc) return false
  const context = resolveUtcUntilContext(untilUtc, startDate, startTime, startUtc, undefined)
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
  recurrenceTimeZone?: string | null,
  _weekStartDay: 0 | 1 = 1,
): CalendarSyncImportIssue | null {
  if (!rule) return null

  return getCalendarSyncImportIssueFromResolution(
    resolveCalendarSyncRule(rule),
    startDate,
    startTime,
    startUtc,
    recurrenceTimeZone,
  )
}

function getCalendarSyncImportIssueFromResolution(
  resolution: CalendarSyncRuleResolution,
  startDate: string | null,
  startTime: string | null,
  startUtc: string | null | undefined,
  recurrenceTimeZone: string | null | undefined,
): CalendarSyncImportIssue | null {
  const { parts } = resolution
  if (!recurrenceTimeZone && hasUncertainUtcUntilDate(parts, startDate, startTime, startUtc)) {
    return 'utc-until-offset-shift'
  }

  return null
}

export function isCalendarSyncEventImportable(event: CalendarSyncEvent, weekStartDay: 0 | 1 = 1): boolean {
  return event.isImported !== true && getCalendarSyncImportIssue(
    event.recurrenceRule,
    event.startDate,
    event.startTime,
    event.startUtc,
    event.recurrenceTimeZone,
    weekStartDay,
  ) === null
}

export function getCalendarSyncImportIssueMessageKey(
  issue: CalendarSyncImportIssue,
): CalendarSyncImportIssueMessageKey {
  const keys: Record<CalendarSyncImportIssue, CalendarSyncImportIssueMessageKey> = {
    'utc-until-offset-shift': 'calendar.importIssue.utcUntilOffsetShift',
  }
  return keys[issue]
}

export function formatCalendarSyncRecurrenceLabel(
  rule: string | null,
  translations: CalendarSyncTranslationAdapter,
): string {
  if (!rule) return ''

  const recurrence = parseCalendarSyncRecurrence(rule.toUpperCase())
  const interval = recurrence.intervalWeeks ?? recurrence.frequencyQuantity ?? 1
  const { translate, pluralize } = translations
  if (recurrence.days) {
    const days = recurrence.days.map((day) => Object.keys(WEEKDAY_DEFINITION)
      .find((token) => WEEKDAY_DEFINITION[token]?.name === day)).join(',')
    if (interval > 1) {
      return `${pluralize(translate('calendar.recurrenceEveryNWeeks', { n: interval }), interval)} (${days})`
    }
    return translate('calendar.recurrenceWeeklyDays', { days })
  }
  const keys: Record<FrequencyUnit, [string, string]> = {
    Day: ['calendar.recurrenceDaily', 'calendar.recurrenceEveryNDays'],
    Week: ['calendar.recurrenceWeekly', 'calendar.recurrenceEveryNWeeks'],
    Month: ['calendar.recurrenceMonthly', 'calendar.recurrenceEveryNMonths'],
    Year: ['calendar.recurrenceYearly', 'calendar.recurrenceEveryNYears'],
  }
  if (!recurrence.frequencyUnit) return ''
  return formatIntervalRecurrence(interval, ...keys[recurrence.frequencyUnit], translate, pluralize)
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
  weekStartDay: 0 | 1 = 1,
): BulkCreateRequest {
  return {
    habits: events.map((event) => {
      const resolution = resolveCalendarSyncRule(event.recurrenceRule)
      const importIssue = getCalendarSyncImportIssueFromResolution(
        resolution,
        event.startDate,
        event.startTime,
        event.startUtc,
        event.recurrenceTimeZone,
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
        ...(recurrence.intervalWeeks !== undefined && { intervalWeeks: recurrence.intervalWeeks }),
        endDate: resolveCalendarSyncEndDateFromResolution(
          resolution,
          event.startDate,
          event.startTime,
          event.startUtc,
          event.recurrenceTimeZone,
          weekStartDay,
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
  weekStartDay: 0 | 1 = 1,
): BulkCreateRequest {
  return buildCalendarSyncImportRequest(suggestions.map((s) => s.event), weekStartDay)
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

export function formatCalendarSyncTimestamp(
  timestamp: string | null,
  locale: string,
  timeZone: string | null | undefined,
  uses24HourClock: boolean | undefined,
): string | null {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return null
  return formatLocaleDateTime(timestamp, locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: uses24HourClock ? '2-digit' : 'numeric', minute: '2-digit',
    hourCycle: resolveHourCycle(uses24HourClock, locale),
    ...(timeZone ? { timeZone } : {}),
  })
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
export function shouldPromptForCalendarConnection(
  stateLoading: boolean,
  connected: boolean,
  online: boolean,
  browsing: boolean,
): boolean {
  return !stateLoading && !connected && online && browsing
}

export function resolveCalendarImportConnectionStep<T extends string>(
  resolvedStep: T,
  stateLoading: boolean,
  stateError: boolean,
  connected: boolean,
  online: boolean,
  browsing: boolean,
): T | 'not-connected' | 'error' {
  if (stateError && online && browsing) return 'error'
  if (shouldPromptForCalendarConnection(stateLoading, connected, online, browsing)) return 'not-connected'
  return resolvedStep
}

export function shouldOpenCalendarImportSheet(
  profileReady: boolean,
  openedLocally: boolean,
  requestedByRoute: boolean,
): boolean {
  return profileReady && (openedLocally || requestedByRoute)
}

export function isCalendarImportConnected(reviewMode: boolean, eventsStatus: 'connected' | 'not-connected' | undefined, autoSyncState: CalendarAutoSyncState | undefined): boolean {
  return (reviewMode || eventsStatus !== 'not-connected') && isCalendarSyncConnectionActive(
    autoSyncState?.hasGoogleConnection ?? false,
    autoSyncState?.status ?? 'Idle',
  )
}

export function calendarImportVisibleCount(events: readonly CalendarSyncEvent[], eventId: string | null, pageSize: number): number {
  const openedIndex = events.findIndex((event) => event.id === eventId)
  return Math.max(pageSize, Math.ceil((openedIndex + 1) / pageSize) * pageSize)
}

export function calendarImportRouteRequestKey(reviewRequested: boolean, importRequested: boolean): '' | 'review' | 'import' {
  if (reviewRequested) return 'review'
  return importRequested ? 'import' : ''
}

export function calendarImportTitleKey(reviewMode: boolean): 'calendar.autoSync.reviewModeTitle' | 'calendar.calendars.title' {
  return reviewMode ? 'calendar.autoSync.reviewModeTitle' : 'calendar.calendars.title'
}

export function selectInitialCalendarImportEvent(
  initialEventId: string | null,
  reviewMode: boolean,
  events: readonly CalendarSyncEvent[],
  weekStartDay: 0 | 1,
): Set<string> | null {
  if (!initialEventId || reviewMode) return null
  return new Set(events.filter((event) =>
    event.id === initialEventId && isCalendarSyncEventImportable(event, weekStartDay),
  ).map((event) => event.id))
}

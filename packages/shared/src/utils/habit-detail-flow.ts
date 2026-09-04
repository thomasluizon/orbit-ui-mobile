import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  getDate,
  getDaysInMonth,
  isLeapYear,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { HabitDayValue } from '../contracts/dates'
import type { HabitLog } from '../types/calendar'
import type { CreateSubHabitRequest, HabitDetail, HabitDetailChild, HabitMetrics, NormalizedHabit, UpdateHabitRequest } from '../types/habit'
import { canLogHabitOnDate } from './habit-card-helpers'
import { formatAPIDate, parseAPIDate } from './dates'
import { normalizeHabitDetailForDrill } from './drill-navigation'
import { formatHabitReminderLabel } from './habit-form-helpers'
import { getTodayBoundary } from './today-date'

export const HABIT_DETAIL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const HABIT_DETAIL_FREQUENCY_UNITS = ['Day', 'Week', 'Month', 'Year'] as const
const HISTORY_LOOKBACK_DAYS = 365

interface HabitScheduleSource {
  createdAtUtc: string
  days: string[]
  dueDate: string
  endDate: string | null
  frequencyQuantity: number | null
  frequencyUnit: string | null
  flexibleTarget?: number | null
  isBadHabit: boolean
  isGeneral: boolean
  isFlexible: boolean
}

export interface HabitStripModel {
  days: HabitDayValue[]
  labels: string[]
}

export interface HabitHistoryDay {
  date: Date
  dateStr: string
  day: number
  outsideMonth: boolean
  today: boolean
  outcome: 'none' | 'full' | 'not-scheduled' | 'future' | 'unavailable'
  loggedAt: string | null
}

function trueModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export interface HabitDetailChildDateModel {
  habit: NormalizedHabit
  completed: boolean
  canLog: boolean
  readOnly: boolean
}

function monthDifference(date: Date, anchor: Date): number {
  return (date.getFullYear() - anchor.getFullYear()) * 12 + date.getMonth() - anchor.getMonth()
}

function matchesFrequency(source: HabitScheduleSource, date: Date, anchor: Date): boolean {
  if (source.days.length > 0 && !source.days.includes(HABIT_DETAIL_WEEKDAYS[date.getDay()] ?? '')) {
    return false
  }

  const quantity = source.frequencyQuantity ?? 1
  if (source.frequencyUnit === 'Day') {
    return quantity === 1 || trueModulo(differenceInCalendarDays(date, anchor), quantity) === 0
  }
  if (source.frequencyUnit === 'Week') {
    const weekDifference = Math.trunc(differenceInCalendarDays(date, anchor) / 7)
    return date.getDay() === anchor.getDay() && trueModulo(weekDifference, quantity) === 0
  }
  if (source.frequencyUnit === 'Month') {
    const expectedDay = Math.min(anchor.getDate(), getDaysInMonth(date))
    return date.getDate() === expectedDay && trueModulo(monthDifference(date, anchor), quantity) === 0
  }
  if (source.frequencyUnit === 'Year') {
    if (trueModulo(date.getFullYear() - anchor.getFullYear(), quantity) !== 0) return false
    if (date.getMonth() === anchor.getMonth() && date.getDate() === anchor.getDate()) return true
    return anchor.getMonth() === 1 && anchor.getDate() === 29 &&
      date.getMonth() === 1 && date.getDate() === 28 && !isLeapYear(date)
  }
  return false
}

function flexibleWindowKey(
  source: HabitScheduleSource,
  date: Date,
  weekStartsOn: 0 | 1,
): string {
  if (source.frequencyUnit === 'Week') {
    return formatAPIDate(startOfWeek(date, { weekStartsOn }))
  }
  if (source.frequencyUnit === 'Month') {
    return `${date.getFullYear()}-${date.getMonth()}`
  }
  if (source.frequencyUnit === 'Year') return String(date.getFullYear())
  return formatAPIDate(date)
}

function isFlexibleTargetMet(
  source: HabitScheduleSource,
  logs: readonly HabitLog[],
  date: Date,
  weekStartsOn: 0 | 1,
): boolean {
  const windowKey = flexibleWindowKey(source, date, weekStartsOn)
  const windowLogs = logs.filter(
    (log) => flexibleWindowKey(source, parseAPIDate(log.date), weekStartsOn) === windowKey,
  )
  const target = source.frequencyQuantity ?? 1
  const adjustedTarget = Math.max(0, target - windowLogs.filter((log) => log.value === 0).length)
  return windowLogs.filter((log) => log.value > 0).length >= adjustedTarget
}

function isScheduled(
  source: HabitScheduleSource,
  date: Date,
  logs: readonly HabitLog[] = [],
  weekStartsOn: 0 | 1 = 0,
): boolean {
  const dateStr = formatAPIDate(date)
  if (source.endDate && dateStr > source.endDate) return false
  if (source.isGeneral) return false
  if (source.frequencyUnit === null) return source.dueDate === dateStr

  const createdDate = new Date(source.createdAtUtc)
  if (dateStr < formatAPIDate(createdDate)) return false
  if (source.isFlexible) {
    if (dateStr < source.dueDate) return false
    return !isFlexibleTargetMet(source, logs, date, weekStartsOn)
  }
  if (
    dateStr < source.dueDate &&
    (source.frequencyUnit === 'Month' || source.frequencyUnit === 'Year')
  ) return false

  return matchesFrequency(source, date, parseAPIDate(source.dueDate))
}

function activeLogDates(logs: readonly HabitLog[]): Set<string> {
  return new Set(logs.filter((log) => log.value > 0).map((log) => log.date))
}

function scheduledDayOutcome(
  habit: HabitScheduleSource,
  logged: boolean,
  scheduled: boolean,
): HabitDayValue {
  if (!scheduled) return habit.isBadHabit ? 'not-scheduled' : logged ? 'done' : 'not-scheduled'
  if (habit.isBadHabit) return logged ? 'missed' : 'done'
  return logged ? 'done' : 'missed'
}

export function isHabitCompletedOnDate(
  habit: HabitScheduleSource,
  logs: readonly HabitLog[],
  dateStr: string,
): boolean {
  const logged = activeLogDates(logs).has(dateStr)
  if (!habit.isBadHabit) return logged
  return isScheduled(habit, parseAPIDate(dateStr)) && !logged
}

export function buildHabitDetailChildDateModel(
  detailChild: NormalizedHabit,
  scopedChild: NormalizedHabit | undefined,
  dateStr: string,
  todayStr: string,
): HabitDetailChildDateModel {
  const completed = scopedChild
    ? scopedChild.isGeneral
      ? scopedChild.isCompleted
      : scopedChild.instances.some(
          (instance) => instance.date === dateStr && instance.status === 'Completed',
        ) || scopedChild.isLoggedInRange
    : false
  const habit = {
    ...detailChild,
    ...scopedChild,
    isCompleted: completed,
    isLoggedInRange: completed,
  }
  const canLog = scopedChild !== undefined && canLogHabitOnDate(habit, dateStr, todayStr)
  const boundary = getTodayBoundary(dateStr, todayStr)

  return {
    habit,
    completed,
    canLog,
    readOnly: scopedChild === undefined
      || boundary === 'read-only'
      || (boundary === 'future' && !canLog),
  }
}

export function buildHabitStripModel(
  habit: HabitScheduleSource,
  logs: readonly HabitLog[],
  today: Date,
  locale: string,
  weekStartsOn: 0 | 1 = 0,
): HabitStripModel {
  const loggedDates = activeLogDates(logs)
  const days: HabitDayValue[] = []
  const labels: string[] = []

  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset)
    const dateStr = formatAPIDate(date)
    labels.push(date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
    days.push(scheduledDayOutcome(
      habit,
      loggedDates.has(dateStr),
      isScheduled(habit, date, logs, weekStartsOn),
    ))
  }

  return { days, labels }
}

export function isHabitSlipping(
  habit: Pick<HabitScheduleSource, 'isBadHabit'>,
  metrics: HabitMetrics | null,
  logs: readonly HabitLog[],
  today: Date,
): boolean {
  if (!metrics || metrics.currentStreak !== 0 || metrics.monthlyCompletionRate >= 50) return false
  const cutoff = formatAPIDate(addDays(today, -2))
  const recentlyLogged = logs.some((log) => log.value > 0 && log.date >= cutoff)
  return habit.isBadHabit ? recentlyLogged : !recentlyLogged
}

export function shouldShowHabitMetrics(habit: Pick<HabitDetail, 'frequencyUnit' | 'isGeneral'>): boolean {
  return habit.frequencyUnit !== null || habit.isGeneral
}

export function shouldResetHabitChecklist(habit: Pick<HabitDetail, 'frequencyUnit' | 'isFlexible'>): boolean {
  return habit.frequencyUnit !== null && !habit.isFlexible
}

export function habitHistoryCutoff(today: Date): Date {
  return addDays(today, -HISTORY_LOOKBACK_DAYS)
}

export function isHabitHistoryMonthLoaded(month: Date, today: Date): boolean {
  return endOfMonth(month) >= habitHistoryCutoff(today)
}

export function canNavigateHabitHistoryBack(month: Date, createdAtUtc: string): boolean {
  return startOfMonth(month) > startOfMonth(new Date(createdAtUtc))
}

export function canNavigateHabitHistoryForward(month: Date, today: Date): boolean {
  return startOfMonth(month) < startOfMonth(today)
}

export function buildHabitHistoryMonth(
  habit: HabitScheduleSource,
  logs: readonly HabitLog[],
  month: Date,
  today: Date,
  weekStartsOn: 0 | 1,
): HabitHistoryDay[] {
  const monthStart = startOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn })
  const todayStr = formatAPIDate(today)
  const cutoffStr = formatAPIDate(habitHistoryCutoff(today))
  const loggedByDate = new Map(
    logs
      .filter((log) => log.value > 0)
      .map((log) => [log.date, log.createdAtUtc] as const),
  )

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    const dateStr = formatAPIDate(date)
    const loggedAt = loggedByDate.get(dateStr) ?? null
    const future = dateStr > todayStr
    const scheduled = isScheduled(habit, date, logs, weekStartsOn)
    const stripOutcome = scheduledDayOutcome(habit, loggedAt !== null, scheduled)
    const outcome = dateStr < cutoffStr
      ? 'unavailable' as const
      : future
        ? 'future' as const
        : stripOutcome === 'done'
          ? 'full' as const
          : stripOutcome === 'missed'
            ? 'none' as const
            : 'not-scheduled' as const

    return {
      date,
      dateStr,
      day: getDate(date),
      outsideMonth: !isSameMonth(date, month),
      today: dateStr === todayStr,
      outcome,
      loggedAt,
    }
  })
}

export function getHabitHistoryLog(
  logs: readonly HabitLog[],
  dateStr: string,
): HabitLog | null {
  return logs.find((log) => log.date === dateStr && log.value > 0) ?? null
}

export function getHabitStartDate(createdAtUtc: string): Date {
  return new Date(createdAtUtc)
}

export function parseHabitHistoryDate(dateStr: string): Date {
  return parseAPIDate(dateStr)
}

export function appendHabitDetailChild(
  detail: HabitDetail,
  childId: string,
  request: CreateSubHabitRequest,
): HabitDetail {
  const position = detail.children.reduce(
    (highest, child) => Math.max(highest, child.position ?? -1),
    -1,
  ) + 1
  const child: HabitDetailChild = {
    id: childId,
    title: request.title,
    description: request.description ?? null,
    emoji: request.emoji ?? null,
    frequencyUnit: request.frequencyUnit ?? null,
    frequencyQuantity: request.frequencyQuantity ?? null,
    isBadHabit: request.isBadHabit ?? false,
    isCompleted: false,
    isGeneral: detail.isGeneral,
    isFlexible: request.isFlexible ?? false,
    days: request.days ?? [],
    dueDate: request.dueDate || detail.dueDate,
    dueTime: request.dueTime ?? null,
    dueEndTime: request.dueEndTime ?? null,
    endDate: request.endDate ?? null,
    position,
    checklistItems: request.checklistItems ?? [],
    children: [],
  }
  return { ...detail, children: [...detail.children, child] }
}

function removeDetailChild(
  children: readonly HabitDetailChild[],
  habitId: string,
): HabitDetailChild[] {
  return children.flatMap((child) => child.id === habitId
    ? []
    : [{ ...child, children: removeDetailChild(child.children, habitId) }])
}

export function removeHabitDetailChild(detail: HabitDetail, habitId: string): HabitDetail {
  return { ...detail, children: removeDetailChild(detail.children, habitId) }
}

export function buildHabitDetailUpdateRequest(
  habit: NormalizedHabit,
  patch: Partial<Pick<UpdateHabitRequest,
    | 'title'
    | 'description'
    | 'emoji'
    | 'frequencyUnit'
    | 'frequencyQuantity'
    | 'days'
    | 'dueTime'
    | 'dueEndTime'
    | 'reminderEnabled'
    | 'reminderTimes'
    | 'scheduledReminders'
    | 'checklistItems'
    | 'endDate'
    | 'slipAlertEnabled'
    | 'goalIds'
  >>,
): UpdateHabitRequest {
  const request: UpdateHabitRequest = {
    title: patch.title ?? habit.title,
    description: patch.description ?? habit.description ?? undefined,
    emoji: patch.emoji === undefined ? habit.emoji : patch.emoji,
    frequencyUnit: patch.frequencyUnit ?? habit.frequencyUnit ?? undefined,
    frequencyQuantity: patch.frequencyQuantity ?? habit.frequencyQuantity ?? undefined,
    days: patch.days ?? habit.days,
    isBadHabit: habit.isBadHabit,
    isGeneral: habit.isGeneral,
    isFlexible: habit.isFlexible,
    dueDate: habit.dueDate,
    dueTime: patch.dueTime === undefined ? habit.dueTime : patch.dueTime,
    dueEndTime: patch.dueEndTime === undefined ? habit.dueEndTime : patch.dueEndTime,
    reminderEnabled: patch.reminderEnabled ?? habit.reminderEnabled,
    reminderTimes: patch.reminderTimes ?? habit.reminderTimes,
    scheduledReminders: patch.scheduledReminders ?? habit.scheduledReminders,
    checklistItems: patch.checklistItems ?? habit.checklistItems,
    endDate: patch.endDate === undefined ? habit.endDate || null : patch.endDate,
  }
  if (patch.endDate === null && habit.endDate) request.clearEndDate = true
  if (patch.slipAlertEnabled !== undefined) request.slipAlertEnabled = patch.slipAlertEnabled
  if (patch.goalIds !== undefined) request.goalIds = patch.goalIds
  return request
}

export function buildHabitDetailTimePatch(
  value: string,
  habit: Pick<NormalizedHabit, 'dueEndTime' | 'dueTime'>,
): Partial<UpdateHabitRequest> | null {
  if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  return {
    dueTime: value || null,
    dueEndTime: value === habit.dueTime ? habit.dueEndTime : null,
  }
}

export function buildHabitDetailSchedulePatch(
  unit: (typeof HABIT_DETAIL_FREQUENCY_UNITS)[number],
  quantity: number,
  days: string[],
): Partial<UpdateHabitRequest> | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null
  return {
    frequencyUnit: unit,
    frequencyQuantity: quantity,
    days: unit === 'Day' && quantity === 1 ? days : [],
  }
}

export function canInlineEditHabitSchedule(
  habit: Pick<NormalizedHabit, 'frequencyUnit' | 'isFlexible' | 'isGeneral'>,
): boolean {
  return habit.frequencyUnit !== null && !habit.isFlexible && !habit.isGeneral
}

export function formatHabitDetailReminderValue(
  habit: Pick<NormalizedHabit, 'reminderEnabled' | 'reminderTimes' | 'scheduledReminders'>,
  translate: (key: string) => string,
): string {
  if (!habit.reminderEnabled) return translate('habits.detail.noValue')
  const values = [
    ...habit.reminderTimes.map((minutes) => formatHabitReminderLabel(minutes, translate)),
    ...habit.scheduledReminders.map((reminder) => reminder.time),
  ]
  return values.length ? values.join(', ') : translate('habits.detail.noValue')
}

export function mergeHabitDetailWithScopedHabit(
  detail: HabitDetail,
  authoritativeHabit: NormalizedHabit | undefined,
  date: string,
  scopedHabit = authoritativeHabit,
): NormalizedHabit {
  const normalized = normalizeHabitDetailForDrill(detail, date).parent
  const relationshipAuthority = authoritativeHabit ?? (detail.isGeneral ? scopedHabit : undefined)
  if (!relationshipAuthority) return normalized
  return {
    ...relationshipAuthority,
    ...normalized,
    tags: relationshipAuthority.tags,
    linkedGoals: relationshipAuthority.linkedGoals,
    slipAlertEnabled: relationshipAuthority.slipAlertEnabled,
    flexibleTarget: scopedHabit?.flexibleTarget ?? relationshipAuthority.flexibleTarget,
    flexibleCompleted: scopedHabit?.flexibleCompleted ?? relationshipAuthority.flexibleCompleted,
    instances: scopedHabit?.instances ?? relationshipAuthority.instances,
  }
}

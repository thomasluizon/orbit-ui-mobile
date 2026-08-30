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
import type { HabitDetail, HabitMetrics, NormalizedHabit, UpdateHabitRequest } from '../types/habit'
import { canLogHabitOnDate } from './habit-card-helpers'
import { formatAPIDate, parseAPIDate } from './dates'
import { getTodayBoundary } from './today-date'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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
  outcome: 'none' | 'full' | 'not-scheduled' | 'future'
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
  if (source.days.length > 0 && !source.days.includes(WEEKDAYS[date.getDay()] ?? '')) {
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
  const target = source.flexibleTarget ?? source.frequencyQuantity ?? 1
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
    const outcome = future
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

export function buildHabitDetailUpdateRequest(
  habit: NormalizedHabit,
  patch: Partial<Pick<UpdateHabitRequest, 'title' | 'emoji' | 'checklistItems'>>,
): UpdateHabitRequest {
  return {
    title: patch.title ?? habit.title,
    description: habit.description ?? undefined,
    emoji: patch.emoji === undefined ? habit.emoji : patch.emoji,
    frequencyUnit: habit.frequencyUnit ?? undefined,
    frequencyQuantity: habit.frequencyQuantity ?? undefined,
    days: habit.days,
    isBadHabit: habit.isBadHabit,
    isGeneral: habit.isGeneral,
    isFlexible: habit.isFlexible,
    dueDate: habit.dueDate,
    dueTime: habit.dueTime || undefined,
    dueEndTime: habit.dueEndTime || undefined,
    reminderEnabled: habit.reminderEnabled,
    reminderTimes: habit.reminderTimes,
    scheduledReminders: habit.scheduledReminders,
    slipAlertEnabled: habit.slipAlertEnabled,
    checklistItems: patch.checklistItems ?? habit.checklistItems,
    goalIds: habit.linkedGoals?.map((goal) => goal.id),
    endDate: habit.endDate || null,
  }
}

import type { HabitInstance, NormalizedHabit, ScheduledReminderTime } from '../types/habit'
import { formatAPIDate } from './dates'
import { hasHabitScheduleOnDate } from './habits'

export type HabitCardStatus = 'completed' | 'pending' | 'overdue' | 'due-today'

export type HabitCardTranslationAdapter = (
  key: string,
  params?: Record<string, string | number | Date>,
) => string

export interface HabitCardStatusBadge {
  text: string
  color: string
  bg: string
}

export interface HabitCardMatchBadge {
  label: string
}

function plural(text: string, count: number): string {
  if (!text.includes(' | ')) return text
  const forms = text.split(' | ').map((part) => part.trim())
  if (forms.length === 2) {
    return count === 1 ? (forms[0] ?? text) : (forms[1] ?? text)
  }
  if (forms.length === 3) {
    if (count === 0) return forms[0] ?? text
    if (count === 1) return forms[1] ?? text
    return forms[2] ?? text
  }
  return text
}

function truncate(value: string, max = 20): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

export function computeHabitCardStatus(
  habit: Pick<
    NormalizedHabit,
    | 'isCompleted'
    | 'isLoggedInRange'
    | 'isGeneral'
    | 'isOverdue'
    | 'frequencyUnit'
    | 'instances'
    | 'scheduledDates'
    | 'dueDate'
  >,
  selectedDate?: Date,
): HabitCardStatus {
  if (habit.isCompleted || habit.isLoggedInRange) return 'completed'
  if (habit.isGeneral) return 'pending'
  if (habit.isOverdue && !habit.frequencyUnit) return 'overdue'
  const selectedDateStr = formatAPIDate(selectedDate ?? new Date())
  const hasTodaySchedule = hasHabitScheduleOnDate(habit, selectedDateStr)
  if (hasTodaySchedule) return 'due-today'
  return 'pending'
}

export function computeHabitStatusBadge(
  status: HabitCardStatus,
  t: HabitCardTranslationAdapter,
): HabitCardStatusBadge | null {
  if (status !== 'overdue') return null
  return {
    text: t('habits.overdue'),
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  }
}

export function computeHabitFrequencyLabel(
  habit: Pick<
    NormalizedHabit,
    | 'isGeneral'
    | 'frequencyUnit'
    | 'frequencyQuantity'
    | 'days'
    | 'isFlexible'
  >,
  t: HabitCardTranslationAdapter,
): string {
  if (habit.isGeneral) return t('habits.generalHabit')
  const { frequencyUnit, frequencyQuantity, days, isFlexible } = habit
  if (!frequencyUnit) return t('habits.oneTimeTask')
  if (isFlexible) {
    return t('habits.frequency.flexibleLabel', {
      n: frequencyQuantity ?? 1,
      unit: t(`habits.form.unit${frequencyUnit}`),
    })
  }
  if (frequencyQuantity === 1 && days.length > 0) {
    return days
      .map((day) => t(`dates.daysShort.${day.toLowerCase()}`))
      .join(', ')
  }
  if (frequencyQuantity === 1) {
    return t(`habits.frequency.every${frequencyUnit}`)
  }
  return plural(
    t(`habits.frequency.everyN${frequencyUnit}s`, {
      n: frequencyQuantity ?? 1,
    }),
    frequencyQuantity ?? 1,
  )
}

export function computeHabitFlexibleProgressLabel(
  habit: Pick<
    NormalizedHabit,
    'isFlexible' | 'flexibleTarget' | 'frequencyQuantity' | 'flexibleCompleted' | 'frequencyUnit'
  >,
  t: HabitCardTranslationAdapter,
): string | null {
  if (!habit.isFlexible) return null
  const target = habit.flexibleTarget ?? habit.frequencyQuantity ?? 1
  const done = habit.flexibleCompleted ?? 0
  const unit = habit.frequencyUnit ? t(`habits.form.unit${habit.frequencyUnit}`) : ''
  return t('habits.frequency.flexibleProgress', { done, target, unit })
}

export function computeHabitMatchBadges(
  searchQuery: string,
  habit: Pick<NormalizedHabit, 'searchMatches'>,
  t: HabitCardTranslationAdapter,
): HabitCardMatchBadge[] {
  if (!searchQuery || !habit.searchMatches) return []
  return habit.searchMatches
    .filter((match) => match.field !== 'title')
    .map((match) => {
      if (match.field === 'tag') {
        return { label: t('habits.search.matchTag', { value: truncate(match.value ?? '') }) }
      }
      if (match.field === 'child') {
        return { label: t('habits.search.matchChild', { value: truncate(match.value ?? '') }) }
      }
      return { label: t('habits.search.matchDescription') }
    })
}

// --- New helpers for habit card v2 ---

export type SevenDayStripCellStatus = 'done' | 'missed' | 'future' | 'today-pending' | 'not-scheduled'

export interface SevenDayStripCell {
  date: string
  status: SevenDayStripCellStatus
}

/**
 * Computes the last 7 days (newest on the right) from habit.instances.
 * Uses the habit's own instance records for the ground truth; any day not in
 * the instance window is marked 'not-scheduled' so the strip stays honest
 * about what we actually know.
 */
export function computeSevenDayStrip(
  habit: Pick<NormalizedHabit, 'instances'>,
  today: Date = new Date(),
): SevenDayStripCell[] {
  const instanceByDate = new Map<string, HabitInstance>()
  for (const instance of habit.instances) instanceByDate.set(instance.date, instance)

  const todayStr = formatAPIDate(today)
  const cells: SevenDayStripCell[] = []

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today)
    d.setDate(d.getDate() - offset)
    const dateStr = formatAPIDate(d)
    const instance = instanceByDate.get(dateStr)

    let status: SevenDayStripCellStatus
    if (!instance) {
      status = dateStr === todayStr ? 'today-pending' : 'not-scheduled'
    } else if (instance.status === 'Completed') {
      status = 'done'
    } else if (instance.status === 'Overdue') {
      status = 'missed'
    } else if (dateStr === todayStr) {
      status = 'today-pending'
    } else if (dateStr > todayStr) {
      status = 'future'
    } else {
      status = 'missed'
    }

    cells.push({ date: dateStr, status })
  }

  return cells
}

/**
 * Returns checked/total for habits with a checklist, or null for habits without.
 */
export function computeHabitChecklistCount(
  habit: Pick<NormalizedHabit, 'checklistItems'>,
): { checked: number; total: number } | null {
  if (!habit.checklistItems || habit.checklistItems.length === 0) return null
  const total = habit.checklistItems.length
  const checked = habit.checklistItems.filter((item) => item.isChecked).length
  return { checked, total }
}

/**
 * Returns a localized label for the next scheduled reminder ("in 2h",
 * "tomorrow 08:00"), or null if no future reminder exists.
 */
export function computeNextReminderLabel(
  habit: Pick<NormalizedHabit, 'reminderEnabled' | 'scheduledReminders' | 'dueDate' | 'dueTime'>,
  now: Date,
  t: HabitCardTranslationAdapter,
): string | null {
  if (!habit.reminderEnabled) return null

  const candidates: Date[] = []

  if (habit.dueTime) {
    const dueDate = parseAsLocalDate(habit.dueDate)
    if (dueDate) {
      const dueAt = combineDateAndTime(dueDate, habit.dueTime)
      if (dueAt && dueAt.getTime() > now.getTime()) candidates.push(dueAt)
    }
  }

  const dueBase = parseAsLocalDate(habit.dueDate)
  if (dueBase && habit.scheduledReminders) {
    for (const reminder of habit.scheduledReminders as ScheduledReminderTime[]) {
      const targetDate = new Date(dueBase)
      if (reminder.when === 'day_before') targetDate.setDate(targetDate.getDate() - 1)
      const reminderAt = combineDateAndTime(targetDate, reminder.time)
      if (reminderAt && reminderAt.getTime() > now.getTime()) candidates.push(reminderAt)
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => a.getTime() - b.getTime())
  const earliest = candidates[0]
  if (!earliest) return null

  const diffMs = earliest.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60000)

  if (diffMinutes < 60) {
    return t('habits.card.reminderInMinutes', { n: Math.max(1, diffMinutes) })
  }
  if (diffMinutes < 24 * 60) {
    const hours = Math.round(diffMinutes / 60)
    return t('habits.card.reminderInHours', { n: hours })
  }
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const earliestDayStart = new Date(earliest)
  earliestDayStart.setHours(0, 0, 0, 0)
  if (earliestDayStart.getTime() === tomorrowStart.getTime()) {
    const time = earliest.toTimeString().slice(0, 5)
    return t('habits.card.reminderTomorrow', { time })
  }
  const days = Math.round(diffMinutes / (60 * 24))
  return t('habits.card.reminderInDays', { n: days })
}

export interface HabitAccentPalette {
  accentBar: string
  iconBg: string
  iconFg: string
  ringStroke: string
}

/**
 * Resolves the accent palette for a habit card. Status (amber/red) overrides
 * the accent bar only; icon chip and progress ring always keep the user's
 * accent color so recognition is preserved.
 */
export function resolveHabitAccent(
  habit: Pick<NormalizedHabit, 'icon' | 'color'>,
  status: HabitCardStatus,
  theme: {
    primary: string
    amber: string
    red: string
    dim: (hex: string, alpha: number) => string
  },
): HabitAccentPalette {
  const userColor = isValidHex(habit.color ?? null) ? (habit.color as string) : theme.primary
  const barColor =
    status === 'overdue'
      ? theme.red
      : status === 'due-today'
        ? theme.amber
        : status === 'completed'
          ? theme.dim(userColor, 0.3)
          : userColor

  return {
    accentBar: barColor,
    iconBg: theme.dim(userColor, 0.14),
    iconFg: userColor,
    ringStroke: userColor,
  }
}

function isValidHex(value: string | null): boolean {
  return !!value && /^#[0-9a-f]{6}$/i.test(value)
}

function parseAsLocalDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

function combineDateAndTime(date: Date, timeStr: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr)
  if (!match) return null
  const [, h, m] = match
  const result = new Date(date)
  result.setHours(Number(h), Number(m), 0, 0)
  return result
}

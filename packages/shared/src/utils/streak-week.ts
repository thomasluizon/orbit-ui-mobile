import { format, isSameDay, parseISO, startOfDay, subDays } from 'date-fns'
import type { StreakInfo } from '../types/gamification'

type StreakWeekDayStatus = 'active' | 'frozen' | 'missed' | 'today'

interface StreakWeekDay {
  date: Date
  dateStr: string
  dayNum: string
  status: StreakWeekDayStatus
  isToday: boolean
}

function getAccountToday(now: Date, timeZone?: string | null): Date {
  let accountDate: string
  try {
    const accountDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const year = accountDateParts.find((part) => part.type === 'year')?.value
    const month = accountDateParts.find((part) => part.type === 'month')?.value
    const day = accountDateParts.find((part) => part.type === 'day')?.value
    accountDate = `${year}-${month}-${day}`
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    accountDate = now.toISOString().slice(0, 10)
  }
  return startOfDay(parseISO(accountDate))
}

/**
 * Derives the streak timeline (ending today, seven days by default) from streak info.
 * All comparisons are midnight-anchored so the lastActiveDate day itself
 * counts as active regardless of the current time of day.
 */
export function buildStreakWeekDays(
  streakInfo: Pick<StreakInfo, 'lastActiveDate' | 'recentFreezeDates'> | null | undefined,
  currentStreak: number,
  isFrozenToday: boolean,
  now: Date = new Date(),
  length: 7 | 14 = 7,
  accountTimeZone?: string | null,
): StreakWeekDay[] {
  const today = getAccountToday(now, accountTimeZone)
  const freezeDates = new Set(streakInfo?.recentFreezeDates ?? [])
  const lastActive = streakInfo?.lastActiveDate
  const lastActiveDate = lastActive ? startOfDay(parseISO(lastActive)) : null

  return Array.from({ length }, (_, i) => {
    const date = subDays(today, length - 1 - i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const isTodayDate = i === length - 1

    let status: StreakWeekDayStatus = 'missed'

    if (isTodayDate) {
      if (isFrozenToday) status = 'frozen'
      else if (lastActiveDate && isSameDay(lastActiveDate, today)) status = 'active'
      else status = 'today'
    } else if (freezeDates.has(dateStr)) {
      status = 'frozen'
    } else if (lastActiveDate && currentStreak > 0) {
      const streakStart = subDays(lastActiveDate, currentStreak - 1)
      if (date >= streakStart && date <= lastActiveDate) {
        status = 'active'
      }
    }

    return {
      date,
      dateStr,
      dayNum: String(date.getDate()),
      status,
      isToday: isTodayDate,
    }
  })
}

import { format, isSameDay, parseISO, startOfDay, subDays } from 'date-fns'
import type { StreakInfo } from '../types/gamification'
import { formatAPIDateInTimeZone } from './dates'

type StreakWeekDayStatus = 'active' | 'frozen' | 'missed' | 'today'

interface StreakWeekDay {
  date: Date
  dateStr: string
  dayNum: string
  status: StreakWeekDayStatus
  isToday: boolean
}

function getAccountToday(now: Date, timeZone?: string | null): Date {
  return startOfDay(parseISO(formatAPIDateInTimeZone(now, timeZone)))
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

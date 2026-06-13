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

/**
 * Derives the 7-day streak timeline (ending today) from streak info.
 * All comparisons are midnight-anchored so the lastActiveDate day itself
 * counts as active regardless of the current time of day.
 */
export function buildStreakWeekDays(
  streakInfo: Pick<StreakInfo, 'lastActiveDate' | 'recentFreezeDates'> | null | undefined,
  currentStreak: number,
  isFrozenToday: boolean,
  now: Date = new Date(),
): StreakWeekDay[] {
  const today = startOfDay(now)
  const freezeDates = new Set(streakInfo?.recentFreezeDates ?? [])
  const lastActive = streakInfo?.lastActiveDate
  const lastActiveDate = lastActive ? startOfDay(parseISO(lastActive)) : null

  return Array.from({ length: 7 }, (_, i) => {
    const date = subDays(today, 6 - i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const isTodayDate = i === 6

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

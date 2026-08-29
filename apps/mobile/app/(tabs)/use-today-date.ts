import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { addDays, subDays } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  canNavigateToNextDay,
  formatAPIDate,
  formatLocaleDate,
} from '@orbit/shared/utils'

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000)
}

function getTodayDate(): string {
  return formatAPIDate(new Date())
}

export interface TodayDate {
  pinnedDateStr: string | null
  today: string
  selectedDateStr: string
  selectedDate: Date
  dateStr: string
  dayName: string
  numericDate: string
  nextDisabled: boolean
  goToPreviousDay: () => void
  goToNextDay: () => void
  goToToday: () => void
}

export function useTodayDate(): TodayDate {
  const { i18n } = useTranslation()
  const router = useRouter()
  const { date } = useLocalSearchParams<{ date?: string | string[] }>()
  const dateParam = Array.isArray(date) ? date[0] : date
  const pinnedDateStr = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null
  const [today, setToday] = useState(getTodayDate)
  const selectedDateStr = pinnedDateStr ?? today
  const selectedDate = useMemo(
    () => new Date(`${selectedDateStr}T00:00:00`),
    [selectedDateStr],
  )

  const goToPreviousDay = useCallback(() => {
    router.push(`/?date=${formatAPIDate(subDays(selectedDate, 1))}`)
  }, [router, selectedDate])
  const goToNextDay = useCallback(() => {
    if (!canNavigateToNextDay(selectedDateStr, today)) return
    router.push(`/?date=${formatAPIDate(addDays(selectedDate, 1))}`)
  }, [router, selectedDate, selectedDateStr, today])
  const goToToday = useCallback(() => router.navigate('/'), [router])

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null
    const reset = () => {
      if (rolloverTimer) globalThis.clearTimeout(rolloverTimer)
      rolloverTimer = globalThis.setTimeout(() => {
        setToday(getTodayDate())
        reset()
      }, getMillisecondsUntilNextLocalMidnight())
    }
    reset()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setToday(getTodayDate())
        reset()
      }
    })
    return () => {
      if (rolloverTimer) globalThis.clearTimeout(rolloverTimer)
      subscription.remove()
    }
  }, [])

  return {
    pinnedDateStr,
    today,
    selectedDateStr,
    selectedDate,
    dateStr: formatAPIDate(selectedDate),
    dayName: formatLocaleDate(selectedDate, i18n.language, { weekday: 'long' }),
    numericDate: formatLocaleDate(selectedDate, i18n.language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    nextDisabled: !canNavigateToNextDay(selectedDateStr, today),
    goToPreviousDay,
    goToNextDay,
    goToToday,
  }
}

'use client'

import { useCallback, useMemo } from 'react'
import { addDays, subDays, isToday } from 'date-fns'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { canNavigateToNextDay, formatAPIDate, formatLocaleDate } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { useToday } from './today-provider'

export interface TodayDateNavBundle {
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
}

export interface TodayNavigation {
  today: string
  selectedDate: Date
  dateStr: string
  isTodaySelected: boolean
  pinnedDateStr: string | null
  goToNextDay: () => void
  dateNav: TodayDateNavBundle
}

/**
 * Owns the Today screen's selected day and its navigation controls: resolves the
 * `?date=` deep link over the rolling `today`, derives the humanised date label,
 * and exposes the prev/today/next handlers plus the shared prop bundle consumed by
 * both the mobile and desktop date-navigation rows. Pure extraction of TodayPage.
 */
export function useTodayNavigation(): TodayNavigation {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const setActiveView = useUIStore((s) => s.setActiveView)

  const dateParam = searchParams.get('date')
  const pinnedDateStr = useMemo(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
    return null
  }, [dateParam])

  const today = useToday()
  const selectedDateStr = pinnedDateStr ?? today
  const selectedDate = useMemo(
    () => new Date(selectedDateStr + 'T00:00:00'),
    // react-doctor-disable-next-line exhaustive-deps -- selectedDateStr is derived from pinnedDateStr/today every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [selectedDateStr],
  )

  const goToPreviousDay = useCallback(() => {
    router.push(`/?date=${formatAPIDate(subDays(selectedDate, 1))}`)
  }, [router, selectedDate])

  const goToNextDay = useCallback(() => {
    if (!canNavigateToNextDay(formatAPIDate(selectedDate), today)) return
    router.push(`/?date=${formatAPIDate(addDays(selectedDate, 1))}`)
  }, [router, selectedDate, today])

  const goToToday = useCallback(() => {
    setActiveView('today')
    router.push('/')
  }, [router, setActiveView])

  const dayName = useMemo(
    () => formatLocaleDate(selectedDate, locale, { weekday: 'long' }),
    [selectedDate, locale],
  )
  const numericDate = useMemo(
    () => formatLocaleDate(selectedDate, locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [selectedDate, locale],
  )

  const isTodaySelected = isToday(selectedDate)

  const dateNav = useMemo<TodayDateNavBundle>(
    () => ({
      dayName,
      numericDate,
      isTodaySelected,
      nextDisabled: !canNavigateToNextDay(formatAPIDate(selectedDate), today),
      onGoToPreviousDay: goToPreviousDay,
      onGoToToday: goToToday,
      onGoToNextDay: goToNextDay,
      previousLabel: t('dates.previousDay'),
      todayLabel: t('dates.goToToday'),
      nextLabel: t('dates.nextDay'),
    }),
    [
      dayName,
      numericDate,
      isTodaySelected,
      goToPreviousDay,
      goToToday,
      goToNextDay,
      t,
      selectedDate,
      today,
    ],
  )

  return {
    today,
    selectedDate,
    dateStr: formatAPIDate(selectedDate),
    isTodaySelected,
    pinnedDateStr,
    goToNextDay,
    dateNav,
  }
}

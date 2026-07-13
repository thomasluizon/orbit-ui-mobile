'use client'

import { useCallback, useMemo, useState } from 'react'
import { addDays, subDays, isToday, isYesterday, isTomorrow } from 'date-fns'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatAPIDate, formatLocaleDate } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { useToday } from './today-provider'

export interface TodayDateNavBundle {
  dateLabel: string
  isTodaySelected: boolean
  slideDirection: 'left' | 'right'
  animateDateChange: boolean
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
}

export interface TodayNavigation {
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

  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right')
  const [hasNavigatedDate, setHasNavigatedDate] = useState(false)

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
    setSlideDirection('left')
    setHasNavigatedDate(true)
    router.push(`/?date=${formatAPIDate(subDays(selectedDate, 1))}`)
  }, [router, selectedDate])

  const goToNextDay = useCallback(() => {
    setSlideDirection('right')
    setHasNavigatedDate(true)
    router.push(`/?date=${formatAPIDate(addDays(selectedDate, 1))}`)
  }, [router, selectedDate])

  const goToToday = useCallback(() => {
    setSlideDirection(selectedDate > new Date() ? 'left' : 'right')
    setHasNavigatedDate(true)
    setActiveView('today')
    router.push('/')
  }, [router, selectedDate, setActiveView])

  const dateLabel = useMemo(() => {
    if (isToday(selectedDate)) return t('dates.today')
    if (isYesterday(selectedDate)) return t('dates.yesterday')
    if (isTomorrow(selectedDate)) return t('dates.tomorrow')
    return formatLocaleDate(selectedDate, locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }, [selectedDate, t, locale])

  const isTodaySelected = isToday(selectedDate)

  const dateNav = useMemo<TodayDateNavBundle>(
    () => ({
      dateLabel,
      isTodaySelected,
      slideDirection,
      animateDateChange: hasNavigatedDate,
      onGoToPreviousDay: goToPreviousDay,
      onGoToToday: goToToday,
      onGoToNextDay: goToNextDay,
      previousLabel: t('dates.previousDay'),
      todayLabel: t('dates.goToToday'),
      nextLabel: t('dates.nextDay'),
    }),
    [
      dateLabel,
      isTodaySelected,
      slideDirection,
      hasNavigatedDate,
      goToPreviousDay,
      goToToday,
      goToNextDay,
      t,
    ],
  )

  return {
    selectedDate,
    dateStr: formatAPIDate(selectedDate),
    isTodaySelected,
    pinnedDateStr,
    goToNextDay,
    dateNav,
  }
}

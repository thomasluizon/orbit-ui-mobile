'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { gamificationKeys } from '@orbit/shared/query'
import { formatAPIDate, formatAPIDateInTimeZone, millisecondsUntilNextDay } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useTodayTick } from './use-follow-today-sync'

const TodayContext = createContext<string | null>(null)

function getTodayDate(): string {
  return formatAPIDate(new Date())
}

/**
 * Holds the current local day and refreshes non-date-keyed gamification data
 * when the account day changes. Date-keyed queries re-key from `useToday`;
 * callers resolve a manually pinned `?date=` themselves.
 */
export function TodayProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const timeZone = profile?.timeZone
  const [today, setToday] = useState(getTodayDate)
  const todayRef = useRef(today)
  const accountDayRef = useRef(timeZone === undefined ? today : formatAPIDateInTimeZone(new Date(), timeZone))

  const handleRollover = useCallback(() => {
    const nextLocalDay = getTodayDate()
    if (nextLocalDay !== todayRef.current) {
      todayRef.current = nextLocalDay
      setToday(nextLocalDay)
    }
    const nextAccountDay = timeZone === undefined
      ? nextLocalDay
      : formatAPIDateInTimeZone(new Date(), timeZone)
    if (nextAccountDay !== accountDayRef.current) {
      accountDayRef.current = nextAccountDay
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    }
  }, [queryClient, timeZone])

  useTodayTick(handleRollover)

  useEffect(() => {
    accountDayRef.current = timeZone === undefined
      ? getTodayDate()
      : formatAPIDateInTimeZone(new Date(), timeZone)
    if (timeZone === undefined) return
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout>
    const scheduleRollover = () => {
      rolloverTimer = globalThis.setTimeout(() => {
        handleRollover()
        scheduleRollover()
      }, millisecondsUntilNextDay(new Date(), timeZone))
    }
    scheduleRollover()
    return () => globalThis.clearTimeout(rolloverTimer)
  }, [handleRollover, timeZone])

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>
}

/** The current day as a `YYYY-MM-DD` string, optionally in the account timezone. */
export function useToday(timeZone?: string | null): string {
  const today = useContext(TodayContext)
  const [, setAccountDateTick] = useState(0)
  useEffect(() => {
    if (timeZone === undefined) return
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout>
    const scheduleRollover = () => {
      rolloverTimer = globalThis.setTimeout(() => {
        setAccountDateTick((tick) => tick + 1)
        scheduleRollover()
      }, millisecondsUntilNextDay(new Date(), timeZone))
    }
    scheduleRollover()
    return () => globalThis.clearTimeout(rolloverTimer)
  }, [timeZone])
  if (today === null) {
    throw new Error('useToday must be used within a TodayProvider')
  }
  return timeZone === undefined ? today : formatAPIDateInTimeZone(new Date(), timeZone)
}

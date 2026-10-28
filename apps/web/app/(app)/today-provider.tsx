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
import { getAccountDay, millisecondsUntilNextDay } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useAccountClockSeed } from '@/lib/account-clock'
import { useTodayTick } from './use-follow-today-sync'

const TodayContext = createContext<{ now: number; timeZone: string | null } | null>(null)

export function TodayProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const seed = useAccountClockSeed()
  const timeZone = profile?.timeZone === undefined ? seed?.timeZone ?? null : profile.timeZone
  const [now, setNow] = useState(() => seed?.now ?? Date.now())
  const accountDayRef = useRef(getAccountDay(new Date(now), timeZone))

  const handleRollover = useCallback(() => {
    const nextNow = Date.now()
    const nextAccountDay = getAccountDay(new Date(nextNow), timeZone)
    setNow(nextNow)
    if (nextAccountDay !== accountDayRef.current) {
      accountDayRef.current = nextAccountDay
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    }
  }, [queryClient, timeZone])

  useTodayTick(handleRollover)

  useEffect(() => {
    const hydrationTimer = globalThis.setTimeout(handleRollover, 0)
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout>
    const scheduleRollover = () => {
      rolloverTimer = globalThis.setTimeout(() => {
        handleRollover()
        scheduleRollover()
      }, millisecondsUntilNextDay(new Date(), timeZone))
    }
    scheduleRollover()
    return () => {
      globalThis.clearTimeout(hydrationTimer)
      globalThis.clearTimeout(rolloverTimer)
    }
  }, [handleRollover, timeZone])

  return <TodayContext.Provider value={{ now, timeZone }}>{children}</TodayContext.Provider>
}

export function useToday(timeZone?: string | null): string {
  const clock = useContext(TodayContext)
  if (clock === null) {
    throw new Error('useToday must be used within a TodayProvider')
  }
  return getAccountDay(new Date(clock.now), timeZone === undefined ? clock.timeZone : timeZone)
}

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { gamificationKeys } from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
import { useTodayTick } from './use-follow-today-sync'

const TodayContext = createContext<string | null>(null)

function getTodayDate(): string {
  return formatAPIDate(new Date())
}

/**
 * Single owner of the app's day rollover. Holds the current local day
 * (`YYYY-MM-DD`) and, when the day actually changes, advances it and refreshes
 * date-dependent server state that isn't itself date-keyed (gamification:
 * streak, level/XP, achievements). Date-keyed queries (habits) refresh on their
 * own once consumers re-key off the new day. Consumers read the day via
 * `useToday`; a manually pinned `?date=` param is resolved by the caller.
 */
export function TodayProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient()
  const [today, setToday] = useState(getTodayDate)
  const todayRef = useRef(today)

  const handleRollover = useCallback(() => {
    const next = getTodayDate()
    if (next === todayRef.current) return
    todayRef.current = next
    setToday(next)
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
  }, [queryClient])

  useTodayTick(handleRollover)

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>
}

/** The current local day as a `YYYY-MM-DD` string, advancing on day rollover. */
export function useToday(): string {
  const today = useContext(TodayContext)
  if (today === null) {
    throw new Error('useToday must be used within a TodayProvider')
  }
  return today
}
